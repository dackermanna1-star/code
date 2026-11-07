#!/usr/bin/env python3
"""
Pre-render every cabin / flight-deck announcement of src/flight/announcements.js
with an offline neural TTS (Piper) and give it an authentic aircraft PA sound.

Output (committed to the repo, loaded at runtime by src/audio/announcer.js):
    assets/audio/announcements/<id>.ogg      mono Opus, ~40 kbps
    assets/audio/announcements/index.json    {id: {speaker, duration, sentences: [{t, text}]}}
`t` is the start of each sentence in seconds from the start of the .ogg (the chime is
NOT part of the file - the runtime plays it through the PA bus first).

Requirements:  pip install piper-tts numpy ; ffmpeg with libopus ; node (to read the JS script)
Voices (public-domain datasets, see assets/credits/audio.md), downloaded from
https://huggingface.co/rhasspy/piper-voices :
    captain : en_US-norman-medium   (male,   LibriVox recordings, public domain)
    purser  : en_US-ljspeech-high   (female, LJ Speech dataset,  public domain)

Usage:
    python3 src/audio/tools/gen_announcements.py --voices <dir with .onnx/.onnx.json> [--only id1,id2] [--tmp <dir>]

Pipeline per announcement:
  1. split the text into sentences, synthesise each one separately (so we know the timings),
     trim the TTS silence, join with natural pauses (longer after a full stop, slight random jitter);
  2. ffmpeg "PA chain": band-limit 250-4000 Hz (cabin ceiling speakers), presence peak, light
     tanh saturation of the amplifier, compression, a short early-reflection cabin reverb;
     the captain's handset gets a narrower band, more compression and a slightly more distant
     (wetter) sound, because it is the flight-deck handset routed through the interphone;
  3. loudness-normalise and encode to mono Opus.
"""
import argparse
import json
import os
import random
import re
import subprocess
import sys
import tempfile
import wave

import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
OUT_DIR = os.path.join(ROOT, 'assets', 'audio', 'announcements')

VOICES = {
    'captain': {'model': 'en_US-norman-medium', 'length_scale': 1.06, 'noise_scale': 0.62, 'noise_w': 0.8},
    'purser': {'model': 'en_US-ljspeech-high', 'length_scale': 1.02, 'noise_scale': 0.6, 'noise_w': 0.8},
}

# ffmpeg filter chains (input: 22.05 kHz mono float).  Values were tuned by measuring spectra
# (see the module README in src/audio/README.md) - the goal is "real PA", intelligible but band-limited.
PA_COMMON = (
    'highpass=f=260:poles=2,highpass=f=220:poles=2,'
    'lowpass=f=4300:poles=2,lowpass=f=4800:poles=2,'
    'equalizer=f=2400:t=q:w=1.1:g=4,equalizer=f=700:t=q:w=1.2:g=-2,'
)
CHAINS = {
    # cabin handset at the forward attendant station
    'purser': PA_COMMON + (
        'acompressor=threshold=0.12:ratio=3.5:attack=4:release=90:makeup=2.2,'
        "aeval='tanh(1.6*val(0))/tanh(1.6)':c=same,"
        'aecho=0.9:0.55:11|23|37|53:0.22|0.14|0.09|0.05,'
        'loudnorm=I=-17:TP=-2:LRA=7'
    ),
    # flight-deck handset: narrower, more compressed, a touch more distant / boxy
    'captain': PA_COMMON + (
        'highpass=f=330:poles=2,lowpass=f=3500:poles=2,equalizer=f=1500:t=q:w=1.0:g=3,'
        'acompressor=threshold=0.08:ratio=5:attack=3:release=120:makeup=2.6,'
        "aeval='tanh(2.2*val(0))/tanh(2.2)':c=same,"
        'aecho=0.85:0.6:9|19|31|47|71:0.26|0.18|0.12|0.07|0.04,'
        'loudnorm=I=-18:TP=-2:LRA=6'
    ),
}


def load_script():
    js = os.path.join(ROOT, 'src', 'flight', 'announcements.js')
    code = f"import {{ ANNOUNCEMENTS }} from {json.dumps('file://' + js)}; console.log(JSON.stringify(ANNOUNCEMENTS));"
    out = subprocess.check_output(['node', '--input-type=module', '-e', code])
    return json.loads(out)


