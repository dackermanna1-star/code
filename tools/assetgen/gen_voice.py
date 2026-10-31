"""Voice lines via Piper neural TTS + character processing (mono 44.1 kHz OGG).

Gojo  : en_US-ryan-high, brisk, presence + 'air' exciter, light short room.
Sukuna: en_US-norman-medium, slower; rubberband pitch-shift -3.5 st (formants
        preserved) + quiet octave-down layer, low-mid weight, darker top, light
        saturation and a short cavernous reverb.

Ellipses ("...") are rendered as deliberate dramatic pauses (Piper itself barely
pauses on them): the line is split there, each part synthesised separately and
re-joined with silence.

Environment overrides: JJK_PIPER (piper binary), JJK_VOICES (voice model dir).
"""
from __future__ import annotations

import os
import re
import subprocess
import sys
import tempfile
import wave

import numpy as np

import dsp as D
from dsp import ns, SR

ROOT = "/tmp/claude-0/-home-user-code/aede0ecb-3953-5b1e-8826-3459fd05f354/scratchpad"
PIPER = os.environ.get("JJK_PIPER", f"{ROOT}/ttsenv/bin/piper")
VOICES = os.environ.get("JJK_VOICES", f"{ROOT}/voices")
OUT = D.Path(__file__).resolve().parents[2] / "src/main/resources/assets/jjkshowdown/sounds/voice"

GOJO = {
    "domain": "Domain expansion... Unlimited Void.",
    "honored_one": "Throughout heaven and earth... I alone am the honored one.",
    "blue": "Cursed technique lapse... Blue.",
    "red": "Cursed technique reversal... Red.",
    "purple": "Hollow technique... Purple.",
    "purple_incantation": "Nine ropes. Polarized light. Crow and declaration. Between front and back.",
    "nah_id_win": "Nah... I'd win.",
    "strongest": "Don't worry. I'm the strongest.",
    "intro": "So you're the King of Curses. Let's see what you've got.",
    "taunt": "Is that all? You're boring me.",
    "victory": "That's what it means to be the strongest.",
    "defeat": "Heh... you really are strong.",
    "select": "Alright. Let's have some fun.",
    "infinity": "You can't touch me.",
    "clash": "Let's see whose domain is more refined.",
}
SUKUNA = {
    "domain": "Domain expansion... Malevolent Shrine.",
    "dismantle": "Dismantle.",
    "cleave": "Cleave.",
    "fuga": "Fuga.",
    "incantation": "Scale of the dragon. Recoil. Twin meteors.",
    "world_slash": "World... cutting slash.",
    "know_your_place": "Know your place... fool.",
    "stand_proud": "Stand proud. You are strong.",
    "intro": "So you are the strongest of this era. Entertain me.",
    "taunt": "How boring.",
    "victory": "I will remember you... for as long as I live.",
    "defeat": "Impossible... for me to fall here...",
    "select": "Hah. This body will do.",
    "clash": "Your barrier means nothing against my shrine.",
}

CFG = {
    "gojo": dict(model="en_US-ryan-high.onnx", length=0.92, noise=0.6, noise_w=0.6, sent_sil=0.28, pause=0.45),
    "sukuna": dict(model="en_US-norman-medium.onnx", length=1.1, noise=0.5, noise_w=0.45, sent_sil=0.38, pause=0.6),
}


# Texts that the VITS models render unreliably are respelled for synthesis only (same words):
#  - "Fuga." sometimes splits/babbles, "Fuga!" is consistently clean.
#  - a lone "Hah." makes the model babble; "Hah, this body ..." is stable.
SYNTH_TEXT = {("sukuna", "fuga"): "Fuga!", ("sukuna", "select"): "Hah, this body will do."}
TAKES = 3


# ------------------------------------------------------------------ tts
def read_wav(path):
    with wave.open(str(path)) as w:
        sr = w.getframerate()
        x = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(float) / 32768.0
        if w.getnchannels() > 1:
            x = x.reshape(-1, w.getnchannels()).mean(axis=1)
    return x, sr


def tts(text, cfg):
    with tempfile.TemporaryDirectory() as td:
        out = os.path.join(td, "o.wav")
        cmd = [PIPER, "-m", os.path.join(VOICES, cfg["model"]), "-f", out,
               "--length-scale", str(cfg["length"]), "--noise-scale", str(cfg["noise"]),
               "--noise-w-scale", str(cfg["noise_w"]), "--sentence-silence", "0"]
        subprocess.run(cmd, input=text.encode(), check=True, capture_output=True)
        return read_wav(out)


