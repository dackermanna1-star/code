#!/usr/bin/env python3
"""Chinatown sounds and music (SPEC section 3.4).

Builds every DS* sound lump as 8-bit DMX (11025 Hz; 22050 Hz for the long
loops) and the two MIDI music lumps, staged in build/ct/lumps/{sounds,music}/
for tools/ct/pack.mjs:

    python3 tools/ct/audio.py            build everything (downloads what's missing)
    python3 tools/ct/audio.py --report   also write the listening-check report
    python3 tools/ct/audio.py --only WELD,HELI

Sources are CC0 sound packs from OpenGameArt, downloaded into the asset cache
(build/ct/cache, or $CT_CACHE). Archives are unpacked with zipfile / py7zr
into build/ct/cache/audio_x/<pack>/ and never executed (7z needs py7zr:
pip install py7zr, or point $CT_PYLIBS at a directory that has it). Where
no free recording fits, the layer is synthesized here with numpy (the weld
torch, the roll-up gate's motor hum and slat clatter, radio squelch, ladder
rung ring, mains hum). Every pack used is credited in
tools/ct/credits/audio.md (written by this script). Output is deterministic:
a rebuild from an empty cache gives byte-identical lumps.

Previews (16-bit WAV of the exact 8-bit lump data, spectrogram PNGs) go to
build/ct/previews/audio/.
"""

import argparse
import json
import os
import struct
import subprocess
import sys
import tempfile
import urllib.parse
import urllib.request
import zipfile

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lib'))
import doomgfx as dg  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = dg.CACHE
XDIR = os.path.join(CACHE, 'audio_x')
PREVIEW = os.path.join(dg.BUILD, 'previews', 'audio')
CREDITS_MD = os.path.join(HERE, 'credits', 'audio.md')
OGA = 'https://opengameart.org/sites/default/files/'
SR = 11025

# --------------------------------------------------------------------------
# Sources: cache directory -> where it came from. All CC0.
# --------------------------------------------------------------------------

PACKS = {
    'snd_oga_zombies_sound_pack_artisticdude': dict(
        title='Zombies Sound Pack', author='artisticdude', page='https://opengameart.org/content/zombies-sound-pack',
        files=[OGA + 'zombies.zip']),
    'snd_oga_zombie_voice_effects_arcadeparty': dict(
        title='Zombie / Skeleton / Monster Voice Effects', author='arcadeparty',
        page='https://opengameart.org/content/zombie-skeleton-monster-voice-effects',
        files=[(OGA + 'Voice%20Effects%20Zombie-Skeleton-Monster%20Human%20Male.zip', 'voice_effects_zombie.zip')]),
    'snd_oga_zombie_moans_darsycho': dict(
        title='Zombie moans', author='darsycho', page='https://opengameart.org/content/zombie-moans',
        files=[(OGA + 'darsycho__zombie-moans.ogg', 'darsycho__zombie-moans.ogg')]),
    'snd_oga_zombie_moans_emopreben': dict(
        title='Zombie Moans 01', author='EmoPreben', page='https://opengameart.org/content/zombie-moans-01-by-emopreben',
        files=[OGA + 'zombiemoans_-_wav.zip']),
    'snd_oga_3_melee_sounds_remaxim': dict(
        title='3 Melee sounds', author='remaxim', page='https://opengameart.org/content/3-melee-sounds',
        files=[(OGA + 'melee%20sounds.zip', 'melee_sounds.zip')]),
    'snd_oga_impact_qubodup': dict(
        title='Impact', author='qubodup', page='https://opengameart.org/content/impact',
        files=[OGA + 'qubodupImpact.7z']),
    'snd_oga_squish_ezduzziteh': dict(
        title='Squish Sounds Effects', author='ezduzziteh', page='https://opengameart.org/content/squish-sounds-effects',
        files=[OGA + 'squish_02.mp3']),
    'snd_oga_helicopter_sounds_aquinn': dict(
        title='Helicopter Sounds', author='aquinn', page='https://opengameart.org/content/helicopter-sounds',
        files=[OGA + 'helicopter_0.mp3']),
    'snd_oga_generator_loop_ycbcr': dict(
        title='Generator (loop)', author='ycbcr', page='https://opengameart.org/content/generator-loop',
        files=[OGA + 'loop_generator_1.mp3']),
    'snd_oga_car_engine_start_looneybits': dict(
        title='Car engine start 01 / Car engine Start Up 02', author='looneybits',
        page='https://opengameart.org/content/car-engine-start-01',
        files=[OGA + 'generic_car_startengine.wav']),
    'snd_oga_elevator_door_pagdev': dict(
        title='Elevator_Door', author='pagdev', page='https://opengameart.org/content/elevatordoor',
        files=[OGA + 'elevator_door.wav']),
    'snd_oga_chain_winch_bart': dict(
        title='Chain winch sounds', author='bart (Bart Kelsey)', page='https://opengameart.org/content/chain-winch-sounds',
        files=[OGA + 'winch.zip']),
    'snd_oga_electricity_bmaczero': dict(
        title='Electricity Sound Effects', author='bmaczero', page='https://opengameart.org/content/electricity-sound-effects-0',
        files=[OGA + 'continuousspark.wav']),
    'snd_oga_radio_noise_kresiek': dict(
        title='Radio Noise 1', author='kresiek-the-furry', page='https://opengameart.org/content/radio-noise-1',
        files=[OGA + 'radio_noise_loop.wav']),
    'snd_oga_zombie_news_radio_zisongbr': dict(
        title='Zombie news in Radio', author='zisongbr', page='https://opengameart.org/content/zombie-news-in-radio',
        files=[OGA + 'radio_news_zombies.mp3']),
    'snd_oga_glass_break_tinyworlds': dict(
        title='Glass Break', author='tinyworlds', page='https://opengameart.org/content/glass-break',
        files=[OGA + 'glass_breaking.wav']),
    'snd_oga_breaking_falling_rubberduck': dict(
        title='75 CC0 breaking / falling / hit sfx', author='rubberduck',
        page='https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx',
        files=[OGA + 'sfx_breaking_and_falling.zip']),
    'snd_oga_wood_crack_qubodup': dict(
        title='35 wooden cracks/hits/destructions', author='qubodup (Independent.nu Ljudbank)',
        page='https://opengameart.org/content/35-wooden-crackshitsdestructions',
        files=[OGA + 'independent_nu_ljudbank-wood_crack_hit_destruction.7z']),
    'snd_oga_metal_wood_rubberduck': dict(
        title='100 CC0 metal and wood SFX', author='rubberduck',
        page='https://opengameart.org/content/100-cc0-metal-and-wood-sfx',
        files=[OGA + '100-CC0-wood-metal-SFX.zip']),
    'snd_oga_water_splash_rubberduck': dict(
        title='40 CC0 water / splash / slime SFX', author='rubberduck',
        page='https://opengameart.org/content/40-cc0-water-splash-slime-sfx',
        files=[OGA + 'water-splash-slime-sfx.zip']),
    'snd_oga_metal_footsteps_thimras': dict(
        title='Metal footsteps on concrete', author='thimras', page='https://opengameart.org/content/metal-footsteps-on-concrete',
        files=[OGA + 'metal_steps_48k24b.7z']),
    'snd_oga_plug_in_out_cleytonkauffman': dict(
        title='SFX - Plug In, Plug Out', author='cleytonkauffman', page='https://opengameart.org/content/sfx-plug-in-plug-out',
        files=[(OGA + 'Plug%20In%2C%20Plug%20Out.zip', 'Plug_In,_Plug_Out.zip')]),
    'snd_oga_circuit_breaker_cleytonkauffman': dict(
        title='SFX - Circuit breaker', author='cleytonkauffman', page='https://opengameart.org/content/sfx-circuit-breaker',
        files=[(OGA + 'Circuit%20Breaker.zip', 'Circuit_Breaker.zip')]),
    'mus_oga_cc0_midi': dict(
        title='CC0 MIDI music', author='see music table', page='https://opengameart.org/',
        files=[(OGA + 'Night%20of%20the%20Streets.mid', 'Night%20of%20the%20Streets.mid'),
               (OGA + 'Endless%20Pain%20of%20Nightmares.mid', 'Endless%20Pain%20of%20Nightmares.mid')]),
}

