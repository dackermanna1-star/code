"""
Procedural soundtrack for GLITCH CUBE (60 s, 48 kHz stereo WAV).

Synthesised from scratch with numpy and timed to the same story beats as
glitch_cube.py.  Glitch bursts and shard impacts come from cues.json, which
glitch_cube.py exports from its own glitch schedule and shard simulation:

  blender -b --factory-startup -P glitch_cube.py -- cues.json
  python3 soundtrack.py cues.json soundtrack.wav
"""

import json
import sys
import wave

import numpy as np

SR = 48000
DUR = 60.0
N = int(SR * DUR)
t = np.arange(N) / SR
rng = np.random.default_rng(2024)
L = np.zeros(N)
R = np.zeros(N)

cues = json.load(open(sys.argv[1] if len(sys.argv) > 1 else "cues.json"))
out_path = sys.argv[2] if len(sys.argv) > 2 else "soundtrack.wav"

# story beats (seconds) - mirror glitch_cube.py
T_FRACTURE, T_DISTORT, T_FALL, T_FLIP = 21.0, 30.0, 38.0, 39.5
T_IMPOSSIBLE, T_COLLAPSE, T_SINGULAR, T_SNAP = 42.0, 46.0, 49.5, 52.0
T_ASSEMBLED, T_SETTLE, T_FADE = 52.5, 57.0, 58.5


# ----------------------------------------------------------------- helpers
def curve(keys, x=t):
    k = np.array(keys, dtype=float)
    return np.interp(x, k[:, 0], k[:, 1])


def smoothstep(x):
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)


def seg(x, a, b):
    return np.clip((x - a) / (b - a), 0, 1)


def place(sig, t0, pan=0.0, gain=1.0):
    """Mix a mono signal into the stereo bus at time t0 (constant-power pan)."""
    i = int(round(t0 * SR))
    if i < 0:
        sig = sig[-i:]
        i = 0
    n = min(len(sig), N - i)
    if n <= 0:
        return
    pan = float(np.clip(pan, -1, 1))
    a = (pan + 1) * np.pi / 4
    L[i:i + n] += sig[:n] * gain * np.cos(a) * 1.4142
    R[i:i + n] += sig[:n] * gain * np.sin(a) * 1.4142


def place_stereo(l, r, t0=0.0, gain=1.0):
    i = int(round(t0 * SR))
    n = min(len(l), N - i)
    L[i:i + n] += l[:n] * gain
    R[i:i + n] += r[:n] * gain


def shaped_noise(n, lo, hi, tilt=0.0, seed=None):
    """Band-limited noise via spectral shaping (tilt in dB/octave)."""
    g = np.random.default_rng(seed) if seed is not None else rng
    spec = g.normal(size=n // 2 + 1) + 1j * g.normal(size=n // 2 + 1)
    f = np.fft.rfftfreq(n, 1 / SR)
    f[0] = 1
    mask = (f >= lo) & (f <= hi)
    spec *= mask * (f / 1000.0) ** (tilt / 6.02)
    x = np.fft.irfft(spec, n)
    return x / (np.abs(x).max() + 1e-9)


def onepole_lp(x, cutoff):
    """Time-varying one-pole low-pass (cutoff array in Hz). Loop - use on short signals."""
    cutoff = np.broadcast_to(cutoff, x.shape)
    a = np.exp(-2 * np.pi * cutoff / SR)
    y = np.empty_like(x)
    s = 0.0
    for i in range(len(x)):
        s = (1 - a[i]) * x[i] + a[i] * s
        y[i] = s
    return y


def env_ad(n, attack, decay_tau):
    tt = np.arange(n) / SR
    e = np.exp(-np.maximum(tt - attack, 0) / decay_tau)
    if attack > 0:
        e *= np.clip(tt / attack, 0, 1)
    return e


def sine_sweep(dur, f0, f1, curve_pow=1.0):
    n = int(dur * SR)
    u = np.linspace(0, 1, n) ** curve_pow
    f = f0 * (f1 / f0) ** u
    return np.sin(2 * np.pi * np.cumsum(f) / SR)


def ping(freq, dur, tau, partials=((1, 1.0),)):
    n = int(dur * SR)
    tt = np.arange(n) / SR
    s = sum(a * np.sin(2 * np.pi * freq * m * tt) * np.exp(-tt / (tau / m ** 0.5)) for m, a in partials)
    return s * np.clip(tt / 0.002, 0, 1)


def click(bright=1.0, dur=0.03):
    n = int(dur * SR)
    nz = rng.normal(size=n) * env_ad(n, 0.0, 0.0018)
    nz = np.diff(nz, prepend=0) * bright                     # high-passed transient
    body = ping(1900 + 600 * bright, dur, 0.008)
    return nz * 0.8 + body * 0.25


def thud(freq=55, dur=0.6, tau=0.18, drop=0.5):
    n = int(dur * SR)
    tt = np.arange(n) / SR
    f = freq * (1 + drop * np.exp(-tt / 0.04))
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt / tau)


