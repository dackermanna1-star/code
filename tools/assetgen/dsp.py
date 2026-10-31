"""Minimal pure-numpy DSP toolkit for synthesising game audio.

Everything works on float64 arrays at 44.1 kHz.  Mono signals are 1-D, stereo
signals are (n, 2).  Filters are implemented in the frequency domain with
minimum-phase responses (no pre-ringing on transients); `circular=True`
variants keep loops perfectly seamless.
"""
from __future__ import annotations

import math
import subprocess
from pathlib import Path

import numpy as np

SR = 44100
PI = math.pi


# ------------------------------------------------------------------ basics
def ns(dur):
    return int(round(dur * SR))


def tvec(n):
    return np.arange(n) / SR


def db(x):
    return 10 ** (x / 20.0)


def to_db(x):
    return 20 * np.log10(max(float(x), 1e-12))


def _nfft(n):
    return 1 << int(math.ceil(math.log2(max(2, n))))


def place(dst, src, at, gain=1.0, circular=False):
    """Add src into dst starting at sample index `at` (wraps when circular)."""
    n = len(dst)
    if circular:
        idx = (np.arange(len(src)) + at) % n
        np.add.at(dst, idx, src * gain)
        return dst
    if at >= n:
        return dst
    s0 = max(0, -at)
    a = max(0, at)
    m = min(len(src) - s0, n - a)
    if m > 0:
        dst[a:a + m] += src[s0:s0 + m] * gain
    return dst


# ------------------------------------------------------------------ noise
def white(n, rng):
    return rng.standard_normal(n)


def colored(n, rng, slope_db_oct=-3.0, circular=False):
    """Noise with a spectral slope (pink = -3 dB/oct, brown = -6 dB/oct)."""
    x = rng.standard_normal(n)
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(n, 1 / SR)
    f[0] = f[1]
    X *= (f / 1000.0) ** (slope_db_oct / 6.0206)
    y = np.fft.irfft(X, n)
    return y / (np.std(y) + 1e-12)


# --------------------------------------------------------- filter responses
def H_lp(fc, order=2):
    return lambda f: 1 / np.sqrt(1 + (f / fc) ** (2 * order))


def H_hp(fc, order=2):
    return lambda f: 1 / np.sqrt(1 + (fc / np.maximum(f, 1e-3)) ** (2 * order))


def H_bp(f0, q):
    return lambda f: 1 / np.sqrt(1 + q * q * (np.maximum(f, 1e-3) / f0 - f0 / np.maximum(f, 1e-3)) ** 2)


def H_peak(f0, q, gain_db):
    g = db(gain_db)
    return lambda f: 1 + (g - 1) / (1 + q * q * (np.maximum(f, 1e-3) / f0 - f0 / np.maximum(f, 1e-3)) ** 2)


def H_hshelf(fc, gain_db, order=1):
    g = db(gain_db)
    return lambda f: np.sqrt((1 + g * g * (f / fc) ** (2 * order)) / (1 + (f / fc) ** (2 * order)))


def H_lshelf(fc, gain_db, order=1):
    g = db(gain_db)
    return lambda f: np.sqrt((g * g + (f / fc) ** (2 * order)) / (1 + (f / fc) ** (2 * order)))


def H_mul(*hs):
    def h(f):
        out = np.ones_like(f, dtype=float)
        for hh in hs:
            out = out * hh(f)
        return out
    return h