USED = {}  # pack dir -> set of member files used (filled while building)


def fetch(pack):
    """Make sure every file of a pack is in the cache; returns its dir."""
    info = PACKS[pack]
    d = os.path.join(CACHE, pack)
    os.makedirs(d, exist_ok=True)
    for f in info['files']:
        url, name = f if isinstance(f, tuple) else (f, os.path.basename(urllib.parse.unquote(f)).replace(' ', '_'))
        path = os.path.join(d, name)
        if os.path.exists(path) and os.path.getsize(path) > 0:
            continue
        print('  download', url)
        req = urllib.request.Request(url, headers={'User-Agent': 'ct-audio-build/1.0'})
        with urllib.request.urlopen(req, timeout=120) as r:
            data = r.read()
        with open(path + '.part', 'wb') as fo:
            fo.write(data)
        os.replace(path + '.part', path)
    return d


def _py7zr():
    try:
        import py7zr  # noqa: F401
    except ImportError:
        for p in filter(None, [os.environ.get('CT_PYLIBS'), os.path.join(os.path.dirname(os.path.realpath(CACHE)), 'pylibs')]):
            if os.path.isdir(p) and p not in sys.path:
                sys.path.append(p)
    import py7zr
    return py7zr


def extracted(pack):
    """Unpack every archive of a pack (once) into audio_x/<pack>/; returns that dir."""
    d = fetch(pack)
    out = os.path.join(XDIR, pack)
    stamp = os.path.join(out, '.done')
    if os.path.exists(stamp):
        return out
    os.makedirs(out, exist_ok=True)
    for name in sorted(os.listdir(d)):
        path = os.path.join(d, name)
        sub = os.path.join(out, os.path.splitext(name)[0])
        if name.lower().endswith('.zip'):
            with zipfile.ZipFile(path) as z:
                for m in z.infolist():
                    base = m.filename.replace('\\', '/')
                    if m.is_dir() or '__MACOSX' in base or os.path.basename(base).startswith('._') or base.endswith('.DS_Store'):
                        continue
                    dest = os.path.normpath(os.path.join(sub, base))
                    if not dest.startswith(sub + os.sep):
                        continue  # no path escapes
                    os.makedirs(os.path.dirname(dest), exist_ok=True)
                    with z.open(m) as fi, open(dest, 'wb') as fo:
                        fo.write(fi.read())
        elif name.lower().endswith('.7z'):
            py7zr = _py7zr()
            with py7zr.SevenZipFile(path) as z:
                names = [n for n in z.getnames() if not n.endswith('.DS_Store') and '..' not in n.split('/')]
                z.extract(path=sub, targets=names)
    open(stamp, 'w').close()
    return out


def src(pack, member):
    """Path of a source file: inside the extracted archive tree, or the
    pack's plain downloaded file."""
    USED.setdefault(pack, set()).add(member)
    p = os.path.join(fetch(pack), member)
    if os.path.exists(p):
        return p
    p = os.path.join(extracted(pack), member)
    if not os.path.exists(p):
        raise FileNotFoundError(p)
    return p


# --------------------------------------------------------------------------
# DSP helpers (float32 mono arrays; ffmpeg does decoding and filtering)
# --------------------------------------------------------------------------

def load(path, sr=SR, start=0.0, dur=None):
    """Decode (a slice of) any audio file to float32 mono at `sr`."""
    args = ['ffmpeg', '-v', 'error']
    if start:
        args += ['-ss', '%.4f' % start]
    args += ['-i', path]
    if dur:
        args += ['-t', '%.4f' % dur]
    args += ['-ac', '1', '-ar', str(sr), '-f', 'f32le', '-']
    a = np.frombuffer(subprocess.run(args, check=True, capture_output=True).stdout, dtype=np.float32).copy()
    return a


def ff(x, sr, af):
    """Run an ffmpeg audio filter graph over x (length may change for
    tempo filters)."""
    args = ['ffmpeg', '-v', 'error', '-f', 'f32le', '-ar', str(sr), '-ac', '1', '-i', '-',
            '-af', af, '-ac', '1', '-ar', str(sr), '-f', 'f32le', '-']
    out = subprocess.run(args, input=np.asarray(x, np.float32).tobytes(), check=True, capture_output=True).stdout
    return np.frombuffer(out, dtype=np.float32).copy()


def norm(x, peak=1.0):
    m = float(np.max(np.abs(x))) if len(x) else 0.0
    return x * (peak / m) if m > 0 else x


def trim(x, sr, db=-42.0, pre=0.004, post=0.03):
    """Cut leading/trailing parts quieter than `db` relative to the peak."""
    if not len(x):
        return x
    hop = max(1, int(sr * 0.005))
    env = np.array([np.max(np.abs(x[i:i + hop])) for i in range(0, len(x), hop)])
    thr = env.max() * 10 ** (db / 20)
    on = np.nonzero(env > thr)[0]
    if not len(on):
        return x
    a = max(0, on[0] * hop - int(pre * sr))
    b = min(len(x), (on[-1] + 1) * hop + int(post * sr))
    return x[a:b]


def fade(x, sr, fin=0.004, fout=0.04):
    x = x.copy()
    ni, no = min(len(x), int(fin * sr)), min(len(x), int(fout * sr))
    if ni:
        x[:ni] *= np.linspace(0, 1, ni) ** 2
    if no:
        x[-no:] *= np.linspace(1, 0, no) ** 2
    return x


def cut(x, sr, a, b=None):
    return x[int(a * sr):(int(b * sr) if b is not None else None)]


def mix(sr, *layers, length=None):
    """layers: (signal, start_seconds, gain)."""
    end = max(int(t * sr) + len(s) for s, t, g in layers)
    out = np.zeros(length if length else end, np.float32)
    for s, t, g in layers:
        o = int(t * sr)
        n = min(len(s), len(out) - o)
        if n > 0:
            out[o:o + n] += g * s[:n]
    return out