def split_sentences(text):
    parts = re.split(r'(?<=[.!?])\s+', text.strip())
    return [p.strip() for p in parts if p.strip()]


def trim(a, sr, thr=0.012, pad=0.03):
    idx = np.where(np.abs(a) > thr)[0]
    if len(idx) == 0:
        return a
    s = max(0, idx[0] - int(pad * sr))
    e = min(len(a), idx[-1] + int(pad * 1.6 * sr))
    return a[s:e]


def synth(voice, syn_cfg, text):
    chunks = list(voice.synthesize(text, syn_config=syn_cfg))
    sr = chunks[0].sample_rate
    a = np.concatenate([c.audio_float_array for c in chunks]).astype(np.float32)
    return a, sr


def write_wav(path, a, sr):
    a = np.clip(a, -1, 1)
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes((a * 32767).astype(np.int16).tobytes())


def probe_duration(path):
    # exact decoded length (what decodeAudioData returns), not the container estimate
    raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', '48000', '-f', 's16le', '-'])
    return len(raw) / 2 / 48000.0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--voices', required=True, help='directory containing the Piper .onnx + .onnx.json files')
    ap.add_argument('--only', default='', help='comma separated ids')
    ap.add_argument('--tmp', default=None)
    ap.add_argument('--bitrate', default='40k')
    args = ap.parse_args()

    from piper import PiperVoice
    from piper.config import SynthesisConfig

    script = load_script()
    only = set(filter(None, args.only.split(',')))
    tmp = args.tmp or tempfile.mkdtemp(prefix='pa_')
    os.makedirs(tmp, exist_ok=True)
    os.makedirs(OUT_DIR, exist_ok=True)

    index_path = os.path.join(OUT_DIR, 'index.json')
    index = {}
    if os.path.exists(index_path):
        try:
            index = json.load(open(index_path))
        except Exception:
            index = {}

    loaded = {}
    rnd = random.Random(482)
    for aid, ann in script.items():
        if only and aid not in only:
            continue
        spk = ann['speaker']
        vc = VOICES[spk]
        if spk not in loaded:
            loaded[spk] = PiperVoice.load(os.path.join(args.voices, vc['model'] + '.onnx'))
        voice = loaded[spk]
        cfg = SynthesisConfig(length_scale=vc['length_scale'], noise_scale=vc['noise_scale'], noise_w_scale=vc['noise_w'])

        sentences = split_sentences(ann['text'])
        pieces, timings = [], []
        sr = None
        lead = 0.22  # a short breath before speaking (handset keyed)
        t = lead
        for i, s in enumerate(sentences):
            a, sr = synth(voice, cfg, s)
            a = trim(a, sr)
            if not pieces:
                pieces.append(np.zeros(int(lead * sr), np.float32))
            timings.append({'t': round(t, 3), 'text': s})
            pieces.append(a)
            t += len(a) / sr
            if i < len(sentences) - 1:
                gap = 0.36 + rnd.uniform(-0.05, 0.09)
                pieces.append(np.zeros(int(gap * sr), np.float32))
                t += gap
        pieces.append(np.zeros(int(0.45 * sr), np.float32))  # tail for the reverb
        audio = np.concatenate(pieces)
        audio *= 0.7 / max(1e-6, np.abs(audio).max())

        raw = os.path.join(tmp, f'{aid}.wav')
        write_wav(raw, audio, sr)
        out = os.path.join(OUT_DIR, f'{aid}.ogg')
        cmd = ['ffmpeg', '-y', '-v', 'error', '-i', raw, '-af', CHAINS[spk] + ',aresample=48000',
               '-ac', '1', '-c:a', 'libopus', '-b:a', args.bitrate, '-application', 'voip',
               '-vbr', 'on', '-compression_level', '10', out]
        subprocess.check_call(cmd)
        dur = probe_duration(out)
        index[aid] = {'speaker': spk, 'duration': round(dur, 3), 'sentences': timings}
        print(f'{aid:18s} {spk:8s} {dur:6.2f}s  {len(sentences)} sentences  {os.path.getsize(out) // 1024} KB')

    ordered = {k: index[k] for k in script if k in index}
    with open(index_path, 'w') as f:
        json.dump(ordered, f, indent=1)
    print('wrote', index_path)


if __name__ == '__main__':
    sys.exit(main())