def whoosh(dur, f0, f1, seed=None):
    n = int(dur * SR)
    nz = shaped_noise(n, 80, 12000, -1.5, seed)
    u = np.linspace(0, 1, n)
    cut = f0 * (f1 / f0) ** u
    y = onepole_lp(onepole_lp(nz, cut), cut)
    return y * np.sin(np.pi * u) ** 2 / (np.abs(y).max() + 1e-9)


# --------------------------------------------------------------- 1. drone
# Low D drone whose pitch bends with the physics: wobble during the space
# distortion, dive on the fall, lift on the reversed gravity, a two-octave
# riser into the collapse, then nothing inside the singularity.
bend = np.zeros(N)
bend += 1.2 * np.sin(2 * np.pi * 0.35 * (t - T_DISTORT)) * smoothstep(seg(t, T_DISTORT, 32)) * (t < T_FALL)
bend += curve([(0, 0), (T_FALL, 0), (T_FLIP, -5), (T_FLIP + 1.6, 7), (T_IMPOSSIBLE + 0.5, 0), (60, 0)])
bend += 24 * seg(t, T_COLLAPSE, T_SINGULAR) ** 2.2
f_drone = 36.71 * 2 ** (bend / 12)                          # D1
ph = 2 * np.pi * np.cumsum(f_drone) / SR
ph2 = 2 * np.pi * np.cumsum(f_drone * 1.004) / SR
drone = (np.sin(ph) + 0.6 * np.sin(2 * ph2) + 0.35 * np.sin(3 * ph + 0.4 * np.sin(0.5 * ph))
         + 0.22 * np.sin(1.5 * ph2 * 2) + 0.12 * np.sin(5 * ph))
amp = curve([(0, 0), (1.0, 0), (2.5, 0.10), (6, 0.14), (13, 0.18), (T_FRACTURE, 0.2), (T_DISTORT, 0.22),
             (T_FALL, 0.24), (T_COLLAPSE, 0.24), (T_SINGULAR - 0.02, 0.5), (T_SINGULAR, 0), (60, 0)])
amp *= 1 + 0.15 * np.sin(2 * np.pi * 0.13 * t)
place_stereo(drone * amp * (1 + 0.1 * np.sin(2 * np.pi * 0.07 * t)), drone * amp * (1 - 0.1 * np.sin(2 * np.pi * 0.07 * t)))

# room tone / air
air = shaped_noise(N, 40, 9000, -4.5, 1)
air_r = shaped_noise(N, 40, 9000, -4.5, 2)
air_amp = curve([(0, 0.02), (T_DISTORT, 0.03), (T_SINGULAR - 0.02, 0.09), (T_SINGULAR, 0.0), (T_SNAP, 0.0),
                 (T_SNAP + 0.01, 0.03), (59.5, 0.015), (60, 0)])
place_stereo(air * air_amp, air_r * air_amp)

# ---------------------------------------------------- 2. studio light clicks
light_master = np.zeros(N)
on_pat = [(0.0, 0), (0.50, 1), (0.56, 0), (0.78, 0.7), (0.86, 0.1), (1.05, 1)]
off_pat = [(T_FADE + d, v) for d, v in [(0.06, 0), (0.12, 0.6), (0.18, 0.0), (0.30, 0.25), (0.34, 0)]]
prev = 0
for t0, v in on_pat + off_pat:
    light_master[int(t0 * SR):] = v
    if v != prev:
        place(click(1.0 if v > prev else 0.6), t0, pan=0.35, gain=0.55)
    prev = v
light_master[int(T_SINGULAR * SR):int(T_SNAP * SR)] = 0
hum_ph = 2 * np.pi * 100 * t
hum = (np.sin(hum_ph) + 0.5 * np.sin(2 * hum_ph) + 0.3 * np.sin(3 * hum_ph) + 0.2 * np.sin(5 * hum_ph))
place_stereo(hum * light_master * 0.008, hum * light_master * 0.008)