def _minphase(mag, m):
    logm = np.log(np.maximum(mag, 1e-9))
    c = np.fft.irfft(logm, m)
    w = np.zeros(m)
    w[0] = 1
    w[1:m // 2] = 2
    w[m // 2] = 1
    return np.exp(np.fft.rfft(c * w))


def filt(x, H, circular=False, minphase=True, tail=0.5):
    """Apply magnitude response H(f) to x (mono or stereo)."""
    x = np.asarray(x, float)
    if x.ndim == 2:
        return np.stack([filt(x[:, c], H, circular, minphase, tail) for c in range(x.shape[1])], axis=1)
    n = len(x)
    if circular:
        m = n
        X = np.fft.rfft(x)
        f = np.fft.rfftfreq(m, 1 / SR)
        mag = H(f)
        G = _minphase(mag, m) if (minphase and m % 2 == 0) else mag
        return np.fft.irfft(X * G, m)
    m = _nfft(n + ns(tail))
    X = np.fft.rfft(x, m)
    f = np.fft.rfftfreq(m, 1 / SR)
    mag = H(f)
    G = _minphase(mag, m) if minphase else mag
    return np.fft.irfft(X * G, m)[:n]


def lowpass(x, fc, order=2, **k):
    return filt(x, H_lp(fc, order), **k)


def highpass(x, fc, order=2, **k):
    return filt(x, H_hp(fc, order), **k)


def bandpass(x, f0, q, **k):
    return filt(x, H_bp(f0, q), **k)


def tv_filter(x, Hft, win=2048, hop=256, circular=False):
    """Time-varying filtering by STFT. Hft(f, t_seconds) -> magnitude."""
    x = np.asarray(x, float)
    n = len(x)
    w = np.hanning(win + 1)[:-1]
    if circular:
        pad = win
        reps = int(math.ceil(pad / n)) + 1
        big = np.tile(x, 2 * reps + 1)
        start = reps * n - pad
        xp = big[start:start + n + 2 * pad]
        t_off = -pad
    else:
        pad = win
        xp = np.concatenate([np.zeros(pad), x, np.zeros(pad)])
        t_off = -pad
    L = len(xp)
    out = np.zeros(L)
    norm = np.zeros(L)
    f = np.fft.rfftfreq(win, 1 / SR)
    for s in range(0, L - win + 1, hop):
        seg = xp[s:s + win] * w
        tc = (s + win / 2 + t_off) / SR
        if circular:
            tc = tc % (n / SR)
        X = np.fft.rfft(seg) * Hft(f, tc)
        out[s:s + win] += np.fft.irfft(X, win) * w
        norm[s:s + win] += w * w
    out = out / np.maximum(norm, 1e-6)
    return out[pad:pad + n]


# ------------------------------------------------------------------ oscillators
def _farr(f, n):
    return np.full(n, float(f)) if np.isscalar(f) else np.asarray(f, float)


def phase(f, n=None, ph0=0.0):
    f = _farr(f, n)
    return np.concatenate([[0.0], np.cumsum(f[:-1])]) / SR + ph0


def sine(f, n=None, ph0=0.0):
    return np.sin(2 * PI * phase(f, n, ph0))


def _blep(t, dt):
    y = np.zeros_like(t)
    m1 = t < dt
    u = t[m1] / dt[m1]
    y[m1] = u + u - u * u - 1
    m2 = t > 1 - dt
    u = (t[m2] - 1) / dt[m2]
    y[m2] = u * u + u + u + 1
    return y


def saw(f, n=None, ph0=0.0):
    f = _farr(f, n)
    p = phase(f, len(f), ph0) % 1.0
    dt = np.clip(np.abs(f) / SR, 1e-9, 0.5)
    return 2 * p - 1 - _blep(p, dt)


def pulse(f, n=None, duty=0.5, ph0=0.0):
    f = _farr(f, n)
    p = phase(f, len(f), ph0) % 1.0
    dt = np.clip(np.abs(f) / SR, 1e-9, 0.5)
    s1 = 2 * p - 1 - _blep(p, dt)
    p2 = (p + duty) % 1.0
    s2 = 2 * p2 - 1 - _blep(p2, dt)
    return s1 - s2


def tri(f, n=None, ph0=0.0):
    p = phase(f, n, ph0) % 1.0
    return 4 * np.abs(p - 0.5) - 1


def fm(fc, fmod, index, n=None, ph0=0.0):
    fc = _farr(fc, n)
    n = len(fc)
    m = sine(fmod, n)
    idx = _farr(index, n)
    return np.sin(2 * PI * phase(fc, n, ph0) + idx * m)


def glide(f0, f1, n, curve="exp"):
    t = np.linspace(0, 1, n)
    if curve == "exp":
        return f0 * (f1 / f0) ** t
    return f0 + (f1 - f0) * t


# ------------------------------------------------------------------ envelopes
def env_ad(n, attack, decay, curve=4.0):
    """Linear attack (s) then exponential decay with time-constant `decay` (s)."""
    t = tvec(n)
    a = np.clip(t / max(attack, 1e-5), 0, 1)
    d = np.exp(-np.maximum(t - attack, 0) / max(decay, 1e-5))
    return a * d


def env_ar(n, attack, release, hold=0.0):
    t = tvec(n)
    a = np.clip(t / max(attack, 1e-5), 0, 1)
    r = np.clip(1 - (t - attack - hold) / max(release, 1e-5), 0, 1)
    return a * np.where(t < attack + hold, 1, r)


def env_pts(n, pts):
    """Piecewise-linear envelope from (time_s, value) points."""
    t = tvec(n)
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return np.interp(t, xs, ys)


def fade(x, fin=0.002, fout=0.01):
    x = x.copy()
    a = ns(fin)
    b = ns(fout)
    if a > 0:
        x[:a] *= np.linspace(0, 1, a) if x.ndim == 1 else np.linspace(0, 1, a)[:, None]
    if b > 0:
        r = np.linspace(1, 0, b) ** 2
        x[-b:] *= r if x.ndim == 1 else r[:, None]
    return x


# ------------------------------------------------------------------ shaping
def drive(x, amount):
    return np.tanh(x * amount) / np.tanh(amount)


def softclip(x, thr=0.8):
    y = x.copy()
    m = np.abs(y) > thr
    y[m] = np.sign(y[m]) * (thr + (1 - thr) * np.tanh((np.abs(y[m]) - thr) / (1 - thr)))
    return y


# ------------------------------------------------------------------ reverb
def reverb_ir(rt60=1.5, length=None, predelay=0.012, bright=0.5, rng=None, stereo=False, early=True,
              circular_n=None):
    if rng is None:
        rng = np.random.default_rng(1)
    L = ns(length if length else min(rt60 * 1.3, 8.0))
    t = tvec(L)
    chans = 2 if stereo else 1
    out = np.zeros((L, chans))
    # three bands with different decay times (highs die faster)
    bands = [(H_lp(400, 2), rt60 * 1.15), (H_mul(H_hp(400, 2), H_lp(3500, 2)), rt60),
             (H_hp(3500, 2), rt60 * (0.35 + 0.4 * bright))]
    for c in range(chans):
        nz = rng.standard_normal(L)
        acc = np.zeros(L)
        for H, rt in bands:
            b = filt(nz, H, minphase=False)
            acc += b * 10 ** (-3 * t / rt)
        # soft onset
        acc *= np.clip(t / 0.008, 0, 1)
        out[:, c] = acc
    if early:
        for _ in range(10):
            d = ns(rng.uniform(0.004, 0.06))
            g = rng.uniform(0.2, 0.6) * (1 if rng.random() < 0.5 else -1)
            for c in range(chans):
                if d < L:
                    out[d, c] += g * (0.8 + 0.4 * rng.random())
    pd = ns(predelay)
    out = np.concatenate([np.zeros((pd, chans)), out])[:L]
    out /= np.sqrt((out ** 2).sum(axis=0, keepdims=True)) + 1e-12
    return out if stereo else out[:, 0]


def convolve(x, ir, circular=False):
    if x.ndim == 2 and ir.ndim == 2:
        return np.stack([convolve(x[:, c], ir[:, c], circular) for c in range(x.shape[1])], axis=1)
    if x.ndim == 1 and ir.ndim == 2:
        return np.stack([convolve(x, ir[:, c], circular) for c in range(ir.shape[1])], axis=1)
    if x.ndim == 2 and ir.ndim == 1:
        return np.stack([convolve(x[:, c], ir, circular) for c in range(x.shape[1])], axis=1)
    n = len(x)
    if circular:
        irp = np.zeros(n)
        k = min(n, len(ir))
        irp[:k] = ir[:k]
        if len(ir) > n:  # fold long IRs around the loop
            for s in range(n, len(ir), n):
                seg = ir[s:s + n]
                irp[:len(seg)] += seg
        return np.fft.irfft(np.fft.rfft(x) * np.fft.rfft(irp), n)
    m = _nfft(n + len(ir))
    return np.fft.irfft(np.fft.rfft(x, m) * np.fft.rfft(ir, m), m)[:n + len(ir) - 1]


def add_reverb(x, rt60=1.2, wet=0.25, predelay=0.015, bright=0.5, seed=3, keep_len=True, stereo=False,
               circular=False):
    ir = reverb_ir(rt60, predelay=predelay, bright=bright, rng=np.random.default_rng(seed), stereo=stereo)
    w = convolve(x, ir, circular=circular)
    if keep_len or circular:
        w = w[:len(x)]
        dry = x if (x.ndim == w.ndim) else np.stack([x, x], axis=1)
    else:
        dry = np.zeros_like(w)
        dry[:len(x)] = x if x.ndim == w.ndim else np.stack([x, x], axis=1)[:len(x)]
    # scale wet so its RMS relates sensibly to the dry signal
    return dry * (1 - wet * 0.5) + w * wet


# ------------------------------------------------------------------ resampling
def resample(x, ratio):
    """Change length by `ratio` (>1 = longer / lower pitch) via linear interp on 4x FFT upsample."""
    n = len(x)
    m = int(round(n * ratio))
    xi = np.linspace(0, n - 1, m)
    return np.interp(xi, np.arange(n), x)


def fft_resample(x, n_out):
    n = len(x)
    X = np.fft.rfft(x)
    Y = np.zeros(n_out // 2 + 1, complex)
    k = min(len(X), len(Y))
    Y[:k] = X[:k]
    return np.fft.irfft(Y, n_out) * (n_out / n)


# ------------------------------------------------------------------ physical models
def karplus(f0, dur, decay=0.996, rng=None, bright=0.7, pick=0.12):
    """Block-vectorised Karplus-Strong plucked string."""
    if rng is None:
        rng = np.random.default_rng(0)
    n = ns(dur)
    P = SR / f0
    N = int(math.floor(P))
    a = 1.0 - (P - N)
    y = np.zeros(n + N + 2)
    exc = rng.uniform(-1, 1, N + 1)
    if bright < 1:
        exc = lowpass(exc, 800 + 9000 * bright, 1, minphase=False)
    # pick position comb (removes some harmonics => more realistic)
    k = max(1, int(N * pick))
    exc = exc - np.roll(exc, k) * 0.6
    y[:N + 1] = exc / (np.max(np.abs(exc)) + 1e-9)
    s = N + 1
    while s < len(y):
        L = min(N, len(y) - s)
        y[s:s + L] = decay * (a * y[s - N:s - N + L] + (1 - a) * y[s - N - 1:s - N - 1 + L])
        s += L
    return y[:n]


# ------------------------------------------------------------------ dynamics
def _sliding_max_fwd(x, P):
    """out[i] = max(x[i:i+P]) for P a power of two (edge-padded)."""
    out = x.copy()
    k = 1
    while k < P:
        sh = np.concatenate([out[k:], np.full(k, out[-1])])
        out = np.maximum(out, sh)
        k *= 2
    return out


def sliding_max_centered(x, P):
    f = _sliding_max_fwd(x, P)
    h = P // 2
    return np.concatenate([np.full(h, f[0]), f[:-h]])


def sliding_min_centered(x, P):
    return -sliding_max_centered(-x, P)


def moving_avg_centered(x, half):
    if half <= 0:
        return x.copy()
    xp = np.concatenate([np.full(half, x[0]), x, np.full(half, x[-1])])
    c = np.cumsum(np.concatenate([[0.0], xp]))
    return (c[2 * half + 1:] - c[:-2 * half - 1]) / (2 * half + 1)


def smooth_min(g, P):
    """Smoothed gain curve that never exceeds g (sliding-min then shorter moving average)."""
    return moving_avg_centered(sliding_min_centered(g, P), P // 2 - 1)


def _pow2(n):
    return 1 << max(1, int(round(math.log2(max(2, n)))))


def limiter(x, ceiling_db=-1.5, lookahead=0.005, release=0.09):
    """Look-ahead limiter. Guarantees |out| <= ceiling (sample peak)."""
    mono = np.max(np.abs(x), axis=1) if x.ndim == 2 else np.abs(x)
    need = np.minimum(1.0, db(ceiling_db) / np.maximum(mono, 1e-9))
    g = smooth_min(need, _pow2(ns(lookahead)))
    g = smooth_min(g, _pow2(ns(release)))
    g = np.minimum(g, need)          # numerical safety only (construction already guarantees it)
    return x * (g[:, None] if x.ndim == 2 else g)


def moving_avg(x, w):
    return moving_avg_centered(x, max(1, w // 2))


def sliding_max(x, w):
    return sliding_max_centered(x, _pow2(w))


def compress(x, thresh_db=-18, ratio=3.0, attack=0.005, release=0.12, makeup_db=0.0):
    env = np.max(np.abs(x), axis=1) if x.ndim == 2 else np.abs(x)
    env = moving_avg(sliding_max(env, max(2, ns(attack))), max(2, ns(release)))
    lvl = 20 * np.log10(np.maximum(env, 1e-9))
    over = np.maximum(lvl - thresh_db, 0)
    gr = over * (1 - 1 / ratio)
    g = db(-gr + makeup_db)
    return x * (g[:, None] if x.ndim == 2 else g)


def normalize(x, peak_db=-1.5):
    p = np.max(np.abs(x))
    return x * (db(peak_db) / p) if p > 0 else x


def dc_block(x, circular=False):
    return highpass(x, 18, 2, circular=circular)


# ------------------------------------------------------------------ loudness (BS.1770)
def _kweight_mag(f):
    w = 2 * PI * f / 48000.0
    z1 = np.exp(-1j * w)
    z2 = np.exp(-2j * w)
    h1 = (1.53512485958697 - 2.69169618940638 * z1 + 1.19839281085285 * z2) / (
        1 - 1.69065929318241 * z1 + 0.73248077421585 * z2)
    h2 = (1.0 - 2.0 * z1 + 1.0 * z2) / (1 - 1.99004745483398 * z1 + 0.99007225036621 * z2)
    return np.abs(h1 * h2)


def lufs(x):
    x = np.asarray(x, float)
    if x.ndim == 1:
        x = x[:, None]
    kw = np.stack([filt(x[:, c], _kweight_mag, minphase=False) for c in range(x.shape[1])], axis=1)
    blk = ns(0.4)
    hop = ns(0.1)
    zs = []
    for s in range(0, len(kw) - blk + 1, hop):
        zs.append((kw[s:s + blk] ** 2).mean(axis=0).sum())
    zs = np.array(zs)
    if len(zs) == 0:
        zs = np.array([(kw ** 2).mean(axis=0).sum()])
    lk = -0.691 + 10 * np.log10(np.maximum(zs, 1e-12))
    g1 = zs[lk > -70]
    if len(g1) == 0:
        return -70.0
    rel = -0.691 + 10 * np.log10(g1.mean()) - 10
    g2 = zs[(lk > -70) & (lk > rel)]
    return float(-0.691 + 10 * np.log10(g2.mean()))


# ------------------------------------------------------------------ io
def encode_ogg(x, path, quality=5):
    x = np.asarray(x, np.float32)
    ch = 1 if x.ndim == 1 else x.shape[1]
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-f", "f32le", "-ar", str(SR), "-ac", str(ch),
           "-i", "pipe:0", "-c:a", "libvorbis", "-q:a", str(quality), "-ar", str(SR), "-ac", str(ch),
           "-map_metadata", "-1", str(path)]
    subprocess.run(cmd, input=x.astype("<f4").tobytes(), check=True)
    return path


_SF = None


def _sndfile():
    global _SF
    if _SF is None:
        import ctypes

        class SF_INFO(ctypes.Structure):
            _fields_ = [("frames", ctypes.c_int64), ("samplerate", ctypes.c_int), ("channels", ctypes.c_int),
                        ("format", ctypes.c_int), ("sections", ctypes.c_int), ("seekable", ctypes.c_int)]
        try:
            lib = ctypes.CDLL("libsndfile.so.1")
        except OSError:
            _SF = False
            return _SF
        lib.sf_open.restype = ctypes.c_void_p
        lib.sf_open.argtypes = [ctypes.c_char_p, ctypes.c_int, ctypes.POINTER(SF_INFO)]
        lib.sf_readf_float.restype = ctypes.c_int64
        lib.sf_readf_float.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_float), ctypes.c_int64]
        lib.sf_close.argtypes = [ctypes.c_void_p]
        _SF = (lib, SF_INFO, ctypes)
    return _SF


def decode(path, ch=None):
    """Decode an audio file. Uses libsndfile (granule-exact for Ogg Vorbis, like the game's
    stb_vorbis) when available, else falls back to ffmpeg."""
    sf = _sndfile()
    if sf:
        lib, SF_INFO, ctypes = sf
        info = SF_INFO()
        h = lib.sf_open(str(path).encode(), 0x10, ctypes.byref(info))
        if h:
            buf = np.zeros(info.frames * info.channels + 8192, np.float32)
            got = lib.sf_readf_float(h, buf.ctypes.data_as(ctypes.POINTER(ctypes.c_float)), info.frames)
            lib.sf_close(h)
            y = buf[:got * info.channels].astype(float)
            if info.channels > 1:
                y = y.reshape(-1, info.channels)
            return y, info.samplerate, info.channels
    probe = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries",
                            "stream=channels,sample_rate", "-of", "csv=p=0", str(path)],
                           capture_output=True, text=True, check=True).stdout.strip().split(",")
    sr, chans = int(probe[0]), int(probe[1])
    raw = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(path), "-f", "f32le",
                          "-ac", str(chans), "pipe:1"], capture_output=True, check=True).stdout
    y = np.frombuffer(raw, "<f4").astype(float)
    if chans > 1:
        y = y.reshape(-1, chans)
    return y, sr, chans