def units(text):
    """Split a line into sentence units: [(unit_text, pause_kind_after)] with pause kinds
    'dramatic' (at '...'), 'sentence' (between sentences) or None (end)."""
    chunks = [c.strip() for c in text.split("...")]
    chunks = [c for c in chunks if c]
    out = []
    for ci, chunk in enumerate(chunks):
        sents = [s.strip() for s in re.split(r"(?<=[.?!])\s+", chunk) if s.strip()]
        for si, sent in enumerate(sents):
            last_in_chunk = si == len(sents) - 1
            if last_in_chunk and ci < len(chunks) - 1 and not sent.endswith((".", ",", "?", "!")):
                sent += ","
            if last_in_chunk and ci == len(chunks) - 1 and not sent.endswith((".", "?", "!")):
                sent += "."
            kind = None
            if not last_in_chunk:
                kind = "sentence"
            elif ci < len(chunks) - 1:
                kind = "dramatic"
            out.append((sent, kind))
    return out


def first_burst(x, sr, unit_text, thr_db=-40):
    """Keep the first continuous speech burst; drops end-of-utterance babble that VITS voices
    sometimes produce after short inputs (separated from the real word by a silent gap)."""
    hop = int(sr * 0.01)
    env = np.sqrt(D.moving_avg_centered(x ** 2, hop))
    on = env > env.max() * D.db(thr_db)
    nf = len(on) // hop
    onf = on[:nf * hop].reshape(nf, hop).any(axis=1)
    idx = np.nonzero(onf)[0]
    if len(idx) == 0:
        return x
    gap_frames = int((0.6 if "," in unit_text.rstrip(",") else 0.2) / 0.01)
    start, last_on, run, end = idx[0], idx[0], 0, idx[-1]
    for i in range(start, nf):
        if onf[i]:
            run = 0
            last_on = i
        else:
            run += 1
            if run >= gap_frames:
                end = last_on
                break
    a = max(0, start * hop - int(0.01 * sr))
    b = min(len(x), (end + 1) * hop + int(0.03 * sr))
    y = x[a:b].copy()
    f = int(0.005 * sr)
    y[:f] *= np.linspace(0, 1, f)
    y[-f:] *= np.linspace(1, 0, f)
    return y


