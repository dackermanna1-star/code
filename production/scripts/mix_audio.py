"""Builds the soundtrack: narration + music + SFX, with ducking. Output: audio/mix.wav (48 kHz stereo).

Sources (see CREDITS.md): narration Kokoro-82M TTS; music Kevin MacLeod (CC BY 4.0); SFX OpenGameArt CC0 / CC-BY 3.0
(qubodup: exp.mp3, rumble.flac) plus a few synthesized elements (B-29 engine drone, tinnitus ring, sub-bass, temple bell, clock).
"""
import json, subprocess, numpy as np, soundfile as sf
from scipy.signal import butter, sosfilt

ROOT = "/home/user/code/production"
SR = 48000
TL = json.load(open(f"{ROOT}/timeline.json"))
SH = {s["id"]: s for s in TL["shots"]}
LN = {l["id"]: l for l in TL["lines"]}
DUR = TL["total_frames"] / 30 + 0.5
N = int(DUR * SR)
OGA = "/opt/assets/sfx_oga"
MUS = "/opt/assets/music"


def t_of(frame):
    return (frame - 1) / 30.0


def load(path, start=0.0, dur=None):
    cmd = ["ffmpeg", "-v", "error", "-ss", str(start)] + (["-t", str(dur)] if dur else []) + ["-i", path, "-ac", "2", "-ar", str(SR), "-f", "f32le", "-"]
    a = np.frombuffer(subprocess.run(cmd, capture_output=True, check=True).stdout, dtype=np.float32).reshape(-1, 2).copy()
    return a


def norm(a, peak=0.9):
    m = np.max(np.abs(a)) + 1e-9
    return a * (peak / m)


def rms_norm(a, target=0.1):
    r = np.sqrt(np.mean(a ** 2)) + 1e-9
    return a * (target / r)


def fade(a, fi=0.0, fo=0.0):
    n = len(a)
    if fi > 0:
        k = min(n, int(fi * SR)); a[:k] *= np.linspace(0, 1, k)[:, None]
    if fo > 0:
        k = min(n, int(fo * SR)); a[n - k:] *= np.linspace(1, 0, k)[:, None]
    return a


def lp(a, hz):
    sos = butter(2, hz, 'low', fs=SR, output='sos')
    return sosfilt(sos, a, axis=0).astype(np.float32)


def hp(a, hz):
    sos = butter(2, hz, 'high', fs=SR, output='sos')
    return sosfilt(sos, a, axis=0).astype(np.float32)


def loop_to(a, dur):
    n = int(dur * SR)
    if len(a) >= n:
        return a[:n].copy()
    reps = int(np.ceil(n / len(a)))
    out = np.concatenate([a] * reps)[:n]
    return out


def put(bus, a, t, gain=1.0):
    i = int(t * SR)
    if i >= len(bus):
        return
    j = min(len(bus), i + len(a))
    bus[i:j] += a[:j - i] * gain


def env_gain(bus, keys):
    """Piecewise-linear gain automation keys [(t, g)]."""
    ts = np.array([k[0] for k in keys]) * SR
    gs = np.array([k[1] for k in keys])
    g = np.interp(np.arange(len(bus)), ts, gs).astype(np.float32)
    bus *= g[:, None]


# ---------------------------------------------------------------- synth helpers
def tone(freq, dur, amp=0.2, wave="sine"):
    t = np.arange(int(dur * SR)) / SR
    if wave == "saw":
        x = 2 * (t * freq % 1) - 1
    else:
        x = np.sin(2 * np.pi * freq * t)
    return np.stack([x, x], 1).astype(np.float32) * amp