# --------------------------------------------------------- 3. glitch bursts
for ei, (t0, t1, s) in enumerate(cues["glitch"]):
    n = int((t1 - t0) * SR)
    if n <= 0:
        continue
    g = np.random.default_rng(100 + ei)
    sig = np.zeros(n)
    step = SR // 12                                          # re-randomised every 2 video frames
    for k in range(0, n, step):
        m = min(step, n - k)
        tt = np.arange(m) / SR
        kind = g.integers(3)
        if kind == 0:                                        # square buzz
            f = g.uniform(150, 2400)
            chunk = np.sign(np.sin(2 * np.pi * f * tt))
        elif kind == 1:                                      # bit-crushed noise
            chunk = np.round(g.normal(size=m) * 2) / 2
            chunk = np.repeat(chunk[::8], 8)[:m]
        else:                                                # data chirp
            chunk = np.sign(np.sin(2 * np.pi * np.cumsum(np.linspace(g.uniform(300, 900), g.uniform(2000, 6000), m)) / SR))
        chunk *= g.uniform(0.4, 1.0)
        sig[k:k + m] = chunk
    edge = np.minimum(1, np.minimum(np.arange(n), n - np.arange(n)) / 60)
    place(sig * edge, t0, pan=float(np.random.default_rng(ei).uniform(-0.7, 0.7)), gain=0.09 * s)
    place(thud(48, 0.25, 0.06, 1.0), t0, gain=0.25 * s)

# ------------------------------------------ 4. echoes, stretch, orbit, retract
for i in range(6):
    place(whoosh(0.9, 250, 5000, 10 + i), 13.0 + 0.09 * i - 0.25, pan=[0.8, -0.8, 0.3, -0.3, 0.1, -0.1][i], gain=0.22)
    place(ping([293.66, 369.99, 440.0, 587.33, 739.99, 880.0][i], 1.8, 0.5, ((1, 1), (2.01, 0.3), (3.0, 0.1))),
          13.25 + 0.09 * i, pan=[0.8, -0.8, 0.3, -0.3, 0.1, -0.1][i], gain=0.05)
# rubber stretch tone
st = smoothstep(seg(t, 16.0, 16.8)) - smoothstep(seg(t, 18.0, 18.6))
f_rub = 150 * (1 + 1.4 * st) * (1 + 0.03 * np.sin(2 * np.pi * 6.5 * t))
rub = np.sin(2 * np.pi * np.cumsum(f_rub) / SR)
rub = rub + 0.4 * np.sin(2 * np.pi * np.cumsum(f_rub * 2.01) / SR)
place_stereo(rub * st * 0.07, rub * st * 0.07)
# orbit passes
for k, (t0, pan) in enumerate([(18.5, -0.9), (18.95, 0.9), (19.4, -0.6), (19.75, 0.6)]):
    place(whoosh(0.7, 400, 3500, 30 + k), t0, pan=pan, gain=0.18)
# retract: reversed whoosh into a solid knock
place(whoosh(0.6, 6000, 200, 40)[::-1], 19.95, gain=0.25)
place(thud(70, 0.5, 0.09, 0.8), 20.5, gain=0.45)
# pressure: rising whine + crackle
w = sine_sweep(0.5, 400, 1800, 2.0) * np.linspace(0, 1, int(0.5 * SR)) ** 2
place(w, 20.5, gain=0.06)
for k in range(60):
    tk = 20.5 + 0.5 * (k / 60) ** 0.5 + rng.uniform(0, 0.01)
    place(click(rng.uniform(0.5, 1.5), 0.015), tk, pan=rng.uniform(-0.6, 0.6), gain=0.12 * (k / 60))

# ------------------------------------------------------------- 5. fracture
place(thud(52, 2.5, 0.7, 1.2), T_FRACTURE, gain=0.9)
burst = shaped_noise(int(1.2 * SR), 200, 16000, -1.0, 50) * env_ad(int(1.2 * SR), 0.002, 0.18)
place(burst, T_FRACTURE, gain=0.35)
for k in range(160):                                         # glass shatter
    tk = T_FRACTURE + rng.exponential(0.16)
    f = rng.uniform(2200, 9000)
    place(ping(f, 0.25, rng.uniform(0.015, 0.08), ((1, 1), (1.47, 0.5), (2.13, 0.3))), tk,
          pan=rng.uniform(-1, 1), gain=rng.uniform(0.02, 0.07))
# floating crystals: sparse pentatonic chimes
scale = [587.33, 659.25, 739.99, 880.0, 987.77, 1174.66, 1318.51]
tk = 22.0
while tk < T_DISTORT:
    f = scale[rng.integers(len(scale))]
    place(ping(f, 3.0, 0.9, ((1, 1), (2.76, 0.25), (5.4, 0.08))), tk, pan=rng.uniform(-0.9, 0.9), gain=0.035)
    tk += rng.uniform(0.25, 0.9)