def drive(x, amount=2.0):
    """Soft saturation for loudness/grit (tanh), peak kept at 1."""
    x = norm(x)
    return norm(np.tanh(x * amount))


def compress(x, sr, threshold=-20, ratio=3.0, attack=4, release=90, makeup=1.0):
    return ff(x, sr, 'acompressor=threshold=%gdB:ratio=%g:attack=%g:release=%g:makeup=%g'
              % (threshold, ratio, attack, release, makeup))


def env_follow(x, sr, ms=5.0):
    n = max(1, int(sr * ms / 1000))
    k = np.ones(n) / n
    return np.convolve(np.abs(x), k, mode='same')


def best_period(x, sr, target, spread=0.12, ms=4.0):
    """Loop length near `target` seconds where the signal's envelope repeats
    best (rotor blades, engine firing): maximises the normalised correlation
    of the envelope with itself shifted by that length."""
    env = env_follow(x, sr, ms)
    env = env - env.mean()
    lo, hi = int((target - spread) * sr), int((target + spread) * sr)
    w = len(x) - hi
    if w < sr * 0.3:
        raise ValueError('segment too short for loop search')
    a = env[:w]
    best, best_c = lo, -2
    step = max(1, sr // 2000)
    for lag in range(lo, hi, step):
        b = env[lag:lag + w]
        c = float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-9))
        if c > best_c:
            best, best_c = lag, c
    # refine to the sample around the best coarse lag using the waveform
    seg = x[:w]
    lo2, hi2 = best - step, best + step + 1
    best2, c2 = best, -2
    for lag in range(max(1, lo2), hi2):
        b = x[lag:lag + w]
        c = float(np.dot(seg, b) / (np.linalg.norm(seg) * np.linalg.norm(b) + 1e-9))
        if c > c2:
            best2, c2 = lag, c
    return best2, best_c


def make_loop(x, sr, length, xfade, power=True):
    """Seamless loop of `length` samples from x (needs length + xfade
    samples): the head is crossfaded with what follows the loop end, so the
    last sample flows straight into the first when the sound repeats."""
    n = int(xfade * sr)
    if len(x) < length + n:
        raise ValueError('not enough material for loop')
    y = x[:length].copy()
    t = np.linspace(0, 1, n, endpoint=False)
    fi, fo = (np.sin(t * np.pi / 2), np.cos(t * np.pi / 2)) if power else (t, 1 - t)
    y[:n] = x[:n] * fi + x[length:length + n] * fo
    return y


def periodic_noise(n, rng, lo=None, hi=None, sr=SR, tilt=0.0):
    """Band-limited noise that is exactly periodic over n samples (circular
    FFT filtering), so it loops with no seam at all."""
    spec = np.fft.rfft(rng.standard_normal(n))
    f = np.fft.rfftfreq(n, 1 / sr)
    g = np.ones_like(f)
    if lo:
        g *= 1 / np.sqrt(1 + (lo / np.maximum(f, 1e-3)) ** 4)
    if hi:
        g *= 1 / np.sqrt(1 + (f / hi) ** 4)
    if tilt:
        g *= (np.maximum(f, 20) / 1000.0) ** tilt
    return norm(np.fft.irfft(spec * g, n).astype(np.float32))