def b29_drone(dur):
    """Four radial engines heard from very high altitude: low, beating, band-limited."""
    t = np.arange(int(dur * SR)) / SR
    x = np.zeros_like(t)
    rng = np.random.default_rng(29)
    for f in (88.0, 89.3, 90.1, 91.4):
        ph = rng.uniform(0, 6)
        x += np.sign(np.sin(2 * np.pi * f * t + ph)) * 0.25 + np.sin(2 * np.pi * f * 2 * t + ph) * 0.2
    x += rng.normal(0, 0.15, len(t))
    a = np.stack([x, np.roll(x, 120)], 1).astype(np.float32)
    a = lp(hp(a, 60), 700)
    return rms_norm(a, 0.08)


def tinnitus(dur, f=4200):
    t = np.arange(int(dur * SR)) / SR
    x = np.sin(2 * np.pi * f * t) * (0.8 + 0.2 * np.sin(2 * np.pi * 3.1 * t))
    a = np.stack([x, x * 0.7], 1).astype(np.float32) * 0.06
    return a


def sub_boom(dur=4.0):
    t = np.arange(int(dur * SR)) / SR
    f = 55 * np.exp(-t * 0.6) + 22
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = np.sin(ph) * np.exp(-t * 0.9)
    return np.stack([x, x], 1).astype(np.float32) * 0.8


def temple_bell(dur=9.0):
    """Bonsho-like bell: inharmonic partials, slow beating, long decay."""
    t = np.arange(int(dur * SR)) / SR
    x = np.zeros_like(t)
    for f, a, d in ((98, 1.0, 0.35), (98 * 2.04, 0.6, 0.5), (98 * 2.76, 0.45, 0.6), (98 * 3.98, 0.25, 0.9), (98 * 5.4, 0.15, 1.3)):
        x += a * np.sin(2 * np.pi * f * t) * np.exp(-t * d) * (1 + 0.08 * np.sin(2 * np.pi * 1.7 * t))
    x *= np.minimum(1, t * 40)
    return np.stack([x, x * 0.95], 1).astype(np.float32) * 0.25


def clock_ticks(dur, rate=1.0, amp=0.12):
    a = np.zeros((int(dur * SR), 2), np.float32)
    click = np.random.default_rng(3).normal(0, 1, (int(0.012 * SR), 2)).astype(np.float32) * np.exp(-np.linspace(0, 8, int(0.012 * SR)))[:, None]
    click = hp(click, 1500)
    k = 0
    while k / rate < dur - 0.02:
        i = int(k / rate * SR)
        a[i:i + len(click)] += click * (amp if k % 2 == 0 else amp * 0.7)
        k += 1
    return a


# ---------------------------------------------------------------- buses
nar = np.zeros((N, 2), np.float32)
mus = np.zeros((N, 2), np.float32)
sfx = np.zeros((N, 2), np.float32)

# narration
active = np.zeros(N, np.float32)
for l in TL["lines"]:
    a, sr = sf.read(f"{ROOT}/audio/narration/{l['id']}.wav", dtype='float32')
    a = a[int(l["audio_trim"] * sr):]
    # resample 24k -> 48k
    a = np.repeat(a, 2) if sr == 24000 else a
    a = lp(np.stack([a, a], 1), 11000)
    a = fade(a, 0.01, 0.05)
    put(nar, a, l["t"], 1.0)
    i0 = int(l["t"] * SR); active[i0:i0 + len(a)] = 1
nar = norm(nar, 0.9) * 0.92