# ------------------------------------------------------ 6. space distortion
# "vertigo" pair: two tones pull apart in pitch during the dolly zoom
u = seg(t, 30.5, 36.0)
vert_amp = np.sin(np.pi * u) ** 2 * 0.06
f_up = 220 * 2 ** (u * 1.0)
f_dn = 220 * 2 ** (-u * 1.0)
v1 = np.sin(2 * np.pi * np.cumsum(f_up) / SR)
v2 = np.sin(2 * np.pi * np.cumsum(f_dn) / SR)
place_stereo(v1 * vert_amp, v2 * vert_amp)
# phasing warp bed
warp = shaped_noise(N, 100, 4000, -3, 60)
wenv = smoothstep(seg(t, T_DISTORT, 32)) * (1 - smoothstep(seg(t, 37, 38.5))) * 0.05
wmod = 0.5 + 0.5 * np.sin(2 * np.pi * 0.35 * t)
place_stereo(warp * wenv * wmod, warp * wenv * (1 - wmod))
place(whoosh(1.6, 150, 3000, 61), 29.2, gain=0.2)

# --------------------------------------------------------------- 7. gravity
place(whoosh(1.2, 4000, 150, 70), T_FALL - 0.1, gain=0.25)          # drop
swell = shaped_noise(int(0.9 * SR), 500, 14000, -1, 71) * np.linspace(0, 1, int(0.9 * SR)) ** 3
place(swell, T_FLIP - 0.9, gain=0.22)                               # reverse-cymbal into the flip
place(whoosh(1.0, 150, 5000, 72), T_FLIP, gain=0.25)                # sucked upward
place(thud(40, 1.2, 0.35, 0.6), T_FLIP, gain=0.35)
for (ti, speed, x) in cues["impacts"]:
    if ti >= T_IMPOSSIBLE + 0.6:
        continue
    gnd = min(1.0, speed / 5.0)
    place(thud(rng.uniform(80, 140), 0.25, 0.04, 0.6), ti, pan=x / 6, gain=0.18 * gnd)
    place(ping(rng.uniform(1800, 5200), 0.2, 0.03, ((1, 1), (1.6, 0.4))), ti, pan=x / 6, gain=0.07 * gnd)