def circular_smooth(x, k):
    """Moving average with wraparound (keeps periodic signals periodic)."""
    if k <= 1:
        return x
    X = np.fft.rfft(x)
    ker = np.zeros(len(x))
    ker[:k] = 1.0 / k
    return np.fft.irfft(X * np.fft.rfft(np.roll(ker, -(k // 2))), len(x)).astype(np.float32)


def pitch(x, sr, factor, tempo=1.0):
    """Pitch shift (formants move too: good for 'smaller' voices) with an
    optional tempo change, via ffmpeg's rubberband filter."""
    return ff(x, sr, 'rubberband=pitch=%g:tempo=%g:transients=crisp' % (factor, tempo))



# --------------------------------------------------------------------------
# Source shorthands
# --------------------------------------------------------------------------

def ad(n):  # artisticdude zombie-N.wav
    return src('snd_oga_zombies_sound_pack_artisticdude', 'zombies/zombies/zombie-%d.wav' % n)


def ap(name):  # arcadeparty voice effects
    return src('snd_oga_zombie_voice_effects_arcadeparty',
               'voice_effects_zombie/Voice Effects Zombie-Skeleton-Monster Human Male/%s.wav' % name)


def rd(pack, name):  # rubberduck packs (.ogg inside the zip)
    sub = {'metal_wood': ('snd_oga_metal_wood_rubberduck', '100-CC0-wood-metal-SFX'),
           'water': ('snd_oga_water_splash_rubberduck', 'water-splash-slime-sfx'),
           'bfh': ('snd_oga_breaking_falling_rubberduck', 'sfx_breaking_and_falling')}[pack]
    d = os.path.join(extracted(sub[0]), sub[1])
    # the zips differ in layout; find the member by name
    for root, _, files in os.walk(d):
        if name + '.ogg' in files:
            rel = os.path.relpath(os.path.join(root, name + '.ogg'), extracted(sub[0]))
            return src(sub[0], rel)
    raise FileNotFoundError(name)


def voice(x, sr, hp=70, comp=True):
    """Common treatment for zombie vocals: rumble cut, gentle compression."""
    x = ff(x, sr, 'highpass=f=%d:poles=2' % hp)
    if comp:
        x = compress(x, sr, threshold=-22, ratio=3, attack=3, release=120, makeup=1)
    return x


# --------------------------------------------------------------------------
# Recipes: each returns a float signal at the given rate
# --------------------------------------------------------------------------

def s_zsgrn1(sr):
    # deep, fully voiced moan (f0 ~82 Hz), 1.4 s
    x = trim(load(ad(16), sr), sr)
    return fade(voice(x, sr), sr, 0.01, 0.12)


def s_zsgrn2(sr):
    # second voice: EmoPreben moan, first 1.45 s with a long fade
    x = trim(load(src('snd_oga_zombie_moans_emopreben', 'zombiemoans_-_wav/ZombieMoans - Track 5 - ZombieMoan1.wav'), sr), sr)
    return fade(voice(cut(x, sr, 0, 1.45), sr), sr, 0.01, 0.35)


def s_zsgrn3(sr):
    # third voice: darsycho's rising-falling moan at 3.6-4.95 s of the take
    x = load(src('snd_oga_zombie_moans_darsycho', 'darsycho__zombie-moans.ogg'), sr, 3.60, 1.35)
    return fade(voice(x, sr), sr, 0.03, 0.3)


def s_zsatk(sr):
    # swing: an arm whoosh with a short rasping grunt on top
    whoosh = trim(load(src('snd_oga_3_melee_sounds_remaxim', 'melee_sounds/melee sounds/melee sound.wav'), sr), sr)
    grunt = trim(load(ad(24), sr), sr)
    x = mix(sr, (norm(whoosh), 0.0, 0.9), (norm(ff(grunt, sr, 'highpass=f=120')), 0.03, 0.55))
    return fade(x, sr, 0.003, 0.1)


def s_zsbite(sr):
    # bite hit: snarl + wet meat crunch
    snarl = trim(load(ap('zombieYell1'), sr), sr)
    meat = trim(load(src('snd_oga_impact_qubodup', 'qubodupImpact/qubodupImpact/qubodupImpactMeat02.flac'), sr), sr)
    squish = trim(load(src('snd_oga_squish_ezduzziteh', 'squish_02.mp3'), sr), sr)
    x = mix(sr, (norm(voice(snarl, sr)), 0.0, 0.6), (norm(meat), 0.04, 1.0), (norm(squish), 0.07, 0.5))
    return fade(trim(x, sr), sr, 0.002, 0.08)


def s_zspain(sr):
    # short voiced pain grunt (f0 ~134 Hz), 0.4 s
    return fade(voice(trim(load(ap('zombieYell2'), sr), sr), sr), sr, 0.003, 0.06)


def s_zsdth1(sr):
    x = trim(load(ap('zombieDeath3'), sr), sr, -40)
    return fade(voice(x, sr), sr, 0.003, 0.15)


def s_zsdth2(sr):
    # long rasping death gurgle (artisticdude 17), shortened to 1.3 s
    x = trim(load(ad(17), sr), sr)
    return fade(voice(cut(x, sr, 0, 1.3), sr), sr, 0.004, 0.3)


def s_zrscrm(sr):
    # runner: growl rising into a screech (f0 180 -> 610 Hz), a touch higher
    x = trim(load(ad(8), sr), sr)
    x = pitch(x, sr, 1.06)
    x = drive(voice(x, sr, hp=150), 1.3)
    return fade(trim(x, sr), sr, 0.003, 0.12)


def s_zkscrm(sr):
    # kid: a human yell and a zombie screech shifted up (pitch and formants)
    # into a small, shrill voice, stretched a little
    yell = pitch(trim(load(ap('humanYell1'), sr), sr), sr, 1.38, 0.72)
    screech = pitch(trim(load(ad(13), sr), sr), sr, 1.18, 0.9)
    x = mix(sr, (norm(trim(yell, sr)), 0.0, 1.0), (norm(trim(screech, sr)), 0.02, 0.45))
    x = voice(x, sr, hp=250)
    return fade(trim(x, sr), sr, 0.003, 0.12)


def _gen_material(sr):
    return load(src('snd_oga_generator_loop_ycbcr', 'loop_generator_1.mp3'), sr, 0.25, 5.0)


def s_genrun(sr):
    # generator idling: ycbcr's recording re-looped on its own firing period
    # (the MP3's own loop point has encoder padding)
    x = ff(_gen_material(sr), sr, 'highpass=f=35')
    n, _ = best_period(x, sr, 2.6, 0.15)
    return make_loop(x, sr, n, 0.3, power=False)


def s_genstr(sr):
    # starter cranks, engine catches, generator settles into its idle
    crank = trim(load(src('snd_oga_car_engine_start_looneybits', 'generic_car_startengine.wav'), sr), sr)
    catch = 1.0
    crank = fade(cut(crank, sr, 0, catch + 0.45), sr, 0.01, 0.35)
    run = fade(ff(_gen_material(sr), sr, 'highpass=f=35'), sr, 0.12, 0.0)
    x = mix(sr, (norm(crank), 0.0, 1.0), (norm(run), catch - 0.05, 0.6), length=int((catch + 1.75) * sr))
    return fade(x, sr, 0.005, 0.12)


def _tone_periodic(n, sr, freqs_amps, rng):
    """Sum of sines that each complete an integer number of cycles in n
    samples (so the loop is seamless)."""
    out = np.zeros(n, np.float32)
    for f, a in freqs_amps:
        cyc = max(1, round(f * n / sr))
        out += a * np.sin(2 * np.pi * cyc * np.arange(n) / n + rng.uniform(0, 2 * np.pi)).astype(np.float32)
    return out


def _clicks_periodic(n, sr, rate, rng, dur=0.012, lo=1500, hi=5000, amp=(0.3, 1.0)):
    """Short filtered noise bursts at random times, placed with wraparound."""
    out = np.zeros(n, np.float32)
    k = int(rate * n / sr)
    m = int(dur * sr)
    for _ in range(k):
        b = rng.standard_normal(m).astype(np.float32) * np.exp(-np.arange(m) / (m / 4)).astype(np.float32)
        b *= rng.uniform(*amp)
        p = rng.integers(0, n)
        idx = (p + np.arange(m)) % n
        out[idx] += b
    # filter three copies and keep the middle one: circular filtering, so
    # the result still repeats seamlessly
    return ff(np.tile(out, 3), sr, 'highpass=f=%d,lowpass=f=%d' % (lo, hi))[n:2 * n]


def s_rollgt(sr):
    # roll-up gate going up: motor hum and gear whine, the curtain's rumble
    # (pagdev's sliding elevator door) and slats clattering over the drum.
    rng = np.random.default_rng(2)
    rumble = load(src('snd_oga_elevator_door_pagdev', 'elevator_door.wav'), sr, 0.35, 3.2)
    rumble = ff(rumble, sr, 'highpass=f=50,lowpass=f=3500')
    n = int(2.6 * sr)
    rumble = norm(make_loop(rumble, sr, n, 0.4, power=True))
    hum = _tone_periodic(n, sr, [(118, 1.0), (236, 0.5), (354, 0.3), (472, 0.15)], rng)
    whine = _tone_periodic(n, sr, [(780, 1.0), (1560, 0.25)], rng)
    # slow wobble on the whine (integer cycles per loop)
    wob = 1 + 0.3 * np.sin(2 * np.pi * 5 * np.arange(n) / n)
    clatter = _clicks_periodic(n, sr, 9, rng, dur=0.02, lo=900, hi=4200)
    x = 0.85 * rumble + 0.22 * norm(hum) + 0.07 * norm(whine) * wob + 0.45 * norm(clatter)
    return x.astype(np.float32)


def s_weld(sr):
    # blowtorch on a padlock: a turbulent roar with a softer hiss on top,
    # crackle and spits from the molten metal (synthesized; every layer is
    # periodic over the loop so it repeats without a seam), plus a little of
    # bmaczero's real spark crackle
    rng = np.random.default_rng(7)
    n = int(2.0 * sr)

    def turbulence(ms, depth):
        g = circular_smooth(rng.standard_normal(n).astype(np.float32), int(ms / 1000 * sr))
        return 1 + depth * g / (np.max(np.abs(g)) + 1e-9)

    roar = periodic_noise(n, rng, lo=120, hi=2400, sr=sr, tilt=-0.5) * turbulence(18, 0.45)
    hiss = periodic_noise(n, rng, lo=2500, hi=9000, sr=sr, tilt=-0.6) * turbulence(60, 0.3)
    sizzle_gate = circular_smooth((rng.random(n) < 0.003).astype(np.float32) * 30, int(0.012 * sr))
    sizzle = periodic_noise(n, rng, lo=3500, hi=9500, sr=sr) * np.clip(sizzle_gate, 0, 1.2)
    crackle = _clicks_periodic(n, sr, 28, rng, dur=0.003, lo=1500, hi=6500, amp=(0.05, 1.0))
    pops = _clicks_periodic(n, sr, 5, rng, dur=0.01, lo=500, hi=3500, amp=(0.5, 1.0))
    spark = norm(trim(load(src('snd_oga_electricity_bmaczero', 'continuousspark.wav'), sr), sr))
    sparks = np.zeros(n, np.float32)
    for p in (int(0.31 * sr), int(1.37 * sr)):
        idx = (p + np.arange(len(spark))) % n
        sparks[idx] += fade(spark, sr, 0.01, 0.05)
    x = (0.75 * norm(roar) + 0.28 * norm(hiss) + 0.22 * sizzle + 0.5 * norm(crackle) + 0.55 * norm(pops) + 0.2 * sparks)
    return x.astype(np.float32)


def s_crank(sr):
    # ratchet: a run of pawl clicks from bart's chain winch
    x = load(src('snd_oga_chain_winch_bart', 'winch/winch - Marker #7.wav'), sr, 0.15, 0.93)
    x = ff(x, sr, 'highpass=f=90')
    return fade(x, sr, 0.003, 0.05)


def s_radio(sr):
    # squelch, static, a garbled voice burst through a small speaker, static, squelch
    rng = np.random.default_rng(3)
    static = load(src('snd_oga_radio_noise_kresiek', 'radio_noise_loop.wav'), sr, 4.0, 2.6)
    static = ff(static, sr, 'highpass=f=300,lowpass=f=4200')
    v = load(src('snd_oga_zombie_news_radio_zisongbr', 'radio_news_zombies.mp3'), sr, 20.0, 1.55)
    v = ff(v, sr, 'highpass=f=450,lowpass=f=2700,acrusher=bits=8:mode=log:aa=0.8:samples=2')
    # dropouts: the signal fading in and out like a weak transmission
    gate = np.ones(len(v), np.float32)
    for _ in range(4):
        a = int(rng.uniform(0.1, 1.4) * sr)
        gate[a:a + int(rng.uniform(0.03, 0.08) * sr)] = 0.12
    gate = circular_smooth(gate, int(0.006 * sr))
    flutter = 0.75 + 0.25 * np.sin(2 * np.pi * 7.3 * np.arange(len(v)) / sr)
    v = drive(norm(v) * gate * flutter, 1.8)
    v = ff(v, sr, 'highpass=f=400,lowpass=f=3000')
    click = np.zeros(int(0.03 * sr), np.float32)
    click[:6] = [1.0, -0.8, 0.6, -0.4, 0.2, -0.1]
    beep = (np.sin(2 * np.pi * 1350 * np.arange(int(0.07 * sr)) / sr) * 0.5).astype(np.float32)
    s = norm(static)
    x = mix(sr,
            (click, 0.0, 0.9),
            (fade(cut(s, sr, 0, 0.42), sr, 0.002, 0.05), 0.005, 1.0),
            (fade(cut(s, sr, 0.42, 2.1), sr, 0.03, 0.05), 0.40, 0.22),
            (fade(norm(v), sr, 0.02, 0.06), 0.42, 0.95),
            (fade(cut(s, sr, 2.0, 2.35), sr, 0.01, 0.06), 1.98, 0.9),
            (fade(beep, sr, 0.004, 0.01), 2.28, 0.35),
            (click, 2.36, 0.7))
    return x


def s_heli(sr):
    # helicopter overhead: aquinn's close rotor take, looped on whole blade
    # passes (~14 Hz) so the chop never stumbles
    x = load(src('snd_oga_helicopter_sounds_aquinn', 'helicopter_0.mp3'), sr, 16.45, 3.85)
    x = ff(x, sr, 'highpass=f=40')
    n, c = best_period(x, sr, 2.0, 0.08)
    return make_loop(x, sr, n, 0.25, power=c < 0.7)


def s_glasbk(sr):
    a = trim(load(src('snd_oga_glass_break_tinyworlds', 'glass_breaking.wav'), sr), sr)
    b = trim(load(rd('bfh', 'bfh1_glass_breaking_06'), sr), sr)
    thump = ff(trim(load(src('snd_oga_impact_qubodup', 'qubodupImpact/qubodupImpact/qubodupImpactStone.flac'), sr), sr), sr, 'lowpass=f=400')
    x = mix(sr, (norm(a), 0.0, 1.0), (norm(b), 0.015, 0.55), (norm(thump), 0.0, 0.45))
    return fade(cut(trim(x, sr, -40), sr, 0, 1.3), sr, 0.002, 0.25)


def s_woodbk(sr):
    hit = trim(load(rd('metal_wood', 'wood_breaking_01'), sr), sr)
    crack = trim(load(src('snd_oga_wood_crack_qubodup',
                          'independent_nu_ljudbank-wood_crack_hit_destruction/wood_impact/crack03.mp3.flac'), sr), sr, -30)
    x = mix(sr, (norm(hit), 0.0, 1.0), (norm(crack), 0.03, 0.8))
    return fade(cut(x, sr, 0, 1.35), sr, 0.002, 0.3)


def s_chainb(sr):
    snap = trim(load(rd('metal_wood', 'metal_hit_01'), sr), sr)
    clank = trim(load(src('snd_oga_impact_qubodup', 'qubodupImpact/qubodupImpact/qubodupImpactMetal.flac'), sr), sr)
    links = trim(load(rd('metal_wood', 'keys_03'), sr), sr)
    fall = trim(load(rd('metal_wood', 'metal_falling_02'), sr), sr)
    x = mix(sr, (norm(snap), 0.0, 1.0), (norm(clank), 0.0, 0.6), (norm(links), 0.04, 0.7), (norm(fall), 0.16, 0.55))
    return fade(trim(x, sr, -40), sr, 0.002, 0.2)


def s_splash(sr):
    x = trim(load(rd('water', 'splash_04'), sr), sr, -40)
    return fade(ff(x, sr, 'highpass=f=70'), sr, 0.003, 0.2)


def s_ladder(sr):
    # one rung: hand grabs the rung, boot lands on the next, a short ring
    st = 'metal_steps_48k24b/metal_steps_%02d.wav'
    a = trim(load(src('snd_oga_metal_footsteps_thimras', st % 9), sr), sr)
    b = trim(load(src('snd_oga_metal_footsteps_thimras', st % 3), sr), sr)
    m = int(0.25 * sr)
    t = np.arange(m) / sr
    ring = (np.sin(2 * np.pi * 1180 * t) + 0.6 * np.sin(2 * np.pi * 2710 * t)) * np.exp(-t / 0.05)
    ring = ring.astype(np.float32)
    x = mix(sr, (norm(a), 0.0, 0.85), (ring, 0.0, 0.12), (norm(b), 0.17, 1.0), (ring, 0.17, 0.15))
    return fade(trim(x, sr, -40), sr, 0.002, 0.08)


def s_plugin(sr):
    # plug pushed home, then the panel comes alive with a short mains hum
    plug = trim(load(src('snd_oga_plug_in_out_cleytonkauffman', 'Plug_In,_Plug_Out/Plug-in.wav'), sr), sr, -40)
    sw = trim(load(src('snd_oga_circuit_breaker_cleytonkauffman', 'Circuit_Breaker/switch on.wav'), sr), sr, -30)
    m = int(0.45 * sr)
    t = np.arange(m) / sr
    hum = (np.sin(2 * np.pi * 120 * t) + 0.5 * np.sin(2 * np.pi * 240 * t) + 0.25 * np.sin(2 * np.pi * 360 * t)).astype(np.float32)
    hum = fade(hum, sr, 0.05, 0.25)
    x = mix(sr, (norm(plug), 0.0, 1.0), (norm(sw), 0.24, 0.4), (hum, 0.26, 0.12))
    return fade(cut(x, sr, 0, 0.75), sr, 0.002, 0.15)


# name -> (recipe, sample rate, loopable)
SOUNDS = {
    'ZSGRN1': (s_zsgrn1, SR, False), 'ZSGRN2': (s_zsgrn2, SR, False), 'ZSGRN3': (s_zsgrn3, SR, False),
    'ZSATK': (s_zsatk, SR, False), 'ZSBITE': (s_zsbite, SR, False), 'ZSPAIN': (s_zspain, SR, False),
    'ZSDTH1': (s_zsdth1, SR, False), 'ZSDTH2': (s_zsdth2, SR, False),
    'ZRSCRM': (s_zrscrm, SR, False), 'ZKSCRM': (s_zkscrm, SR, False),
    'GENSTR': (s_genstr, SR, False), 'GENRUN': (s_genrun, SR, True), 'ROLLGT': (s_rollgt, SR, True),
    'WELD': (s_weld, 22050, True), 'CRANK': (s_crank, SR, False), 'RADIO': (s_radio, SR, False),
    'HELI': (s_heli, 22050, True), 'GLASBK': (s_glasbk, SR, False), 'WOODBK': (s_woodbk, SR, False),
    'CHAINB': (s_chainb, SR, False), 'SPLASH': (s_splash, SR, False), 'LADDER': (s_ladder, SR, False),
    'PLUGIN': (s_plugin, SR, False),
}


# --------------------------------------------------------------------------
# Music
# --------------------------------------------------------------------------

MUSIC = {
    # NMRiH-flavoured night suspense: written for No More Room in Hell by
    # nene (never used there) and released as CC0. Piano + strings, 132 bpm.
    # Its note velocities are raised 80 -> 100 so it plays about as loud
    # through the OPL synth as the IWAD's own music (rms -24 dBFS, not -29).
    'D_CHINAT': dict(file='Night%20of%20the%20Streets.mid', title='Night of the Streets [Horror/Suspense]',
                     author='nene', page='https://opengameart.org/content/night-of-the-streets-horrorsuspense',
                     vel=1.25),
    # Hold-out / extraction: 174 bpm guitar-driven action in E, DOOM-ish.
    'D_CTEVAC': dict(file='Endless%20Pain%20of%20Nightmares.mid', title='Endless Pain of Nightmares',
                     author='nene', page='https://opengameart.org/content/endless-pain-of-nightmares'),
}


def midi_gain(data, vel_scale=1.0, vol_scale=1.0):
    """Return a copy of a Standard MIDI File with note-on velocities and
    channel-volume (CC7) values scaled, edited in place byte by byte so the
    file structure (delta times, running status, meta events) is untouched."""
    b = bytearray(data)
    if b[:4] != b'MThd':
        raise ValueError('not a MIDI file')
    ntr = struct.unpack('>H', b[10:12])[0]
    p = 8 + struct.unpack('>I', b[4:8])[0]

    def vlq(q):
        v = 0
        while True:
            c = b[q]
            q += 1
            v = (v << 7) | (c & 0x7f)
            if not c & 0x80:
                return v, q

    for _ in range(ntr):
        if b[p:p + 4] != b'MTrk':
            raise ValueError('bad track chunk')
        end = p + 8 + struct.unpack('>I', b[p + 4:p + 8])[0]
        q = p + 8
        status = 0
        while q < end:
            _, q = vlq(q)
            c = b[q]
            if c == 0xff:
                ln, q2 = vlq(q + 2)
                q = q2 + ln
                continue
            if c in (0xf0, 0xf7):
                ln, q2 = vlq(q + 1)
                q = q2 + ln
                continue
            if c & 0x80:
                status = c
                q += 1
            hi = status & 0xf0
            if hi in (0xc0, 0xd0):
                q += 1
                continue
            if hi == 0x90 and b[q + 1] > 0:
                b[q + 1] = max(1, min(127, int(round(b[q + 1] * vel_scale))))
            elif hi == 0xb0 and b[q] == 7:
                b[q + 1] = min(127, int(round(b[q + 1] * vol_scale)))
            q += 2
        p = end
    return bytes(b)


def check_midi_node(paths):
    """Parse MIDI files with the engine's own parser (src/audio/mus.js)."""
    js = ("import('%s').then(m=>{const fs=require('fs');for(const p of %s){const s=m.parseMusic(new Uint8Array(fs.readFileSync(p)));"
          "const n=s.events.filter(e=>e.type==='noteOn').length;"
          "console.log(JSON.stringify({p,format:s.format,events:s.events.length,notes:n,duration:s.duration}))}})"
          % (os.path.join(dg.ROOT, 'src', 'audio', 'mus.js'), json.dumps(paths)))
    out = subprocess.run(['node', '-e', js], check=True, capture_output=True, text=True).stdout
    return [json.loads(l) for l in out.splitlines() if l.strip()]


def build_music(report):
    fetch('mus_oga_cc0_midi')
    paths = []
    for name, m in MUSIC.items():
        p = os.path.join(CACHE, 'mus_oga_cc0_midi', m['file'])
        data = open(p, 'rb').read()
        if data[:4] != b'MThd':
            raise ValueError('%s is not a Standard MIDI File' % p)
        if m.get('vel', 1.0) != 1.0 or m.get('vol', 1.0) != 1.0:
            data = midi_gain(data, m.get('vel', 1.0), m.get('vol', 1.0))
        dg.write_lump('music', name, data)
        paths.append(os.path.join(dg.LUMPS, 'music', name + '.lmp'))
    for name, info in zip(MUSIC, check_midi_node(paths)):
        if info['format'] != 'midi' or info['notes'] < 100:
            raise ValueError('music %s did not parse: %r' % (name, info))
        report['music'][name] = dict(info, bytes=os.path.getsize(info['p']), **{k: MUSIC[name][k] for k in ('title', 'author')})
        print('  %-8s %s, %d events, %d notes, %.1f s' % (name, info['format'], info['events'], info['notes'], info['duration']))


def render_music_previews(report):
    """Play each music lump through the engine's own OPL renderer."""
    os.makedirs(PREVIEW, exist_ok=True)
    for name in MUSIC:
        lump = os.path.join(dg.LUMPS, 'music', name + '.lmp')
        wav = os.path.join(PREVIEW, name + '.wav')
        r = subprocess.run(['node', os.path.join(dg.ROOT, 'tools', 'render-music.mjs'), dg.IWAD, lump, '45', wav,
                            '--rate', '22050'], check=True, capture_output=True, text=True).stdout
        stats = {}
        for line in r.splitlines():
            if line.startswith('L:'):
                stats['peak_dbfs'] = float(line.split('(')[1].split(' dBFS')[0])
                stats['rms_dbfs'] = float(line.split('rms')[1].split('(')[1].split(' dBFS')[0])
            if line.startswith('silent seconds'):
                stats['silent_seconds'] = int(line.split(':')[1])
            if line.startswith('rendered'):
                stats['max_voices'] = int(line.rsplit(' ', 1)[1])
        report['music'][name].update(render=stats)
        print('  %-8s OPL render 45 s: peak %s dBFS, rms %s dBFS, silent s %s, voices %s' % (
            name, stats.get('peak_dbfs'), stats.get('rms_dbfs'), stats.get('silent_seconds'), stats.get('max_voices')))


# --------------------------------------------------------------------------
# Output, checks, previews, report
# --------------------------------------------------------------------------

def write_wav16(path, samples, sr):
    import wave
    a = np.clip(np.asarray(samples, np.float32), -1, 1)
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes((a * 32767).astype('<i2').tobytes())


def decode_dmx(data):
    """Decode a DMX lump exactly the way src/audio/audio.js does."""
    fmt, rate, count = struct.unpack_from('<HHI', data, 0)
    if fmt != 3:
        raise ValueError('format %d' % fmt)
    rate = rate or 11025
    start = 8
    if count > len(data) - 8:
        count = len(data) - 8
    if count > 48:
        start += 16
        count -= 32
    s = np.frombuffer(data[start:start + count], np.uint8)
    return rate, (s.astype(np.float32) - 128) / 128


def build_sound(name, report):
    fn, sr, loop = SOUNDS[name]
    x = np.asarray(fn(sr), np.float32)
    x = x - float(np.mean(x)) if loop else x  # no DC offset in loops
    with tempfile.TemporaryDirectory() as td:
        tmp = os.path.join(td, name + '.wav')
        write_wav16(tmp, norm(x, 0.999), sr)
        u8 = dg.audio_to_u8(tmp, rate=sr, fade_ms=0)  # recipes do their own fades; loops need none
    data = dg.encode_dmx(u8, sr)
    dg.write_lump('sounds', 'DS' + name, data)
    # --- verify the lump the way the engine reads it
    rate, dec = decode_dmx(data)
    assert rate == sr and len(dec) == len(u8), (name, rate, len(dec), len(u8))
    peak = float(np.max(np.abs(dec)))
    rms = float(np.sqrt(np.mean(dec ** 2)))
    info = dict(rate=rate, samples=len(dec), seconds=len(dec) / rate, bytes=len(data),
                peak_dbfs=20 * np.log10(peak + 1e-9), rms_dbfs=20 * np.log10(rms + 1e-9), loop=loop,
                header=dict(format=struct.unpack_from('<H', data, 0)[0], count=struct.unpack_from('<I', data, 4)[0]))
    if loop:
        # seam: the jump from the last sample to the first vs typical sample steps
        d = np.abs(np.diff(dec))
        info['seam_jump'] = float(abs(dec[0] - dec[-1]))
        info['seam_vs_p99_step'] = float(abs(dec[0] - dec[-1]) / (np.percentile(d, 99) + 1e-9))
        # level continuity across the seam (50 ms either side)
        w = int(0.05 * rate)
        a, b = dec[-w:], dec[:w]
        info['seam_level_db'] = float(20 * np.log10((np.sqrt(np.mean(b ** 2)) + 1e-9) / (np.sqrt(np.mean(a ** 2)) + 1e-9)))
    report['sounds'][name] = info
    # previews: the exact 8-bit data, and loops played three times
    os.makedirs(PREVIEW, exist_ok=True)
    write_wav16(os.path.join(PREVIEW, 'DS%s.wav' % name), dec, rate)
    if loop:
        write_wav16(os.path.join(PREVIEW, 'DS%s_x3.wav' % name), np.tile(dec, 3), rate)
    msg = '  DS%-7s %5d Hz %6.2f s  peak %5.1f dBFS  rms %5.1f dBFS' % (name, rate, info['seconds'], info['peak_dbfs'], info['rms_dbfs'])
    if loop:
        msg += '  seam jump %.3f (%.2fx p99 step), level %+.1f dB' % (info['seam_jump'], info['seam_vs_p99_step'], info['seam_level_db'])
    print(msg)
    return dec, rate


def spectrogram_sheet(path, items):
    from PIL import Image, ImageDraw
    W, H, L = 640, 96, 90
    sheet = Image.new('RGB', (W + L, H * len(items)), (0, 0, 0))
    d = ImageDraw.Draw(sheet)
    for i, (name, x, sr) in enumerate(items):
        n = 512 if sr > 11025 else 256
        hop = max(1, (len(x) - n) // W) if len(x) > n else 1
        cols = [np.abs(np.fft.rfft(np.pad(x[j:j + n], (0, max(0, n - len(x[j:j + n])))) * np.hanning(n)))
                for j in range(0, max(1, len(x) - n), hop)][:W]
        S = np.array(cols).T
        S = 20 * np.log10(S / (S.max() + 1e-9) + 1e-6)
        S = np.clip((S + 70) / 70, 0, 1)[::-1]
        im = Image.fromarray((S * 255).astype(np.uint8)).resize((W, H - 4))
        a = np.asarray(im).astype(np.float32) / 255
        rgb = np.stack([np.clip(a * 3, 0, 1), np.clip(a * 3 - 1, 0, 1), np.clip(a * 3 - 2, 0, 1)], -1)
        sheet.paste(Image.fromarray((rgb * 255).astype(np.uint8)), (L, i * H + 2))
        d.text((4, i * H + 4), 'DS' + name, fill=(255, 255, 255))
        d.text((4, i * H + 20), '%.2f s' % (len(x) / sr), fill=(200, 200, 200))
        d.text((4, i * H + 36), '%d Hz' % sr, fill=(200, 200, 200))
    sheet.save(path)


SOUND_NOTES = {
    'ZSGRN1': 'artisticdude zombie-16 (deep voiced moan)',
    'ZSGRN2': 'EmoPreben ZombieMoan1, first 1.45 s',
    'ZSGRN3': 'darsycho zombie-moans take, 3.60-4.95 s',
    'ZSATK': 'remaxim "melee sound" whoosh + artisticdude zombie-24 grunt',
    'ZSBITE': 'arcadeparty zombieYell1 snarl + qubodup ImpactMeat02 + ezduzziteh squish_02',
    'ZSPAIN': 'arcadeparty zombieYell2',
    'ZSDTH1': 'arcadeparty zombieDeath3',
    'ZSDTH2': 'artisticdude zombie-17, first 1.3 s',
    'ZRSCRM': 'artisticdude zombie-8 (growl rising to a screech), +1 semitone, saturated',
    'ZKSCRM': 'arcadeparty humanYell1 + artisticdude zombie-13, pitched up (rubberband)',
    'GENSTR': 'looneybits car engine start (cranking + catch) into the ycbcr generator idle',
    'GENRUN': 'ycbcr generator loop, re-looped on its firing period (seamless)',
    'ROLLGT': 'pagdev elevator door rumble (re-looped) + synthesized motor hum/whine and slat clatter (seamless)',
    'WELD': 'synthesized torch roar/hiss/crackle (periodic noise, seamless) + bmaczero continuousspark',
    'CRANK': 'bart chain winch "Marker #7" ratchet clicks',
    'RADIO': 'kresiek radio noise + zisongbr radio news voice (band-passed, crushed, dropouts) + synthesized squelch clicks/beep',
    'HELI': 'aquinn helicopter take 4, looped on whole rotor-blade passes (seamless)',
    'GLASBK': 'tinyworlds glass_breaking + rubberduck bfh1_glass_breaking_06 + qubodup ImpactStone thump',
    'WOODBK': 'rubberduck wood_breaking_01 + qubodup/Independent.nu crack03',
    'CHAINB': 'rubberduck metal_hit_01, keys_03, metal_falling_02 + qubodup ImpactMetal',
    'SPLASH': 'rubberduck splash_04',
    'LADDER': 'thimras metal_steps_09 + _03 + synthesized rung ring',
    'PLUGIN': 'cleytonkauffman Plug-in + circuit breaker "switch on" + synthesized mains hum',
}


def write_credits(report):
    os.makedirs(os.path.dirname(CREDITS_MD), exist_ok=True)
    lines = ['# Chinatown audio credits', '',
             'Built by `tools/ct/audio.py` (rerun it to regenerate this file). Every source below is',
             'released under **CC0 1.0** (public domain dedication) on OpenGameArt.org; no attribution',
             'is required, it is given anyway. Nothing from No More Room in Hell is used.', '',
             '## Music', '', '| lump | title | author | source | licence |', '|---|---|---|---|---|']
    for name, m in MUSIC.items():
        lines.append('| %s | %s | %s | %s | CC0 |' % (name, m['title'], m['author'], m['page']))
    lines += ['', 'Both are shipped as Standard MIDI Files and play through the engine\'s OPL (GENMIDI)',
              'synth. D_CTEVAC is unmodified; D_CHINAT has its note velocities raised (x1.25, 80 -> 100)',
              'so it is about as loud as the IWAD music; nothing else is changed.', '',
              '## Sounds', '', '| lump | made from |', '|---|---|']
    for name in SOUNDS:
        lines.append('| DS%s | %s |' % (name, SOUND_NOTES.get(name, '')))
    lines += ['', '## Sound packs used', '', '| pack | author | source page | licence | files used |', '|---|---|---|---|---|']
    for pack in sorted(USED):
        if pack.startswith('mus_'):
            continue
        info = PACKS[pack]
        files = ', '.join(sorted(os.path.basename(f) for f in USED[pack]))
        lines.append('| %s | %s | %s | CC0 | %s |' % (info['title'], info['author'], info['page'], files))
    lines += ['', 'Synthesized parts (numpy, in `audio.py`): weld roar/hiss/crackle, roll-up motor hum,',
              'whine and slat clatter, radio squelch clicks and beep, ladder rung ring, mains hum.', '']
    with open(CREDITS_MD, 'w') as f:
        f.write('\n'.join(lines))


def write_report(report):
    os.makedirs(PREVIEW, exist_ok=True)
    L = ['# Chinatown audio: listening-check report', '',
         'Generated by `tools/ct/audio.py --report`. Every DMX lump was decoded back the way',
         '`src/audio/audio.js` does (format 3 header, rate, count, 16 pad bytes each side); the',
         'figures below are measured on that decoded 8-bit data. Previews: `build/ct/previews/audio/`',
         '(DS*.wav = the exact lump data, DS*_x3.wav = loops played three times, spectrograms.png,',
         'D_*.wav = the music through the engine\'s OPL renderer).', '',
         '| lump | rate | length | peak dBFS | rms dBFS | header | loop seam | notes |', '|---|---|---|---|---|---|---|---|']
    for name, i in report['sounds'].items():
        seam = ('jump %.3f (%.2fx p99 step), level %+.1f dB' % (i['seam_jump'], i['seam_vs_p99_step'], i['seam_level_db'])) if i['loop'] else '-'
        L.append('| DS%s | %d | %.2f s | %.1f | %.1f | fmt %d, count %d | %s | %s |' % (
            name, i['rate'], i['seconds'], i['peak_dbfs'], i['rms_dbfs'], i['header']['format'], i['header']['count'], seam,
            SOUND_NOTES.get(name, '')))
    L += ['', '## Music', '', '| lump | title | parse (engine mus.js) | OPL render (45 s) |', '|---|---|---|---|']
    for name, m in report['music'].items():
        r = m.get('render', {})
        L.append('| %s | %s (%s) | %s, %d events, %d notes, %.1f s, %d bytes | peak %s dBFS, rms %s dBFS, silent %s s, max voices %s |' % (
            name, m['title'], m['author'], m['format'], m['events'], m['notes'], m['duration'], m['bytes'],
            r.get('peak_dbfs'), r.get('rms_dbfs'), r.get('silent_seconds'), r.get('max_voices')))
    L.append('')
    with open(os.path.join(PREVIEW, 'report.md'), 'w') as f:
        f.write('\n'.join(L))
    with open(os.path.join(PREVIEW, 'report.json'), 'w') as f:
        json.dump(report, f, indent=1, default=float)


def main():
    ap_ = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap_.add_argument('--only', help='comma-separated sound names (e.g. WELD,HELI) or D_ music names')
    ap_.add_argument('--report', action='store_true', help='render music previews and write the report')
    args = ap_.parse_args()
    only = set(n.strip().upper() for n in args.only.split(',')) if args.only else None
    report = {'sounds': {}, 'music': {}}
    print('sounds -> %s' % os.path.join(dg.LUMPS, 'sounds'))
    items = []
    for name in SOUNDS:
        if only and name not in only:
            continue
        dec, rate = build_sound(name, report)
        items.append((name, dec, rate))
    if not only or any(n.startswith('D_') for n in only):
        print('music -> %s' % os.path.join(dg.LUMPS, 'music'))
        build_music(report)
        if args.report:
            render_music_previews(report)
    if items:
        os.makedirs(PREVIEW, exist_ok=True)
        spectrogram_sheet(os.path.join(PREVIEW, 'spectrograms.png'), items)
    if not only:
        write_credits(report)
        if args.report:
            write_report(report)
            print('report -> %s' % os.path.join(PREVIEW, 'report.md'))


if __name__ == '__main__':
    main()