# ---------------------------------------------------------------- music
flash1 = t_of(SH["S06a"]["f0"] + 24)
flash2 = t_of(SH["S13b"]["f0"] + 4)
m1 = rms_norm(load(f"{MUS}/Heartbreaking.mp3", 0, flash1 + 1), 0.07)
m1 = fade(m1, 1.5, 0.0)
m1[int(flash1 * SR):] = 0
put(mus, m1, 0.0)
t_s07 = t_of(SH["S07"]["f0"])
m2 = rms_norm(load(f"{MUS}/Long Note Four.mp3", 30, flash2 - t_s07 + 1), 0.06)
m2 = fade(m2, 4.0, 0.0)
m2[int((flash2 - t_s07) * SR):] = 0
put(mus, m2, t_s07)
t_s14 = t_of(SH["S14"]["f0"]) + 1.0
t_s16 = t_of(SH["S16"]["f0"])
m3 = rms_norm(load(f"{MUS}/Impact Lento.mp3", 14, t_s16 - t_s14 + 3), 0.07)
m3 = fade(m3, 3.0, 3.0)
put(mus, m3, t_s14)
m4 = rms_norm(load(f"{MUS}/Eternal Hope.mp3", 66, DUR - t_s16 + 1), 0.075)
m4 = fade(m4, 3.0, 6.0)
put(mus, m4, t_s16 - 1.5)

# duck music under narration (smoothed)
k = int(0.25 * SR)
sm = np.convolve(active, np.ones(k) / k, mode='same')
mus *= (1.0 - 0.45 * sm)[:, None]

# ---------------------------------------------------------------- SFX
cic = rms_norm(load(f"{OGA}/082526-cicadasounds_0.ogg"), 0.05)
cic2 = rms_norm(load(f"{OGA}/082526-cicadasounds2_0.ogg"), 0.05)
birds = rms_norm(load(f"{OGA}/birds-isaiah658.ogg"), 0.03)
pbirds = rms_norm(load(f"{OGA}/park_ambience_birds.wav"), 0.03)
wind = [rms_norm(load(f"{OGA}/wind{i}.wav"), 0.06) for i in (1, 2, 3, 4)]
waves = rms_norm(load(f"{OGA}/wave_01_cc0-11505__transitking__wavesound.flac"), 0.05)
fire = rms_norm(load(f"{OGA}/fire-1.wav"), 0.05)
heart = rms_norm(load(f"{OGA}/heartbeat_slow_reverb.wav"), 0.06)
breath = rms_norm(load(f"{OGA}/breathing%20tired.wav"), 0.04)
steps = rms_norm(load(f"{OGA}/fallfantozi.ogg"), 0.05)
expl = norm(load(f"{OGA}/exp.mp3"), 0.9)
rumble = norm(load(f"{OGA}/rumble.flac"), 0.8)
X1 = f"{OGA}/x/100-CC0-SFX_0"
X2 = f"{OGA}/x/sfx_100_v2"
thunder = norm(load(f"{X2}/sfx100v2_thunder_01.ogg"), 0.8)
glass = [norm(load(f"{X1}/glass_0{i}.ogg"), 0.6) for i in (2, 3, 4, 5)]
paper = [norm(load(f"{X1}/paper_0{i}.ogg"), 0.4) for i in (1, 2, 3)]
wood = [norm(load(f"{X1}/wooden_0{i}.ogg"), 0.5) for i in (1, 2, 3)]
stones = [norm(load(f"{X2}/sfx100v2_stones_0{i}.ogg"), 0.5) for i in (1, 2, 3)]
air = [norm(load(f"{X2}/sfx100v2_air_0{i}.ogg"), 0.5) for i in (1, 2, 3)]
bell = norm(load(f"{X1}/bell_01.ogg"), 0.5)
steam = [rms_norm(load(f"{OGA}/x/steam_hisses/steam hisses - Marker #{i}.wav"), 0.06) for i in (1, 2, 3)]
engine = rms_norm(load(f"{OGA}/steamboat_engine.wav"), 0.05)
hum = rms_norm(lp(load(f"{OGA}/generator_loop.wav"), 300), 0.03)
room = rms_norm(lp(load(f"{X2}/sfx100v2_loop_ambient_01.ogg"), 1200), 0.015)
water_lap = rms_norm(load(f"{X2}/sfx100v2_loop_water_01.ogg"), 0.03)
fsteps_w = [norm(load(f"{X2}/sfx100v2_footstep_wood_0{i}.ogg"), 0.3) for i in (1, 2, 3, 4)]