# ------------------------------------------------------ 8. impossible motion
notes = [146.83, 220.0, 293.66, 369.99, 440.0, 369.99, 293.66, 220.0]   # D3 A3 D4 F#4 A4 ...
step = 0.125
k = 0
tk = T_IMPOSSIBLE
seq = []
while tk < T_COLLAPSE:
    f = notes[k % len(notes)] * (2 if (k // 16) % 2 else 1)
    n = int(0.2 * SR)
    tt = np.arange(n) / SR
    tri = 2 / np.pi * np.arcsin(np.sin(2 * np.pi * f * tt))
    note = tri * np.exp(-tt / 0.07) * np.clip(tt / 0.003, 0, 1)
    seq.append((tk, note, 0.6 * np.sin(k * 0.7)))
    tk += step
    k += 1
for tk, note, pan in seq:
    if 44.6 <= tk < 45.3:
        continue                                          # replaced by the rewind
    a = smoothstep((tk - T_IMPOSSIBLE) / 0.8)
    place(note, tk, pan=pan, gain=0.06 * a)
rew = [note for tk, note, pan in seq if 44.6 <= tk < 45.3]
if rew:
    rewind = np.concatenate([nt[:int(step * SR)] for nt in rew])[::-1]
    place(rewind, 44.6, gain=0.07)
place(sine_sweep(0.7, 1400, 180, 0.6) * env_ad(int(0.7 * SR), 0.01, 0.4), 44.6, gain=0.06)

# --------------------------------------------------------------- 9. collapse
n = int((T_SINGULAR - T_COLLAPSE) * SR)
u = np.linspace(0, 1, n)
riser_nz = shaped_noise(n, 60, 16000, -2, 80)
riser_nz = onepole_lp(riser_nz, 200 * (60) ** u)
riser_tone = sine_sweep(n / SR, 110, 1760, 1.8)
riser = (riser_nz / (np.abs(riser_nz).max() + 1e-9) * 0.6 + riser_tone * 0.25) * u ** 2.2
spin = np.sin(2 * np.pi * np.cumsum(0.3 + 6 * u ** 2) / SR)
place_stereo(riser * (1 + spin) * 0.5 * 0.35, riser * (1 - spin) * 0.5 * 0.35, T_COLLAPSE)

# ------------------------------------------------------------ 10. singularity
tb = T_SINGULAR
while tb < 51.5:
    place(thud(46, 0.6, 0.12, 0.3), tb, gain=0.55)
    place(thud(52, 0.5, 0.09, 0.3), tb + 0.16, gain=0.3)
    tb += 0.62
whine = np.sin(2 * np.pi * 6200 * t) * 0.004 * ((t >= T_SINGULAR) & (t < T_SNAP))
place_stereo(whine, whine)
n = int(0.43 * SR)
inhale = shaped_noise(n, 300, 15000, -1, 90) * np.linspace(0, 1, n) ** 4
place(inhale, 51.55, gain=0.4)

# ------------------------------------------------------------------ 11. snap
place(thud(42, 3.0, 0.9, 1.6), T_SNAP, gain=1.0)
crack = shaped_noise(int(0.4 * SR), 800, 18000, 0, 91) * env_ad(int(0.4 * SR), 0.0005, 0.035)
place(crack, T_SNAP, gain=0.6)
clack = ping(1230, 1.0, 0.25, ((1, 1), (2.21, 0.6), (3.33, 0.4), (4.87, 0.2)))
place(clack, T_SNAP, gain=0.18)
for k in range(48):                                          # shards locking together
    tk = T_SNAP + 0.1 + 0.4 * (1 - (1 - k / 48) ** 2) + rng.uniform(-0.01, 0.01)
    place(click(rng.uniform(0.8, 1.6), 0.02), tk, pan=rng.uniform(-0.7, 0.7), gain=0.1)
place(click(2.0, 0.05), T_ASSEMBLED + 0.04, gain=0.6)
place(thud(80, 0.4, 0.06, 0.4), T_ASSEMBLED + 0.04, gain=0.35)

# ---------------------------------------------------------- 12. resolution
chord = [146.83, 220.0, 293.66, 329.63, 369.99, 440.0, 587.33]     # D major add9
pad_env = curve([(0, 0), (T_SNAP + 0.3, 0), (T_SNAP + 2.5, 1), (T_FADE, 1), (59.9, 0), (60, 0)])
padL = np.zeros(N)
padR = np.zeros(N)
for i, f in enumerate(chord):
    for det, side in ((1.0, 0), (1.0035, 1)):
        s = np.sin(2 * np.pi * f * det * t + i) + 0.25 * np.sin(4 * np.pi * f * det * t)
        (padL if side == 0 else padR)[:] += s / len(chord)
place_stereo(padL * pad_env * 0.12, padR * pad_env * 0.12)
place(click(1.6, 0.04), T_SETTLE, gain=0.5)                           # the final square-up
place(ping(1174.66, 4.0, 1.4, ((1, 1), (2.0, 0.3), (3.01, 0.12), (4.2, 0.05))), T_SETTLE, gain=0.12)
place(ping(1760.0, 4.0, 1.2, ((1, 1), (2.0, 0.2))), T_SETTLE + 0.03, gain=0.05)

# ------------------------------------------------------- reverb and master
ir_n = int(2.4 * SR)
ir_t = np.arange(ir_n) / SR
irL = rng.normal(size=ir_n) * np.exp(-ir_t / 0.55)
irR = rng.normal(size=ir_n) * np.exp(-ir_t / 0.55)
irL[:int(0.012 * SR)] = 0
irR[:int(0.017 * SR)] = 0
irL /= np.sqrt((irL ** 2).sum())
irR /= np.sqrt((irR ** 2).sum())
size = 1 << int(np.ceil(np.log2(N + ir_n)))


def conv(x, h):
    return np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(h, size), size)[:N]


wetL = conv(L, irL)
wetR = conv(R, irR)
mixL = L + 0.35 * wetL
mixR = R + 0.35 * wetR
peak = max(np.abs(mixL).max(), np.abs(mixR).max())
mixL = np.tanh(mixL / peak * 1.3) / np.tanh(1.3)
mixR = np.tanh(mixR / peak * 1.3) / np.tanh(1.3)
fade = np.clip((DUR - t) / 0.4, 0, 1)
mixL *= 0.89 * fade
mixR *= 0.89 * fade
pcm = np.empty(2 * N, dtype=np.int16)
pcm[0::2] = np.clip(mixL * 32767, -32768, 32767).astype(np.int16)
pcm[1::2] = np.clip(mixR * 32767, -32768, 32767).astype(np.int16)
with wave.open(out_path, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print("wrote", out_path)