def momentary_max(x):
    """Max momentary (400 ms) loudness in LUFS."""
    x = np.asarray(x, float)
    if x.ndim == 1:
        x = x[:, None]
    kw = np.stack([filt(x[:, c], _kweight_mag, minphase=False) for c in range(x.shape[1])], axis=1)
    blk = ns(0.4)
    if len(kw) < blk:
        kw = np.concatenate([kw, np.zeros((blk - len(kw), kw.shape[1]))])
    p = (kw ** 2).sum(axis=1)
    c = np.cumsum(np.concatenate([[0.0], p]))
    ms = (c[blk:] - c[:-blk]) / blk
    return float(-0.691 + 10 * np.log10(max(ms.max(), 1e-12)))


def limiter_circular(x, ceiling_db=-1.5, **k):
    """Limiter for loops: process three tiled copies and keep the middle (periodic gain curve)."""
    n = len(x)
    big = np.concatenate([x, x, x], axis=0)
    return limiter(big, ceiling_db, **k)[n:2 * n]


def loudness_to(x, target_mmax, ceiling_db=-1.5, circular=False, max_boost=10.0, saturate=False,
                max_total=8.0):
    """Gain + look-ahead limiting (or tanh saturation for impacts) until the max momentary loudness
    reaches the target.  Total boost above peak-normalised level is capped at `max_total` dB."""
    x = normalize(x, ceiling_db)
    total = 0.0
    c = db(ceiling_db)
    for _ in range(8):
        m = momentary_max(x)
        g = float(np.clip(target_mmax - m, -40, max_boost))
        if g > 0:
            g = min(g, max_total - total)
        if abs(g) < 0.15:
            break
        total += g
        x = x * db(g)
        if np.max(np.abs(x)) > c:
            if saturate:
                x = highpass(x, 18, 2, circular=circular)      # strip LF drift so clipping stays symmetric
                x = c * softclip(x / c, 0.6)                    # soft knee: linear below 60% of ceiling
            else:
                x = limiter_circular(x, ceiling_db) if circular else limiter(x, ceiling_db)
    if np.max(np.abs(x)) > c:
        x = c * softclip(x / c, 0.6)
    return x


def write_ogg_checked(x, path, peak_db=-1.0, quality=5, normalize_peak=False, max_iter=6):
    """Encode; decode (granule exact) and re-encode with less gain until decoded peak <= peak_db."""
    x = np.asarray(x, float)
    if normalize_peak:
        x = normalize(x, peak_db - 0.4)
    p = None
    for _ in range(max_iter):
        encode_ogg(x, path, quality)
        y, _, _ = decode(path)
        p = to_db(np.max(np.abs(y)))
        if p <= peak_db - 0.05:
            return path, p
        x = x * db(peak_db - 0.2 - p)
    return path, p