def synth_line(text, cfg):
    from concurrent.futures import ThreadPoolExecutor
    us = units(text)
    jobs = [(u, k) for u, _ in us for k in range(TAKES)]
    with ThreadPoolExecutor(max_workers=3) as ex:
        res = list(ex.map(lambda j: tts(j[0], cfg), jobs))
    sr0 = res[0][1]
    out = []
    for ui, (u, kind) in enumerate(us):
        takes = [first_burst(res[ui * TAKES + k][0], sr0, u) for k in range(TAKES)]
        lens = [len(t) for t in takes]
        med = takes[int(np.argsort(lens)[len(lens) // 2])]
        out.append(med)
        if kind == "dramatic":
            out.append(np.zeros(int(sr0 * cfg["pause"])))
        elif kind == "sentence":
            out.append(np.zeros(int(sr0 * cfg["sent_sil"])))
    return np.concatenate(out), sr0


def to44k(x, sr):
    pad = int(0.25 * sr)
    xp = np.concatenate([np.zeros(pad), x, np.zeros(pad)])
    n_out = int(round(len(xp) * SR / sr))
    y = D.fft_resample(xp, n_out)
    p2 = int(round(pad * SR / sr))
    return y[p2:len(y) - p2]


def rubberband(x, ratio, formant="preserved"):
    pad = ns(0.3)
    xp = np.concatenate([np.zeros(pad), x, np.zeros(pad)]).astype("<f4")
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "pipe:0",
           "-af", f"rubberband=pitch={ratio:.6f}:formant={formant}:pitchq=quality:transients=mixed:window=standard",
           "-f", "f32le", "-ac", "1", "-ar", str(SR), "pipe:1"]
    y = np.frombuffer(subprocess.run(cmd, input=xp.tobytes(), capture_output=True, check=True).stdout, "<f4")
    y = y.astype(float)
    # align to the input (rubberband may add latency): cross-correlate envelopes
    m = min(len(y), len(xp))
    a = np.abs(xp[:m])
    b = np.abs(y[:m])
    ea = D.moving_avg_centered(a, 220)
    eb = D.moving_avg_centered(b, 220)
    L = 1 << int(np.ceil(np.log2(2 * m)))
    c = np.fft.irfft(np.fft.rfft(eb, L) * np.conj(np.fft.rfft(ea, L)), L)
    lag = int(np.argmax(np.concatenate([c[:ns(0.2)], c[-ns(0.2):]])))
    if lag >= ns(0.2):
        lag = lag - 2 * ns(0.2)
    y = np.roll(y, -lag)[:len(xp)] if lag else y[:len(xp)]
    if len(y) < len(xp):
        y = np.concatenate([y, np.zeros(len(xp) - len(y))])
    return y[pad:pad + len(x)]


def speech_bounds(x, thr_db=-42):
    env = np.sqrt(D.moving_avg_centered(x ** 2, ns(0.005)))
    thr = env.max() * D.db(thr_db)
    idx = np.nonzero(env > thr)[0]
    return int(idx[0]), int(idx[-1])


# ------------------------------------------------------------------ characters
def process_gojo(x):
    x = D.highpass(x, 85, 2)
    x = D.filt(x, D.H_mul(D.H_peak(3200, 1.1, 2.0), D.H_hshelf(7000, 3.0, 1), D.H_peak(250, 1.0, -1.5)))
    # 'air' exciter: synthesise gentle content above the TTS bandwidth (11 kHz)
    hf = D.highpass(x, 4500, 2)
    harm = np.tanh(hf * 6.0) / 6.0
    x = x + D.highpass(harm, 10500, 4) * 0.5
    x = D.compress(x / np.max(np.abs(x)), thresh_db=-20, ratio=2.5, attack=0.003, release=0.08)
    return x


def process_sukuna(x):
    main = rubberband(x, 2 ** (-3.5 / 12), "preserved")
    sub = rubberband(x, 0.5, "shifted")
    sub = D.lowpass(sub, 1800, 2)
    m = main / np.max(np.abs(main))
    s = sub / (np.max(np.abs(sub)) + 1e-9)
    y = m + s * D.db(-10)
    y = D.highpass(y, 55, 2)
    y = D.filt(y, D.H_mul(D.H_peak(200, 0.8, 3.0), D.H_peak(3400, 1.0, -3.0), D.H_lp(7500, 2),
                          D.H_peak(900, 1.2, -1.0)))
    y = y / np.max(np.abs(y))
    y = 0.65 * y + 0.35 * D.drive(y, 2.2)          # light saturation
    y = D.compress(y, thresh_db=-22, ratio=3.0, attack=0.004, release=0.1)
    return y


def render(who, key, text):
    cfg = CFG[who]
    raw, sr = synth_line(SYNTH_TEXT.get((who, key), text), cfg)
    x = to44k(raw, sr)
    x = np.concatenate([np.zeros(ns(0.2)), x, np.zeros(ns(1.2))])     # room for trim + reverb tail
    s, e = speech_bounds(x)                 # trim points from the clean TTS timeline
    dry = process_gojo(x) if who == "gojo" else process_sukuna(x)
    # silence anything the processing leaked far past the speech (keeps the 300 ms tail clean)
    gate = np.ones(len(dry))
    g0 = e + ns(0.30)
    gate[g0:] = 0.0
    dry = dry * gate
    if who == "gojo":
        wet = D.add_reverb(dry, rt60=0.55, wet=0.16, predelay=0.012, bright=0.75, seed=71)
    else:
        wet = D.add_reverb(dry, rt60=1.0, wet=0.24, predelay=0.025, bright=0.3, seed=72)
    a = max(0, s - ns(0.08))
    b = min(len(wet), e + ns(0.30))
    y = wet[a:b]
    y = D.fade(y, 0.004, 0.12)
    y = y - np.mean(y)
    path, peak = D.write_ogg_checked(y, OUT / who / f"{key}.ogg", peak_db=-1.0, normalize_peak=True)
    return len(y) / SR, peak


def main(only=None):
    for who, lines in (("gojo", GOJO), ("sukuna", SUKUNA)):
        for key, text in lines.items():
            if only and f"{who}/{key}" not in only and who not in only:
                continue
            dur, peak = render(who, key, text)
            print(f"voice/{who}/{key:20s} {dur:5.2f}s peak {peak:6.2f} dBFS  | {text}")


if __name__ == "__main__":
    main(sys.argv[1:] or None)