def seg(a, t0, t1, gain=1.0, fi=0.3, fo=0.3, off=0.0):
    d = t1 - t0
    o = int(off * SR) % max(len(a) - SR, 1) if off else 0
    b = loop_to(a[o:], d)
    put(sfx, fade(b.copy(), fi, fo), t0, gain)


T = lambda sid, k=0: t_of(SH[sid]["f0"]) if k == 0 else t_of(SH[sid]["f1"])
# Act 1: Hiroshima morning (cicadas), office, home
seg(cic, 0.0, T("S01a", 1), 0.9, 1.0, 0.3)
seg(birds, 0.0, T("S01a", 1), 0.5)
seg(room, T("S01b"), T("S02", 1), 0.8)
seg(cic2, T("S01b"), T("S02", 1), 0.18)
put(sfx, clock_ticks(T("S02", 1) - T("S01b"), 1.0, 0.05), T("S01b"))
for i in range(5):
    put(sfx, paper[i % 3], T("S02") + 0.8 + i * 1.1, 0.25)
seg(pbirds, T("S03"), T("S03", 1), 0.6)
put(sfx, wood[0], T("S03") + 0.3, 0.35)
put(sfx, steps, T("S03") + 2.7, 0.6)
put(sfx, wood[2], T("S03", 1) - 1.4, 0.3)
# Hiroshima street
seg(cic, T("S04"), flash1, 1.0, 0.2, 0.0, off=10)
seg(birds, T("S04"), flash1, 0.4, 0.2, 0.0)
seg(hum, T("S04"), T("S04") + 2.5, 0.8, 0.2, 1.0)
put(sfx, bell, T("S04") + 0.4, 0.5)          # streetcar bell ("chin-chin densha")
put(sfx, bell, T("S04") + 0.75, 0.4)
put(sfx, steps, T("S04") + 0.6, 0.7)
put(sfx, steps[:int(1.6 * SR)], T("S05a"), 0.5)
put(sfx, fade(b29_drone(flash1 - T("S05a") + 0.5), 2.0, 0.0), T("S05a") - 0.5, 0.9)
# Flash 1: everything drops out; ringing; sub boom; then the blast wave
sfx[int(flash1 * SR):int((flash1 + 0.03) * SR)] *= 0
put(sfx, fade(tinnitus(9.0), 0.02, 5.0), flash1, 1.0)
put(sfx, sub_boom(5.0), flash1 + 0.05, 0.6)
blast = T("S06b") + 26 / 30 + 0.35
put(sfx, expl, blast - 0.15, 0.9)
put(sfx, thunder, blast, 0.7)
put(sfx, rumble, blast + 0.2, 0.8)
seg(wind[0], blast - 0.4, T("S07") + 3, 1.6, 0.2, 2.5)
for i in range(8):
    put(sfx, (wood + stones)[i % 6], blast + 0.2 + i * 0.25, 0.5)
