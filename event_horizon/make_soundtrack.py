"""
Procedural 60 s soundtrack for EVENT HORIZON (numpy only).

    python3 make_soundtrack.py soundtrack.wav

Cues follow the picture: ambient drone and a soft pad while the astronaut
walks, a sub-bass swell when the black hole opens (22.4 s), cracking and
rumble while the planet breaks up (30-46 s), a rising tension glide during
the fall, a final impact (57.95 s), silence on the cut to black and a bell
under the title.
"""
import sys
import wave
import numpy as np

SR = 48000
DUR = 60.0
N = int(SR * DUR)
t = np.arange(N) / SR
rng = np.random.default_rng(11)


def env(points):
    xs, ys = zip(*points)
    return np.interp(t, xs, ys)


def tone(freq, phase=0.0):
    return np.sin(2 * np.pi * freq * t + phase)


def glide(f0, f1, t0, t1, curve="exp"):
    f = np.full(N, f0, dtype=float)
    m = (t >= t0) & (t <= t1)
    u = (t[m] - t0) / (t1 - t0)
    f[m] = f0 * (f1 / f0) ** u if curve == "exp" else f0 + (f1 - f0) * u
    f[t > t1] = f1
    return np.sin(2 * np.pi * np.cumsum(f) / SR)


def filtered_noise(lo, hi, slope=0.0):
    """band-limited noise via FFT; slope<0 tilts towards the lows (brown-ish)"""
    x = rng.standard_normal(N)
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(N, 1 / SR)
    g = ((f >= lo) & (f <= hi)).astype(float)
    g *= (np.maximum(f, 1.0) / 100.0) ** slope
    y = np.fft.irfft(X * g, n=N)
    return y / (np.abs(y).max() + 1e-9)


def hit(t0, length, decay):
    e = np.zeros(N)
    m = (t >= t0) & (t < t0 + length)
    e[m] = np.exp(-(t[m] - t0) / decay)
    return e


def channel(seed_detune):
    out = np.zeros(N)
    # 1. drone (E / A fifths), detuned pairs for a slow chorus
    drone = np.zeros(N)
    for f, a in ((41.2, 0.9), (55.0, 0.8), (82.41, 0.5), (110.0, 0.3), (164.8, 0.15)):
        for d in (-0.13, 0.11 + seed_detune):
            drone += a * tone(f + d, rng.uniform(0, 6.28))
    drone *= 0.75 + 0.25 * np.sin(2 * np.pi * 0.07 * t)
    out += 0.05 * drone * env([(0, 0), (5, 0.55), (21, 0.6), (22.4, 0.45), (28, 0.85),
                               (46, 0.9), (57.9, 1.0), (58.05, 0.0), (60, 0.0)])
    # 2. soft high pad while walking (wonder)
    pad = sum(a * tone(f + seed_detune * 2) for f, a in ((220.0, 0.5), (329.6, 0.35), (440.0, 0.25), (493.9, 0.12)))
    pad *= 0.6 + 0.4 * np.sin(2 * np.pi * 0.25 * t)
    out += 0.028 * pad * env([(0, 0), (6, 0.0), (11, 1.0), (19.5, 1.0), (23, 0.0)])
    # 3. black hole opens: sub sweep + dark whoosh
    out += 0.42 * glide(95, 26, 22.4, 26.0) * hit(22.4, 6.0, 1.6)
    out += 0.18 * filtered_noise(20, 260, -0.8) * env([(21.6, 0), (22.6, 1.0), (27.0, 0.25), (30, 0)])
    # 4. dissonant tritone beating under the threat
    out += 0.05 * (tone(77.78) + tone(58.27 + seed_detune)) * env([(22.4, 0), (28, 0.6), (46, 1.0), (57.9, 1.2),
                                                                   (58.05, 0)])
    # 5. planet-wide rumble
    out += 0.30 * filtered_noise(18, 140, -1.2) * env([(28.4, 0), (31, 0.45), (40, 0.85), (50, 0.7),
                                                       (57.9, 1.0), (58.05, 0)])
    # 6. cracks: short crunches with a thump each
    crack_noise = filtered_noise(250, 4000, -0.3)
    for tc in sorted(rng.uniform(30.4, 38.5, 16)):
        out += 0.35 * crack_noise * hit(tc, 0.5, 0.07)
        out += 0.3 * tone(58 + rng.uniform(-8, 8)) * hit(tc, 0.8, 0.22)
    # 7. rising tension: glide + noise riser
    rise = glide(110, 440, 46.0, 57.95) + 0.5 * glide(165, 660, 46.0, 57.95)
    out += 0.07 * rise * env([(45.5, 0), (50, 0.4), (57.9, 1.0), (57.96, 0)])
    out += 0.16 * filtered_noise(1500, 12000, 0.2) * env([(48, 0), (57.9, 1.0), (57.96, 0)]) ** 2
    # 8. impact at the flash, then silence on black
    out += 0.9 * glide(70, 24, 57.95, 59.0) * hit(57.95, 0.9, 0.3) * env([(58.3, 1), (58.55, 0)])
    out += 0.4 * filtered_noise(20, 400, -0.5) * hit(57.95, 0.7, 0.18) * env([(58.3, 1), (58.55, 0)])
    # 9. bell under the title
    bell = sum(a * tone(f) for f, a in ((880.0, 0.5), (1318.5, 0.25), (2217.0, 0.1)))
    out += 0.08 * bell * hit(58.9, 1.1, 0.45) * env([(59.85, 1), (60, 0)])
    return out


left = channel(0.0)
right = channel(0.07)
st = np.stack([left, right], axis=1)
st = np.tanh(st * 1.4) / np.tanh(1.4)
st *= 0.89 / np.abs(st).max()
pcm = (st * 32767).astype("<i2")

out = sys.argv[1] if len(sys.argv) > 1 else "soundtrack.wav"
with wave.open(out, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print("wrote", out)
