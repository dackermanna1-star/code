"""The recorded cast: every line in the campaign, spoken by Kokoro-82M (offline), one MP3 per line,
with its loudness envelope (the lips move with it) and a manifest keyed the way the game looks a
line up (voice.ts lineId: FNV-1a over who|plain, base36).

Usage: python -I gen.py --models <dir with kokoro-v1.0.onnx, voices-v1.0.bin> --lines lines.json
                        --out /home/user/code/public/audio/voice [--only WHO] [--limit N]
"""
import argparse, base64, json, math, pathlib, re, subprocess, sys, tempfile, time

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

# who: (voice, speed, semitones)
CAST = {
    'SCARLET': ('af_heart', 1.0, 0),
    'IVY': ('af_bella', 1.04, 0),
    'VIPER': ('bf_emma', 0.93, 0),
    'LENA': ('af_nova', 1.04, 0),
    'VOSS': ('bm_george', 0.92, 0),
    'KAEL': ('am_fenrir', 0.95, -1),
    'VARGA': ('bm_fable', 0.98, 0),
    'THE BUTCHER': ('am_michael', 0.9, -3),
    'DOYLE': ('am_onyx', 0.92, -2),
    'BRANKO': ('am_adam', 0.93, -2),
    'DEZ': ('am_liam', 1.06, 0),
    'BOUNCER': ('am_eric', 0.96, -1),
    'TOMAS': ('am_echo', 1.04, 0),
    'MARCO': ('am_puck', 1.06, 0),
    'SAL': ('am_echo', 1.0, -1),
    'TEO': ('am_liam', 1.02, 1),
    'KX': ('am_eric', 1.08, 0),
    'GUARD': ('am_michael', 1.03, 0),
    'OWENS': ('bm_daniel', 1.0, 0),
    'THE WARDEN': ('bm_lewis', 0.92, -2),
    'DRIVER': ('am_puck', 1.02, -1),
}
FALLBACK = {'f': 'af_heart', 'm': 'am_michael'}
ACRONYMS = {'KX', 'DJ', 'VIP', 'PA', 'ID', 'OK', 'TV', 'CCTV'}


def line_id(who: str, plain: str) -> str:
    s = who + '|' + re.sub(r'<[^>]+>', '', plain)
    h = 2166136261
    b = s.encode('utf-16-le')
    for i in range(0, len(b), 2):
        h ^= b[i] | (b[i + 1] << 8)
        h = (h * 16777619) & 0xFFFFFFFF
    digits = '0123456789abcdefghijklmnopqrstuvwxyz'
    out = ''
    while True:
        h, r = divmod(h, 36)
        out = digits[r] + out
        if h == 0:
            return out


def for_speech(plain: str) -> str:
    t = re.sub(r'\([^)]*\)', ' ', plain)
    t = re.sub(r'\s*—\s*$', '', t.strip())          # (cut off: the line just stops)
    t = re.sub(r'\s*—\s*', ', ', t)
    t = re.sub(r'\bB(\d)\b', lambda m: 'B ' + ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'][int(m.group(1))], t)

    def word(m):
        w = m.group(0)
        if w in ACRONYMS:
            return ' '.join(w) if w not in ('OK',) else 'okay'
        return w.capitalize()
    t = re.sub(r"\b[A-Z]{2,}\b", word, t)
    t = re.sub(r'\s+', ' ', t).strip()
    t = re.sub(r'^[,.\s]+', '', t)
    return t


def ff(args, data=None):
    return subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', *args], input=data, capture_output=True, check=True).stdout


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--models', required=True)
    ap.add_argument('--lines', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--only', default=None)
    ap.add_argument('--limit', type=int, default=0)
    a = ap.parse_args()
    md = pathlib.Path(a.models)
    kokoro = Kokoro(str(md / 'kokoro-v1.0.onnx'), str(md / 'voices-v1.0.bin'))
    have = set(kokoro.get_voices())
    lines = json.load(open(a.lines))
    if a.only:
        lines = [l for l in lines if l['who'] == a.only]
    if a.limit:
        lines = lines[: a.limit]
    out = pathlib.Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    man_p = out / 'manifest.json'
    manifest = json.load(open(man_p)) if man_p.exists() else {}
    tmp = pathlib.Path(tempfile.mkdtemp())
    t0 = time.time()
    total = 0.0
    for i, l in enumerate(lines):
        who, plain = l['who'], l['plain']
        voice, speed, semi = CAST.get(who, (FALLBACK['m'], 1.0, 0))
        if voice not in have:
            voice = FALLBACK['f' if voice.startswith(('af', 'bf')) else 'm']
        text = for_speech(plain)
        if not re.search(r'[A-Za-z]', text):
            continue
        lang = 'en-gb' if voice.startswith('b') else 'en-us'
        samples, sr = kokoro.create(text, voice=voice, speed=speed, lang=lang)
        wav = tmp / 'l.wav'
        sf.write(wav, samples, sr)
        # the voice (pitched for the heavier men), the radio's band, the truck's steel; trimmed,
        # levelled
        fx = []
        if semi:
            k = 2 ** (semi / 12)
            fx += [f'asetrate={sr}*{k:.5f}', f'aresample={sr}', f'atempo={1 / k:.5f}']
        low = plain.lower()
        if '(radio)' in low or '(speaker)' in low:
            fx += ['highpass=f=320', 'lowpass=f=3200', 'volume=1.8', 'alimiter=limit=0.6']
        elif 'through the steel' in low:
            fx += ['lowpass=f=950', 'volume=1.5']
        fx += ['silenceremove=start_periods=1:start_threshold=-48dB',
               'areverse', 'silenceremove=start_periods=1:start_threshold=-48dB', 'areverse',
               'adelay=30', 'apad=pad_dur=0.12', 'loudnorm=I=-17:TP=-1.5:LRA=9']
        lid = line_id(who, plain)
        mp3 = out / f'{lid}.mp3'
        ff(['-i', str(wav), '-af', ','.join(fx), '-ar', '24000', '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '48k', str(mp3)])
        # the envelope from what will actually play: loudness at 50 a second, 0..255
        pcm = np.frombuffer(ff(['-i', str(mp3), '-f', 'f32le', '-ac', '1', '-ar', '24000', '-']), dtype=np.float32)
        hop = 24000 // 50
        n = max(1, math.ceil(len(pcm) / hop))
        rms = np.array([np.sqrt(np.mean(pcm[j * hop:(j + 1) * hop] ** 2) + 1e-12) for j in range(n)])
        ref = np.percentile(rms[rms > 1e-4], 95) if np.any(rms > 1e-4) else 1.0
        env = np.clip((rms / max(ref, 1e-6)) ** 0.8 * 255, 0, 255).astype(np.uint8)
        dur = len(pcm) / 24000
        total += dur
        manifest[lid] = {'file': f'audio/voice/{lid}.mp3', 'dur': round(dur, 3), 'env': base64.b64encode(env.tobytes()).decode()}
        print(f'[{i + 1}/{len(lines)}] {who:12s} {voice:10s} {dur:5.2f}s  {text[:70]}', flush=True)
        if (i + 1) % 20 == 0:
            json.dump(manifest, open(man_p, 'w'), separators=(',', ':'))
    json.dump(manifest, open(man_p, 'w'), separators=(',', ':'))
    print(f'{len(lines)} lines, {total:.0f}s of speech, in {time.time() - t0:.0f}s')


if __name__ == '__main__':
    main()