# Aftermath: muffled, deafened (low-passed bed)
after = np.zeros((int((T("S08", 1) - T("S07")) * SR), 2), np.float32)
after += loop_to(wind[1], len(after) / SR) * 0.9
after += loop_to(fire, len(after) / SR) * 0.35
after = lp(after, 900)
put(sfx, fade(after, 1.5, 1.5), T("S07"))
put(sfx, breath, T("S07") + 1.2, 0.7)
put(sfx, heart[:int(6 * SR)], T("S07") + 0.5, 0.6)
put(sfx, fade(tinnitus(6, 3900), 1.0, 4.0), T("S07"), 0.35)
seg(rumble, T("S08"), T("S08", 1), 0.25, 1.0, 1.0)
seg(fire, T("S09"), T("S09", 1), 0.9, 0.6, 0.6)
seg(wind[2], T("S09"), T("S09", 1), 0.4)
# Train
seg(steam[0], T("S10"), T("S10") + 1.6, 0.9, 0.05, 0.6)
seg(engine, T("S10"), T("S10", 1), 0.5, 0.5, 0.5)
put(sfx, steps, T("S10") + 0.3, 0.5)
# Nagasaki 9 August
seg(waves, T("S11"), T("S11", 1), 0.7)
seg(pbirds, T("S11"), T("S11", 1), 0.4)
put(sfx, steps, T("S11") + 0.2, 0.5)
seg(room, T("S12a"), flash2, 0.9, 0.4, 0.0)
put(sfx, clock_ticks(flash2 - T("S12a"), 1.0, 0.05), T("S12a"))
put(sfx, clock_ticks(T("S13a", 1) - T("S13a"), 1.0, 0.12), T("S13a"))
put(sfx, heart[:int((flash2 - T("S12b")) * SR)], T("S12b"), 0.45)
sfx[int(flash2 * SR):int((flash2 + 0.03) * SR)] *= 0
put(sfx, fade(tinnitus(7.0, 4500), 0.02, 4.0), flash2, 0.9)
put(sfx, sub_boom(4.0), flash2 + 0.05, 0.6)
put(sfx, rumble, flash2 + 0.35, 0.8)
put(sfx, thunder, flash2 + 0.5, 0.6)
for i, g in enumerate(glass):
    put(sfx, g, flash2 + 0.45 + i * 0.12, 0.6)
for i in range(3):
    put(sfx, paper[i], flash2 + 0.6 + i * 0.3, 0.5)
seg(wind[3], flash2 + 0.3, T("S14", 1), 1.2, 0.1, 1.5)
put(sfx, breath, T("S14") + 0.5, 0.6)
put(sfx, stones[0], T("S14") + 1.5, 0.3)
seg(rumble, T("S15a"), T("S15a", 1), 0.35, 0.5, 0.5)
seg(wind[1], T("S15a"), T("S15c", 1), 0.45, 0.5, 1.5)
# Later life
seg(room, T("S16"), T("S16", 1), 0.6)
put(sfx, clock_ticks(T("S16", 1) - T("S16"), 1.0, 0.04), T("S16"))
put(sfx, paper[1], T("S16") + 0.6, 0.2)
hall = lp(loop_to(room, T("S17", 1) - T("S17")), 800) * 1.4
put(sfx, fade(hall, 0.5, 0.5), T("S17"))
put(sfx, clock_ticks(T("S18b", 1) - T("S18a"), 1.0, 0.035), T("S18a"))
seg(pbirds, T("S18a"), T("S18b", 1), 0.25)
seg(waves, T("S19"), T("S19", 1), 0.6, 0.5, 0.5, off=20)
seg(birds, T("S19"), T("S19", 1), 0.25)
seg(water_lap, T("S20"), DUR - 0.5, 0.7, 0.8, 4.0)
put(sfx, temple_bell(10.0), T("S20") + 2.5, 0.8)

# ---------------------------------------------------------------- master
sfx = hp(sfx, 25)
sfx *= (1.0 - 0.35 * sm)[:, None]     # keep narration intelligible over effects
mix = nar * 1.0 + mus * 0.85 + sfx * 0.75
# gentle limiter
peak = np.max(np.abs(mix))
mix = np.tanh(mix * 1.2) / np.tanh(1.2)
mix = fade(mix, 0.05, 1.0)
sf.write(f"{ROOT}/audio/mix.wav", mix, SR, subtype='PCM_24')
sf.write(f"{ROOT}/audio/stem_narration.wav", nar, SR, subtype='PCM_16')
sf.write(f"{ROOT}/audio/stem_music.wav", mus, SR, subtype='PCM_16')
sf.write(f"{ROOT}/audio/stem_sfx.wav", sfx, SR, subtype='PCM_16')
print("mix", mix.shape[0] / SR, "s; peak before limiter", round(float(peak), 3))
