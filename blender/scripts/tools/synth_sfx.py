"""Procedural sound design for "Stranded" (48 kHz). Run with /opt/tts/bin/python.
Every sound here is synthesised from noise/oscillators - no third-party recordings."""
import numpy as np, soundfile as sf
from scipy import signal
SR = 48000
OUT = '/home/user/code/audio/sfx/'
rng = np.random.default_rng(7)

def norm(x, peak=0.9):
    return x / (np.abs(x).max() + 1e-9) * peak

def colored(n, slope_db_oct=-6.0, lo=20, hi=20000):
    """noise with spectral slope (dB/octave) band-limited to [lo, hi]"""
    X = np.fft.rfft(rng.standard_normal(n))
    f = np.fft.rfftfreq(n, 1 / SR); f[0] = 1
    g = (f / 1000.0) ** (slope_db_oct / 6.0206)
    g[(f < lo) | (f > hi)] = 0
    return np.fft.irfft(X * g, n)

def bp(x, lo, hi, order=4):
    sos = signal.butter(order, [lo, hi], 'bandpass', fs=SR, output='sos'); return signal.sosfiltfilt(sos, x)

def lp(x, fc, order=4):
    sos = signal.butter(order, fc, 'lowpass', fs=SR, output='sos'); return signal.sosfiltfilt(sos, x)

def hp(x, fc, order=4):
    sos = signal.butter(order, fc, 'highpass', fs=SR, output='sos'); return signal.sosfiltfilt(sos, x)

def smooth_env(n, rate_hz, seed, lo=0.2, hi=1.0):
    r = np.random.default_rng(seed)
    k = int(n / SR * rate_hz) + 3
    pts = r.uniform(lo, hi, k)
    x = np.linspace(0, k - 3, n)
    return np.interp(x, np.arange(k), pts)

def stereo(l, r=None, width=0.0):
    if r is None:
        d = int(SR * 0.012)
        r = np.roll(l, d) * (1 - width) + l * width
    return np.stack([l, r], 1)

def ocean_bed(sec=40, seed=1):
    """Open-ocean surface: no surf - slow swell sloshes, bubbling foam hiss, light wind."""
    n = int(sec * SR); out = np.zeros(n)
    # sloshes: band-passed noise bursts with slow attack/decay at irregular swell intervals
    r = np.random.default_rng(seed)
    t = 0.0
    while t < sec:
        dur = r.uniform(1.6, 3.2); a = int(t * SR); b = min(n, a + int(dur * SR))
        env = np.sin(np.linspace(0, np.pi, b - a)) ** r.uniform(1.5, 3.0)
        burst = bp(colored(b - a, -3), r.uniform(250, 450), r.uniform(1800, 3500)) * env * r.uniform(0.5, 1.0)
        out[a:b] += burst
        t += r.uniform(0.9, 2.4)
    # foam fizz
    fizz = hp(colored(n, -4), 3000) * smooth_env(n, 0.7, seed + 3, 0.1, 0.6) * 0.07
    # low swell body
    body = lp(colored(n, -6), 300) * smooth_env(n, 0.25, seed + 4, 0.3, 1.0) * 0.8
    # wind
    wind = bp(colored(n, -3), 300, 1400, 2) * smooth_env(n, 0.15, seed + 5, 0.2, 0.7) * 0.35
    L = norm(out * 0.9 + fizz + body + wind, 0.7)
    out2 = np.roll(out, int(SR * 0.37))
    R = norm(out2 * 0.9 + np.roll(fizz, 9000) + body + wind, 0.7)
    return np.stack([L, R], 1)

def underwater_bed(sec=30, seed=2):
    n = int(sec * SR)
    rumble = lp(colored(n, -9), 180) * smooth_env(n, 0.3, seed, 0.5, 1.0)
    hiss = bp(colored(n, -3), 400, 1200, 2) * 0.08 * smooth_env(n, 0.5, seed + 1, 0.3, 1.0)
    x = norm(rumble + hiss, 0.7)
    return stereo(x, np.roll(x, 2400) * 0.9 + x * 0.1)

def bubble(f0, dur, amp=1.0):
    n = int(dur * SR); t = np.arange(n) / SR
    f = f0 * (1 + 0.9 * t / dur)            # pitch rises as the bubble shrinks/rises
    ph = 2 * np.pi * np.cumsum(f) / SR
    env = np.exp(-t / (dur * 0.35)) * (1 - np.exp(-t / 0.002))
    return np.sin(ph) * env * amp

def bubbles(sec=4.0, density=60, seed=3, fmin=300, fmax=1800):
    n = int(sec * SR); out = np.zeros(n); r = np.random.default_rng(seed)
    for i in range(int(density * sec)):
        t0 = r.uniform(0, sec - 0.1); f0 = np.exp(r.uniform(np.log(fmin), np.log(fmax)))
        b = bubble(f0, r.uniform(0.03, 0.12), r.uniform(0.2, 1.0))
        a = int(t0 * SR); out[a:a + len(b)] += b[:max(0, n - a)]
    out *= np.minimum(1, np.linspace(3, 0, n))  # decaying burst
    return stereo(norm(lp(out, 6000), 0.6))

def heartbeat(sec=6.0, bpm=70, seed=4):
    n = int(sec * SR); out = np.zeros(n); per = 60 / bpm
    def thump(f, dur):
        m = int(dur * SR); t = np.arange(m) / SR
        return np.sin(2 * np.pi * f * t * (1 - 0.3 * t / dur)) * np.exp(-t / (dur * 0.25)) * (1 - np.exp(-t / 0.004))
    t = 0.2
    while t < sec - 0.5:
        a = int(t * SR)
        for off, amp in ((0.0, 1.0), (0.24, 0.7)):
            th = thump(52, 0.22) * amp; b = a + int(off * SR); out[b:b + len(th)] += th[:max(0, n - b)]
        t += per
    return stereo(norm(lp(out, 200), 0.8))

def whoosh(dur=0.9, up=True, seed=5):
    n = int(dur * SR); t = np.linspace(0, 1, n)
    x = colored(n, -3)
    # time-varying band-pass via short-time FFT sweep
    out = np.zeros(n); hop = 512; win = np.hanning(2048)
    for s in range(0, n - 2048, hop):
        c = s / n
        fc = 300 + 3500 * (c if up else 1 - c)
        seg = x[s:s + 2048] * win
        X = np.fft.rfft(seg); f = np.fft.rfftfreq(2048, 1 / SR)
        X *= np.exp(-((np.log(f + 1) - np.log(fc)) ** 2) / 0.35)
        out[s:s + 2048] += np.fft.irfft(X, 2048) * win
    env = np.sin(np.pi * t) ** 1.6
    o = norm(out * env, 0.8)
    pan = np.linspace(0.2, 0.8, n) if up else np.linspace(0.8, 0.2, n)
    return np.stack([o * (1 - pan) * 1.4, o * pan * 1.4], 1)

def sub_hit(dur=2.5):
    n = int(dur * SR); t = np.arange(n) / SR
    f = 55 * np.exp(-t * 1.2) + 28
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.7)
    x += lp(colored(n, -6), 900) * np.exp(-t / 0.08) * 0.6
    return stereo(norm(x, 0.95))

def heli_synth(sec=12.0, seed=6):
    """MH-65-like: fenestron whine + main-rotor blade slap (4 blades x 5.8 rev/s) + turbine."""
    n = int(sec * SR); t = np.arange(n) / SR
    bpf = 4 * 5.8
    phase = (t * bpf) % 1.0
    slap = np.exp(-phase / 0.06) * lp(colored(n, -3), 900) * 3
    thump = np.sin(2 * np.pi * bpf * t) * 0.4
    whine = (np.sin(2 * np.pi * 1180 * t) * 0.05 + np.sin(2 * np.pi * 2360 * t) * 0.02) * smooth_env(n, 0.5, seed, 0.7, 1.0)
    turb = bp(colored(n, -3), 600, 4000, 2) * 0.25
    x = norm(lp(slap + thump, 2500) + whine + turb, 0.8)
    return stereo(x)

def save(name, x):
    sf.write(OUT + name + '.wav', x.astype(np.float32), SR)
    print('wrote', name, x.shape[0] / SR)

save('ocean_bed', ocean_bed(45, 1))
save('ocean_bed_calm', ocean_bed(45, 11) * 0.6)
save('underwater_bed', underwater_bed(30))
save('bubbles_burst', bubbles(4.0, 80, 3))
save('bubbles_small', bubbles(2.5, 25, 8, 600, 2500))
save('heartbeat', heartbeat(8.0, 72))
save('whoosh_up', whoosh(0.8, True))
save('whoosh_down', whoosh(1.0, False))
save('sub_hit', sub_hit(3.0))
save('heli_synth', heli_synth(14.0))

def wind_bed(sec=40, seed=9):
    n = int(sec * SR)
    w = bp(colored(n, -4), 150, 2200, 2) * smooth_env(n, 0.2, seed, 0.25, 1.0)
    gust = bp(colored(n, -2), 600, 3000, 2) * smooth_env(n, 0.35, seed + 1, 0.0, 0.5) * 0.4
    x = norm(w + gust, 0.7)
    return stereo(x, np.roll(x, 7000))

def rain_bed(sec=8, seed=10):
    n = int(sec * SR); out = hp(colored(n, -1), 1500) * 0.25
    r = np.random.default_rng(seed)
    for i in range(int(900 * sec)):   # individual drops hitting water
        a = r.integers(0, n - 2000); m = r.integers(300, 1500)
        tt = np.arange(m) / SR
        out[a:a + m] += np.sin(2 * np.pi * r.uniform(1800, 5000) * tt) * np.exp(-tt / 0.004) * r.uniform(0.05, 0.4)
    return stereo(norm(out, 0.7), norm(np.roll(out, 5000), 0.7))

def sparkle(sec=6, seed=11):
    n = int(sec * SR); out = np.zeros(n); r = np.random.default_rng(seed)
    for i in range(int(14 * sec)):
        a = r.integers(0, n - 30000); m = 24000; tt = np.arange(m) / SR
        out[a:a + m] += np.sin(2 * np.pi * r.uniform(2200, 4800) * tt) * np.exp(-tt / 0.25) * r.uniform(0.2, 1.0)
    return stereo(norm(out, 0.5), norm(np.roll(out, 3000), 0.5))

save('ocean_bed', ocean_bed(45, 1))
save('ocean_bed_calm', ocean_bed(45, 11) * 0.6)
save('wind_bed', wind_bed(40))
save('rain_bed', rain_bed(8))
save('sparkle', sparkle(6))
