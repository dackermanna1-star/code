"""Procedural sound synthesis for Portal Gun Multiverse.

Every sound is synthesized with numpy from deterministic string seeds (gen.noise.rng) and encoded
to mono 44.1 kHz Ogg Vorbis (libvorbis -q:a 4) with ffmpeg.

    write_all(sounds_root) -> dict   renders every .ogg under sounds_root, returns the sounds.json dict
    render(path) -> np.ndarray       renders a single file in memory (e.g. "portal/open1",
                                     "ambient/wind_howl"), handy for previews/analysis
    SUBTITLES                        subtitle translation keys -> English
    AMBIENT_LOOPS                    event names of the looping ambiences ("ambient.<name>")

Ambient loops are built from periodic signals (circular FFT filtering / convolution, integer-cycle
oscillators and LFOs, grains that wrap around the loop point), so the last sample flows into the first.
"""
import os
import subprocess

import numpy as np

from .noise import rng

SR = 44100
TAU = 2.0 * np.pi
NAMESPACE = "portalgun"


# =============================================================================================
# Basic helpers
# =============================================================================================
def _ns(sec):
    return int(round(sec * SR))


def _tt(n):
    return np.arange(n) / SR


def _r(*key):
    return rng("snd:" + ":".join(str(k) for k in key))


def _ex(x):
    """exp() that never overflows (arguments are clamped)."""
    return np.exp(np.minimum(x, 60.0))


def _db(x):
    return 10.0 ** (x / 20.0)


def _pkn(x):
    m = np.max(np.abs(x))
    return x / m if m > 0 else x


def _rmsn(x):
    m = np.sqrt(np.mean(x * x))
    return x / m if m > 0 else x


def _midi(m):
    return 440.0 * 2.0 ** ((np.asarray(m, dtype=float) - 69.0) / 12.0)


def _good(n):
    """Smallest 2^a 3^b 5^c >= n (fast FFT length)."""
    best = 1 << max(0, int(n - 1).bit_length())
    p5 = 1
    while p5 < best:
        p35 = p5
        while p35 < best:
            p = p35
            while p < n:
                p *= 2
            best = min(best, p)
            p35 *= 3
        p5 *= 5
    return best


def _fade(x, fin=0.0, fout=0.0):
    x = x.copy()
    a, b = _ns(fin), _ns(fout)
    if a > 0:
        x[:a] *= 0.5 - 0.5 * np.cos(np.pi * np.arange(a) / a)
    if b > 0:
        x[-b:] *= 0.5 + 0.5 * np.cos(np.pi * np.arange(1, b + 1) / b)
    return x


def _smoothstep(x):
    x = np.clip(x, 0.0, 1.0)
    return x * x * (3.0 - 2.0 * x)


def _curve(n, values):
    """Smooth (cosine-eased) curve through evenly spaced control values."""
    values = np.asarray(values, dtype=float)
    pos = np.linspace(0.0, len(values) - 1.0, n)
    i = np.minimum(np.floor(pos).astype(int), len(values) - 2)
    f = _smoothstep(pos - i)
    return values[i] + (values[i + 1] - values[i]) * f


def _lowrand(n, rate, r):
    """Smooth random signal (std 1) with bandwidth ~rate Hz from generator r (FFT synthesized, periodic)."""
    nb = n // 2 + 1
    f = np.fft.rfftfreq(n, 1.0 / SR)
    k = int(min(nb, max(2, 4.0 * rate * n / SR + 2)))
    X = np.zeros(nb, dtype=complex)
    X[1:k] = (r.standard_normal(k - 1) + 1j * r.standard_normal(k - 1)) * np.exp(-0.5 * (f[1:k] / rate) ** 2)
    y = np.fft.irfft(X, n)
    s = y.std()
    return y / s if s > 0 else y


# =============================================================================================
# Filters (FFT-exact biquads, zero-phase magnitude shaping, STFT time-varying, TPT SVF)
# =============================================================================================
def _rbj(kind, f0, q=0.7071, gain_db=0.0):
    A = 10.0 ** (gain_db / 40.0)
    w0 = TAU * min(f0, 0.49 * SR) / SR
    c, s = np.cos(w0), np.sin(w0)
    al = s / (2.0 * q)
    sa = 2.0 * np.sqrt(A) * al
    if kind == "lp":
        b, a = [(1 - c) / 2, 1 - c, (1 - c) / 2], [1 + al, -2 * c, 1 - al]
    elif kind == "hp":
        b, a = [(1 + c) / 2, -(1 + c), (1 + c) / 2], [1 + al, -2 * c, 1 - al]
    elif kind == "bp":
        b, a = [al, 0.0, -al], [1 + al, -2 * c, 1 - al]
    elif kind == "notch":
        b, a = [1.0, -2 * c, 1.0], [1 + al, -2 * c, 1 - al]
    elif kind == "peak":
        b, a = [1 + al * A, -2 * c, 1 - al * A], [1 + al / A, -2 * c, 1 - al / A]
    elif kind == "ls":
        b = [A * ((A + 1) - (A - 1) * c + sa), 2 * A * ((A - 1) - (A + 1) * c), A * ((A + 1) - (A - 1) * c - sa)]
        a = [(A + 1) + (A - 1) * c + sa, -2 * ((A - 1) + (A + 1) * c), (A + 1) + (A - 1) * c - sa]
    elif kind == "hs":
        b = [A * ((A + 1) + (A - 1) * c + sa), -2 * A * ((A - 1) + (A + 1) * c), A * ((A + 1) + (A - 1) * c - sa)]
        a = [(A + 1) - (A - 1) * c + sa, 2 * ((A - 1) - (A + 1) * c), (A + 1) - (A - 1) * c - sa]
    else:
        raise ValueError(kind)
    b, a = np.array(b, dtype=float), np.array(a, dtype=float)
    return b / a[0], a / a[0]


def _freqz(stages, N):
    z = np.exp(-1j * TAU * np.fft.rfftfreq(N))
    H = np.ones(len(z), dtype=complex)
    for b, a in stages:
        H *= (b[0] + b[1] * z + b[2] * z * z) / (a[0] + a[1] * z + a[2] * z * z)
    return H


def _filt(x, stages, circular=False, pad=0.5):
    """Exact (causal) IIR biquad cascade evaluated in the frequency domain.
    circular=True yields the periodic steady state (seamless for loops)."""
    n = len(x)
    N = n if circular else _good(n + _ns(pad))
    return np.fft.irfft(np.fft.rfft(x, N) * _freqz(stages, N), N)[:n]


def _shape(x, mag_fn, circular=False, pad=0.25):
    """Zero-phase magnitude shaping: mag_fn(freqs_hz) -> gain."""
    n = len(x)
    N = n if circular else _good(n + _ns(pad))
    X = np.fft.rfft(x, N)
    X *= mag_fn(np.fft.rfftfreq(N, 1.0 / SR))
    return np.fft.irfft(X, N)[:n]


def _lp(f, fc, order=2):
    return 1.0 / np.sqrt(1.0 + (f / fc) ** (2 * order))


def _hp(f, fc, order=2):
    return 1.0 / np.sqrt(1.0 + (fc / np.maximum(f, 1e-3)) ** (2 * order))


def _band(f, fc, octaves):
    return np.exp(-0.5 * (np.log2(np.maximum(f, 1.0) / fc) / octaves) ** 2)


def _stft(x, gain_fn, circular=False, frame=2048, hop=None):
    """Time-varying spectral gain. gain_fn(ci, f) gets frame-centre sample indices (F,1) and
    frequencies (1,B) and returns gains (F,B). circular=True treats x as one loop period."""
    hop = hop or frame // 4
    n = len(x)
    win = np.sqrt(0.5 - 0.5 * np.cos(TAU * np.arange(frame) / frame))
    if circular:
        starts = np.arange(0, n, hop)
        idx = (starts[:, None] + np.arange(frame)[None, :]) % n
        xs, total, off = x, n, 0
        ci = (starts + frame // 2) % n
    else:
        off = frame
        xs = np.concatenate([np.zeros(off), x, np.zeros(off + hop)])
        total = len(xs)
        starts = np.arange(0, total - frame + 1, hop)
        idx = starts[:, None] + np.arange(frame)[None, :]
        ci = np.clip(starts + frame // 2 - off, 0, n - 1)
    F = np.fft.rfft(xs[idx] * win, axis=1)
    freqs = np.fft.rfftfreq(frame, 1.0 / SR)
    F *= gain_fn(ci[:, None], freqs[None, :])
    frames = np.fft.irfft(F, frame, axis=1) * win
    flat = idx.ravel()
    out = np.bincount(flat, weights=frames.ravel(), minlength=total)
    wsum = np.bincount(flat, weights=np.tile(win * win, len(starts)), minlength=total)
    out = out / np.maximum(wsum, 1e-6)
    return out if circular else out[off:off + n]


def _svf(x, fc, q, mode="bpn"):
    """Time-varying TPT state-variable filter (per-sample loop; use for short sounds).
    mode: lp, bp (peak gain Q), bpn (0 dB peak), hp."""
    n = len(x)
    fc = np.broadcast_to(np.asarray(fc, dtype=float), (n,))
    q = np.broadcast_to(np.asarray(q, dtype=float), (n,))
    g = np.tan(np.pi * np.clip(fc, 10.0, 0.45 * SR) / SR)
    k = 1.0 / q
    a1 = 1.0 / (1.0 + g * (g + k))
    a2 = g * a1
    a3 = g * a2
    xs, A1, A2, A3 = x.tolist(), a1.tolist(), a2.tolist(), a3.tolist()
    lp = [0.0] * n
    bp = [0.0] * n
    ic1 = ic2 = 0.0
    for i in range(n):
        v3 = xs[i] - ic2
        v1 = A1[i] * ic1 + A2[i] * v3
        v2 = ic2 + A2[i] * ic1 + A3[i] * v3
        ic1 = 2.0 * v1 - ic1
        ic2 = 2.0 * v2 - ic2
        bp[i] = v1
        lp[i] = v2
    lp = np.array(lp)
    bp = np.array(bp)
    if mode == "lp":
        return lp
    if mode == "bp":
        return bp
    if mode == "bpn":
        return bp * k
    return x - k * bp - lp


def _vdelay(x, d, circular=False):
    """Modulated fractional delay (d in samples, scalar or array)."""
    n = len(x)
    pos = np.arange(n) - d
    if circular:
        return np.interp(np.mod(pos, n), np.arange(n + 1), np.append(x, x[0]))
    return np.interp(pos, np.arange(n), x, left=0.0, right=0.0)


def _saw(ph, f):
    """PolyBLEP band-limited saw from phase (cycles) and frequency (Hz)."""
    p = np.mod(ph, 1.0)
    dt = np.broadcast_to(np.abs(np.asarray(f, dtype=float)) / SR, p.shape)
    y = 2.0 * p - 1.0
    m = p < dt
    xx = p[m] / dt[m]
    y[m] -= xx + xx - xx * xx - 1.0
    m = p > 1.0 - dt
    xx = (p[m] - 1.0) / dt[m]
    y[m] -= xx * xx + xx + xx + 1.0
    return y


def _crush(x, bits, hold=1):
    if hold > 1:
        x = x[(np.arange(len(x)) // hold) * hold]
    lv = 2.0 ** (bits - 1)
    return np.round(x * lv) / lv


# ---------------------------------------------------------------------------- reverb
_IR_CACHE = {}


def _ir(rt60, key, damp=1.0, predelay=0.012):
    ck = (round(rt60, 4), str(key), round(damp, 4), round(predelay, 4))
    if ck in _IR_CACHE:
        return _IR_CACHE[ck]
    n = _ns(min(rt60 * 1.15, 9.0))
    w = _r("ir", key).standard_normal(n)

    def gain(ci, f):
        rt = rt60 * (1.0 + 0.25 * np.exp(-f / 250.0)) / (1.0 + (f / (4500.0 * damp)) ** 1.6)
        return np.exp(-6.91 * (ci / SR) / np.maximum(rt, 0.03))

    ir = _stft(w, gain, circular=False, frame=1024)
    ir *= np.minimum(1.0, _tt(n) / 0.005)
    ir = _fade(ir, 0.0, min(0.3, rt60 * 0.2))
    ir = np.concatenate([np.zeros(_ns(predelay)), ir])
    ir /= np.sqrt(np.sum(ir * ir))
    _IR_CACHE[ck] = ir
    return ir


# ---------------------------------------------------------------------------- grains
def _bubble(f0, xi=0.15, damp_mul=1.0, maxdur=0.6):
    """Minnaert bubble (van den Doel): decaying sine whose pitch rises as it reaches the surface."""
    rad = 3.0 / f0
    d = (0.13 / rad + 0.0072 * rad ** -1.5) * damp_mul
    dur = min(maxdur, 6.5 / d)
    n = max(16, _ns(dur))
    t = _tt(n)
    y = np.sin(TAU * f0 * (t + 0.5 * xi * d * t * t)) * np.exp(-d * t)
    y[:11] *= np.sin(0.5 * np.pi * np.arange(11) / 11.0)  # ~0.25 ms attack: wet, not clicky
    k = max(4, n // 6)
    y[-k:] *= 0.5 + 0.5 * np.cos(np.pi * np.arange(1, k + 1) / k)
    return y


def _modal(freqs, taus, amps, dur, attack=0.0002, phases=None):
    n = _ns(dur)
    t = _tt(n)
    y = np.zeros(n)
    for i, (f, tau, a) in enumerate(zip(freqs, taus, amps)):
        if f >= 0.45 * SR:
            continue
        ph = 0.0 if phases is None else phases[i]
        y += a * np.sin(TAU * f * t + ph) * np.exp(-t / tau)
    if attack > 0:
        y *= np.minimum(1.0, t / attack)
    return _fade(y, 0.0, min(0.01, dur * 0.2))


def _click(r, dur=0.004, hp=2500.0, tau=0.0007):
    n = _ns(dur)
    y = r.standard_normal(n) * np.exp(-_tt(n) / tau)
    return _filt(y, [_rbj("hp", hp, 0.7)])


def _decaying(n, tau, attack=0.002):
    t = _tt(n)
    return np.minimum(1.0, t / max(attack, 1e-5)) * np.exp(-t / tau)


# =============================================================================================
# Synthesis context (shared by one-shots and loops)
# =============================================================================================
class _Ctx:
    def __init__(self, name, seconds, loop):
        self.name = name
        self.loop = loop
        self.n = _ns(seconds)
        self.sec = self.n / SR
        self.t = _tt(self.n)

    # randomness ------------------------------------------------------------------
    def rng(self, *k):
        return _r(self.name, *k)

    def white(self, *k):
        return self.rng("white", *k).standard_normal(self.n)

    def smooth(self, rate, *k):
        """Smooth random modulation, std 1, periodic over the loop."""
        return _lowrand(self.n, rate, self.rng("smooth", *k))

    def u(self, rate, *k, lo=0.0, hi=1.0):
        v = 0.5 + 0.5 * np.tanh(0.9 * self.smooth(rate, *k))
        return lo + (hi - lo) * v

    def poisson(self, rate, *k, intensity=None):
        r = self.rng("poisson", *k)
        cnt = r.poisson(rate * self.sec)
        pos = np.sort(r.integers(0, self.n, cnt))
        if intensity is not None:
            pos = pos[r.random(cnt) < intensity[pos]]
        return pos

    # oscillators -----------------------------------------------------------------
    def qf(self, f):
        """Frequency rounded to a whole number of cycles per loop."""
        if not self.loop:
            return f
        return max(1, round(f * self.sec)) / self.sec

    def lfo(self, rate, phase=0.0):
        return np.sin(TAU * self.qf(rate) * self.t + phase)

    def phase(self, freq):
        """Phase in cycles; for loops scaled (imperceptibly) to an integer number of cycles."""
        f = np.broadcast_to(np.asarray(freq, dtype=float), (self.n,))
        if self.loop:
            total = f.sum() / SR
            f = f * (max(1, round(total)) / total)
        return np.concatenate([[0.0], np.cumsum(f[:-1])]) / SR

    def sine(self, freq, ph0=0.0):
        return np.sin(TAU * self.phase(freq) + ph0)

    def narrow(self, freq, bw, *k):
        """Narrow-band noise of bandwidth ~bw Hz around a (moving) centre frequency."""
        z = self.smooth(bw, "nr", *k) + 1j * self.smooth(bw, "ni", *k)
        return np.real(z * np.exp(1j * TAU * self.phase(freq))) / np.sqrt(2.0)

    # buffers / processing --------------------------------------------------------
    def zeros(self):
        return np.zeros(self.n)

    def add(self, buf, x, pos):
        pos = int(pos)
        if self.loop:
            pos %= self.n
            while len(x):
                k = min(len(x), self.n - pos)
                buf[pos:pos + k] += x[:k]
                x = x[k:]
                pos = 0
        else:
            if pos >= self.n or pos + len(x) <= 0:
                return
            if pos < 0:
                x = x[-pos:]
                pos = 0
            k = min(len(x), self.n - pos)
            buf[pos:pos + k] += x[:k]

    def filt(self, x, *stages):
        return _filt(x, list(stages), circular=self.loop)

    def shape(self, x, fn):
        return _shape(x, fn, circular=self.loop)

    def stft(self, x, gain_fn, frame=2048):
        return _stft(x, gain_fn, circular=self.loop, frame=frame)

    def vdelay(self, x, d):
        return _vdelay(x, d, circular=self.loop)

    def conv(self, x, ir):
        if self.loop:
            return np.fft.irfft(np.fft.rfft(x) * np.fft.rfft(ir, self.n), self.n)
        N = _good(self.n + len(ir))
        return np.fft.irfft(np.fft.rfft(x, N) * np.fft.rfft(ir, N), N)[:self.n]

    def reverb(self, x, rt60, wet, damp=1.0, predelay=0.015, key="rv", dry=1.0):
        return dry * x + wet * self.conv(x, _ir(rt60, (self.name, key), damp, predelay))

    def delay_fb(self, x, seconds, fb, lp=4000.0, wet=0.35):
        """Feedback echo (lowpassed in the loop) evaluated as an exact frequency response."""
        N = self.n if self.loop else _good(self.n + _ns(seconds * 12))
        X = np.fft.rfft(x, N)
        f = np.fft.rfftfreq(N, 1.0 / SR)
        z = np.exp(-1j * TAU * f * seconds)
        damp = 1.0 / (1.0 + 1j * f / lp)
        H = fb * damp * z
        Y = X * (damp * z) / (1.0 - H)
        return x + wet * np.fft.irfft(Y, N)[:self.n]


# =============================================================================================
# One-shots
# =============================================================================================
def _portal_open(v):
    pm, tp, dk = ((1.0, 0.30, 0.30), (0.88, 0.34, 0.34), (1.13, 0.26, 0.27))[v]
    c = _Ctx(f"portal_open{v}", 1.25, loop=False)
    t = c.t
    rise = np.clip(t / tp, 0.0, 1.0)
    after = np.maximum(t - tp, 0.0)
    env = np.where(t < tp, rise ** 2.4, np.exp(-after / dk))
    # 1. resonant noise whoosh that sweeps up into the opening and back down
    fc = np.where(t < tp, 230.0 * (2900.0 / 230.0) ** (rise ** 1.4), 320.0 + 2580.0 * np.exp(-after / 0.16)) * pm
    w = c.white("whoosh")
    whoosh = (_svf(w, fc, 2.6, "bpn") + 0.3 * _svf(w, fc * 1.7, 0.7, "lp")) * env
    # 2. swirl: flanger whose sweep speeds up as the portal spins open
    rate = 2.5 + 8.0 * np.where(t < tp, rise, np.exp(-after / 0.45))
    sw = np.sin(TAU * np.cumsum(rate) / SR)
    d = (2.2 + 1.7 * sw) * SR / 1000.0
    swirl = whoosh + 0.85 * _vdelay(whoosh, d) - 0.4 * _vdelay(whoosh, 2.3 * d)
    # 3. wet gurgle: a cloud of bubbles around the opening + a few fat blorps
    r = c.rng("bub")
    bub = c.zeros()
    for _ in range(80):
        tb = tp - 0.12 + r.gamma(1.5, 0.14)
        if tb < 0 or tb > c.sec - 0.05:
            continue
        f0 = pm * np.exp(r.uniform(np.log(260.0), np.log(1500.0)))
        amp = r.uniform(0.2, 1.0) * (0.2 + env[_ns(tb)]) * (500.0 / f0) ** 0.3
        c.add(bub, _bubble(f0, xi=r.uniform(0.1, 0.45)) * amp, _ns(tb))
    for dt, f0 in ((0.0, 190.0), (0.06, 150.0), (0.15, 128.0), (0.28, 172.0), (0.4, 140.0)):
        c.add(bub, (1.8 if dt < 0.2 else 1.1) * _bubble(f0 * pm * r.uniform(0.9, 1.1), xi=0.6), _ns(tp + dt))
    # 4. vowel-like "vwoom" (resonant wah on a low buzz)
    bump = np.where(t < tp, rise ** 1.6, np.exp(-after / 0.3))
    f = pm * (58.0 + 95.0 * bump) * (1.0 + 0.035 * np.sin(TAU * 7.0 * t))
    src = _saw(np.cumsum(f) / SR, f)
    vw = _svf(src, (180.0 + 2000.0 * bump ** 1.5) * pm, 4.5, "lp") * env
    vw = vw + 0.7 * _vdelay(vw, d)
    # 5. sub thump at the moment of opening
    st = t - (tp - 0.02)
    fsub = 36.0 + 32.0 * np.exp(-np.maximum(st, 0.0) / 0.08)
    sub = np.sin(TAU * np.cumsum(fsub) / SR) * np.where(st < 0, 0.0, np.minimum(1.0, np.maximum(st, 0) / 0.015)
                                                       * np.exp(-np.maximum(st, 0) / 0.17))
    mix = 1.0 * _pkn(swirl) + 0.6 * _pkn(bub) + 0.3 * _pkn(vw) + 0.5 * _pkn(sub)
    return c.reverb(mix, 0.9, 0.22, damp=0.8, key="room")


def _portal_close(v):
    c = _Ctx("portal_close", 0.85, loop=False)
    t = c.t
    te = 0.58
    pre = np.minimum(t - te, 0.0)
    post = np.maximum(t - te, 0.0)
    env = np.where(t < te, np.exp(pre / 0.15), np.exp(-post / 0.04))
    fc = np.where(t < te, 3400.0 * np.exp(pre / 0.22) + 260.0, 260.0 + 3400.0 * np.exp(-post / 0.02))
    w = c.white("whoosh")
    whoosh = (_svf(w, fc, 2.2, "bpn") + 0.25 * _svf(w, fc * 1.5, 0.7, "lp")) * env
    rate = 3.0 + 12.0 * np.exp(pre / 0.25)
    d = (2.0 + 1.5 * np.sin(TAU * np.cumsum(rate) / SR)) * SR / 1000.0
    swirl = whoosh + 0.85 * _vdelay(whoosh, d) - 0.4 * _vdelay(whoosh, 2.2 * d)
    # reversed bubbly reverb swell (the "suck")
    r = c.rng("bub")
    burst = np.zeros(_ns(0.3))
    for _ in range(25):
        f0 = np.exp(r.uniform(np.log(250.0), np.log(1300.0)))
        b = _bubble(f0, xi=r.uniform(0.1, 0.4)) * r.uniform(0.3, 1.0)
        p = _ns(r.uniform(0.0, 0.12))
        k = min(len(b), len(burst) - p)
        burst[p:p + k] += b[:k]
    ir = _ir(0.7, ("portal_close", "rev"), 0.8, 0.0)
    tail = np.convolve(burst, ir[:_ns(0.6)])[: _ns(0.55)]
    sucked = c.zeros()
    c.add(sucked, tail[::-1], _ns(te) - len(tail))
    # collapse: low "thoop" + bubble pop + tiny dribble of bubbles
    thoop = c.zeros()
    n2 = _ns(0.25)
    t2 = _tt(n2)
    ft = 48.0 + 120.0 * np.exp(-t2 / 0.035)
    c.add(thoop, np.sin(TAU * np.cumsum(ft) / SR) * _decaying(n2, 0.06, 0.004), _ns(te - 0.004))
    c.add(thoop, 0.6 * _bubble(240.0, xi=0.3), _ns(te))
    for _ in range(10):
        c.add(thoop, 0.25 * _bubble(np.exp(r.uniform(np.log(400), np.log(1400))), xi=0.3),
              _ns(te + r.gamma(1.2, 0.04)))
    mix = 0.85 * _pkn(swirl) + 0.55 * _pkn(sucked) + 0.8 * _pkn(thoop)
    return c.reverb(mix, 0.6, 0.15, damp=0.8, key="room")


def _portal_travel(v):
    c = _Ctx("portal_travel", 0.95, loop=False)
    t = c.t
    tp = 0.30
    pre = np.clip(t / tp, 0.0, 1.0)
    post = np.maximum(t - tp, 0.0)
    env = np.where(t < tp, pre ** 2.0, np.exp(-post / 0.2))
    fc = np.where(t < tp, 350.0 * (3800.0 / 350.0) ** pre, 250.0 + 3550.0 * np.exp(-post / 0.13))
    w = c.white("whoosh")
    whoosh = (_svf(w, fc, 1.5, "bpn") + 0.4 * _svf(w, fc * 1.3, 0.7, "lp")) * env
    d = (1.8 + 1.4 * np.sin(TAU * np.cumsum(6.0 + 6.0 * env) / SR)) * SR / 1000.0
    whoosh = whoosh + 0.7 * _vdelay(whoosh, d)
    # slurp: gurgling source through two gliding formants
    r = c.rng("slurp")
    gate = 0.5 + 0.5 * np.tanh(2.5 * _lowrand(c.n, 35.0, r))
    fb = 115.0 - 40.0 * _smoothstep(t / 0.7)
    src = 0.7 * w * gate + 0.5 * _saw(np.cumsum(fb) / SR, fb) * (0.6 + 0.4 * gate)
    bump = np.exp(-0.5 * ((t - 0.34) / 0.12) ** 2)
    f1 = 300.0 + 550.0 * bump
    f2 = 850.0 + 1400.0 * bump
    slurp = (_svf(src, f1, 6.0, "bpn") + 0.6 * _svf(src, f2, 7.0, "bpn")) * _smoothstep((t - 0.08) / 0.15) * \
        np.exp(-np.maximum(t - 0.42, 0.0) / 0.12)
    bub = c.zeros()
    for _ in range(40):
        tb = r.uniform(0.18, 0.62)
        f0 = np.exp(r.uniform(np.log(280.0), np.log(1300.0)))
        c.add(bub, _bubble(f0, xi=r.uniform(0.1, 0.5)) * r.uniform(0.2, 1.0), _ns(tb))
    mix = 0.85 * _pkn(whoosh) + 0.6 * _pkn(slurp) + 0.4 * _pkn(bub)
    return c.reverb(mix, 0.7, 0.18, damp=0.8, key="room")


def _portal_idle(v):
    c = _Ctx("portal_idle", 2.6, loop=False)
    t = c.t
    wob = 1.0 + 0.003 * np.sin(TAU * 0.4 * t)
    hum = np.zeros(c.n)
    for k, (rr, a) in enumerate(((1.0, 1.0), (2.0, 0.55), (3.0, 0.3), (4.01, 0.15), (5.03, 0.08))):
        hum += a * np.sin(TAU * np.cumsum(58.0 * rr * wob) / SR + k)
    hum *= 0.7 + 0.3 * np.sin(TAU * 0.9 * t)
    hum = c.filt(hum, _rbj("lp", 500.0, 0.7))
    swirl = c.shape(c.white("swirl"), lambda f: _band(f, 450.0, 0.8))
    d = (2.5 + 2.0 * np.sin(TAU * 0.7 * t)) * SR / 1000.0
    swirl = (swirl + 0.9 * c.vdelay(swirl, d)) * (0.6 + 0.4 * np.sin(TAU * 0.45 * t + 1.0))
    r = c.rng("bub")
    bub = c.zeros()
    for p in c.poisson(16.0, "bubbles"):
        f0 = np.exp(r.uniform(np.log(300.0), np.log(1100.0)))
        c.add(bub, _bubble(f0, xi=r.uniform(0.1, 0.4)) * r.uniform(0.15, 0.6), p)
    for tb in (0.5, 1.3, 1.9):
        c.add(bub, 0.9 * _bubble(r.uniform(140.0, 230.0), xi=0.5), _ns(tb + r.uniform(-0.1, 0.1)))
    mix = 0.7 * _rmsn(hum) + 0.35 * _rmsn(swirl) + 0.5 * _pkn(bub) * 3.0
    mix = c.reverb(mix, 0.8, 0.2, damp=0.8)
    return _fade(mix, 0.4, 0.7)


def _gun_fire(v):
    f0, tau, ratio, fend = ((2700.0, 0.045, 1.41, 320.0), (3200.0, 0.036, 2.0, 380.0), (2300.0, 0.055, 1.73, 280.0))[v]
    c = _Ctx(f"gun_fire{v}", 0.38, loop=False)
    t = c.t
    f = fend + (f0 - fend) * np.exp(-t / tau)
    ph = np.cumsum(f) / SR
    idx = 3.2 * np.exp(-t / 0.05)
    tone = np.sin(TAU * ph + idx * np.sin(TAU * ratio * ph))
    tone = 0.6 * tone + 0.4 * np.tanh(2.5 * tone)
    tone += 0.5 * np.sin(TAU * ph * 1.012 + 0.7 * idx * np.sin(TAU * ratio * 1.012 * ph))
    tone *= np.minimum(1.0, t / 0.002) * np.exp(-t / 0.1)
    buzz = np.sin(TAU * ph * 0.5) * (0.5 + 0.5 * np.sin(TAU * 52.0 * t)) * _decaying(c.n, 0.07)
    r = c.rng("crack")
    crack = c.filt(r.standard_normal(c.n), _rbj("hp", 2500.0, 0.7)) * np.exp(-t / 0.011)
    fb = 60.0 + 170.0 * np.exp(-t / 0.04)
    body = np.sin(TAU * np.cumsum(fb) / SR) * _decaying(c.n, 0.06, 0.003)
    fizz = c.zeros()
    for _ in range(30):
        tb = 0.025 + r.exponential(0.07)
        if tb > c.sec - 0.03:
            continue
        a = r.uniform(0.2, 1.0) * np.exp(-tb / 0.12)
        c.add(fizz, _bubble(np.exp(r.uniform(np.log(1800.0), np.log(5500.0))), xi=0.4) * a, _ns(tb))
    mix = 1.0 * _pkn(tone) + 0.35 * _pkn(buzz) + 0.35 * _pkn(crack) + 0.45 * _pkn(body) + 0.25 * _pkn(fizz)
    return c.reverb(mix, 0.35, 0.16, damp=1.0, key="slap")


def _gun_empty(v):
    c = _Ctx("gun_empty", 0.42, loop=False)
    r = c.rng("x")
    y = c.zeros()
    c.add(y, _modal((2300.0, 3710.0, 5930.0), (0.012, 0.008, 0.005), (1.0, 0.7, 0.5), 0.06), _ns(0.005))
    c.add(y, 0.6 * _click(r), _ns(0.005))
    c.add(y, 0.9 * _modal((1420.0, 2610.0, 4790.0, 260.0), (0.016, 0.009, 0.005, 0.02), (1.0, 0.6, 0.4, 0.8), 0.08),
          _ns(0.058))
    c.add(y, 0.8 * _click(r, hp=1500.0), _ns(0.058))
    # dying fizzle: sputtering crackle + faint falling whine
    t = c.t
    fz = c.zeros()
    for _ in range(26):
        tb = 0.075 + r.exponential(0.06)
        if tb > c.sec - 0.02:
            continue
        c.add(fz, _bubble(np.exp(r.uniform(np.log(1500.0), np.log(5000.0))), xi=0.5) * r.uniform(0.1, 0.6)
              * np.exp(-(tb - 0.075) / 0.1), _ns(tb))
    hiss = c.filt(c.white("hiss"), _rbj("bp", 3200.0, 1.5)) * (0.5 + 0.5 * np.tanh(3 * _lowrand(c.n, 40.0, r)))
    hiss *= np.where(t < 0.07, 0.0, np.exp(-np.maximum(t - 0.07, 0) / 0.08))
    fw = 400.0 + 900.0 * np.exp(-np.maximum(t - 0.07, 0) / 0.08)
    whine = np.sin(TAU * np.cumsum(fw) / SR) * np.where(t < 0.07, 0.0, _smoothstep((t - 0.07) / 0.02)
                                                         * np.exp(-np.maximum(t - 0.07, 0) / 0.09))
    mix = _pkn(y) + 0.3 * _pkn(fz) + 0.12 * _pkn(hiss) + 0.12 * whine
    return c.reverb(mix, 0.3, 0.1, key="slap")


def _gun_reload(v):
    c = _Ctx("gun_reload", 0.95, loop=False)
    t = c.t
    r = c.rng("glug")
    glug = c.zeros()
    for i, tg in enumerate((0.02, 0.17, 0.31, 0.44, 0.54)):
        f0 = r.uniform(150.0, 240.0) * (1.0 + 0.12 * i)
        c.add(glug, _bubble(f0, xi=r.uniform(0.6, 0.9), damp_mul=1.6) * (1.0 - 0.1 * i), _ns(tg))
        n2 = _ns(0.12)
        t2 = _tt(n2)
        fb = f0 * 2.2 * (1.0 + 1.2 * t2 / 0.12)
        c.add(glug, 0.35 * np.sin(TAU * np.cumsum(fb) / SR) * _decaying(n2, 0.03, 0.004), _ns(tg + 0.01))
        for _ in range(4):
            c.add(glug, 0.3 * _bubble(np.exp(r.uniform(np.log(400.0), np.log(1200.0))), xi=0.3),
                  _ns(tg + r.uniform(0.0, 0.08)))
    gate = 0.5 + 0.5 * np.tanh(2.0 * _lowrand(c.n, 18.0, r))
    stream = c.filt(c.white("stream"), _rbj("bp", 900.0, 1.2), _rbj("lp", 2500.0, 0.7)) * gate
    stream *= _smoothstep(t / 0.05) * (1.0 - _smoothstep((t - 0.5) / 0.15))
    fch = 300.0 + 700.0 * _smoothstep((t - 0.5) / 0.25)
    charge = np.sin(TAU * np.cumsum(fch) / SR) * np.exp(-0.5 * ((t - 0.66) / 0.06) ** 2)
    clk = c.zeros()
    c.add(clk, _modal((2100.0, 3450.0, 5600.0, 330.0), (0.015, 0.009, 0.005, 0.025), (1, .6, .4, .7), 0.08), _ns(0.71))
    c.add(clk, 0.6 * _click(r), _ns(0.71))
    c.add(clk, 0.8 * _modal((2650.0, 4300.0, 6900.0), (0.012, 0.007, 0.004), (1, .6, .4), 0.06), _ns(0.79))
    c.add(clk, 0.5 * _click(r, hp=3000.0), _ns(0.79))
    mix = 0.9 * _pkn(glug) + 0.3 * _pkn(stream) + 0.15 * charge + 0.8 * _pkn(clk)
    return c.reverb(mix, 0.4, 0.14, key="slap")


def _gun_dial(v):
    fq = (1320.0, 990.0)[v]
    c = _Ctx(f"gun_dial{v}", 0.14, loop=False)
    t = c.t
    r = c.rng("x")
    f = fq * (1.0 + 0.04 * np.exp(-t / 0.01))
    ph = np.cumsum(f) / SR
    beep = (np.sin(TAU * ph) + 0.18 * np.sin(3 * TAU * ph) + 0.08 * np.sin(5 * TAU * ph)) * _decaying(c.n, 0.045, 0.002)
    y = c.zeros()
    c.add(y, _modal((4500.0, 7100.0), (0.003, 0.002), (1.0, 0.5), 0.02), 0)
    c.add(y, 0.4 * _click(r, hp=3000.0), 0)
    return 0.6 * _pkn(y) + _pkn(beep)


def _orb_shoot(v):
    c = _Ctx("orb_shoot", 0.6, loop=False)
    t = c.t
    f = 180.0 + 360.0 * _smoothstep(t / 0.14) - 120.0 * _smoothstep((t - 0.2) / 0.35)
    f = f * (1.0 + 0.05 * np.sin(TAU * 13.0 * t))
    ph = np.cumsum(f) / SR
    tone = np.sin(TAU * ph + 2.0 * np.exp(-t / 0.2) * np.sin(TAU * 0.5 * ph))
    tone += 0.3 * np.sin(2 * TAU * ph)
    tone *= _smoothstep(t / 0.03) * np.exp(-np.maximum(t - 0.08, 0.0) / 0.16)
    w = c.white("w")
    fc = 600.0 * (2500.0 / 600.0) ** _smoothstep(t / 0.15)
    whoosh = _svf(w, fc, 1.8, "bpn") * _smoothstep(t / 0.05) * np.exp(-np.maximum(t - 0.05, 0.0) / 0.13)
    r = c.rng("b")
    bub = c.zeros()
    for _ in range(14):
        c.add(bub, _bubble(np.exp(r.uniform(np.log(300.0), np.log(1100.0))), xi=0.4) * r.uniform(0.3, 1.0),
              _ns(r.uniform(0.0, 0.25)))
    mix = _pkn(tone) + 0.5 * _pkn(whoosh) + 0.3 * _pkn(bub)
    return c.reverb(mix, 0.5, 0.18, key="room")


def _orb_hit(v):
    c = _Ctx("orb_hit", 0.65, loop=False)
    t = c.t
    r = c.rng("x")
    ft = 45.0 + 70.0 * np.exp(-t / 0.05)
    thump = np.sin(TAU * np.cumsum(ft) / SR) * _decaying(c.n, 0.12, 0.003)
    w = c.white("splat")
    splat = _svf(w, 400.0 + 3800.0 * np.exp(-t / 0.05), 0.9, "lp") * _decaying(c.n, 0.13, 0.002)
    fz = 120.0 + 800.0 * np.exp(-t / 0.06)
    ph = np.cumsum(fz) / SR
    zap = np.sin(TAU * ph + 2.5 * np.exp(-t / 0.08) * np.sin(TAU * 1.5 * ph)) * _decaying(c.n, 0.15, 0.002)
    sz = c.zeros()
    for _ in range(45):
        tb = r.exponential(0.12)
        if tb > c.sec - 0.03:
            continue
        c.add(sz, _bubble(np.exp(r.uniform(np.log(1500.0), np.log(6000.0))), xi=0.5) * r.uniform(0.2, 1.0)
              * np.exp(-tb / 0.18), _ns(tb))
    hiss = c.filt(w, _rbj("hp", 4000.0, 0.7)) * _decaying(c.n, 0.2, 0.01)
    mix = 0.9 * _pkn(thump) + 0.7 * _pkn(splat) + 0.6 * _pkn(zap) + 0.3 * _pkn(sz) + 0.12 * _pkn(hiss)
    return c.reverb(mix, 0.7, 0.2, key="room")


def _dimension_arrive(v):
    c = _Ctx("dimension_arrive", 1.6, loop=False)
    t = c.t
    r = c.rng("x")
    notes = (74, 76, 78, 81, 83, 85, 86, 90, 93)  # D lydian sparkle
    y = c.zeros()
    for i, m in enumerate(notes):
        f = float(_midi(m))
        bell = _modal((f, 2.0 * f, 3.0 * f, 4.07 * f, 5.4 * f), (0.9, 0.5, 0.3, 0.15, 0.08),
                      (1.0, 0.35, 0.2, 0.12, 0.06), 1.4, attack=0.004, phases=r.uniform(0, TAU, 5))
        c.add(y, bell * (0.55 + 0.45 * np.sin(np.pi * (i + 0.5) / len(notes))), _ns(0.04 + 0.065 * i))
    sh = c.filt(c.white("shimmer"), _rbj("hp", 6000.0, 0.7), _rbj("lp", 13000.0, 0.7))
    sh *= (0.7 + 0.3 * np.sin(TAU * 17.0 * t)) * _smoothstep(t / 0.5) * np.exp(-np.maximum(t - 0.5, 0) / 0.35)
    pad = (np.sin(TAU * float(_midi(50)) * t) + 0.6 * np.sin(TAU * float(_midi(57)) * t)
           + 0.3 * np.sin(TAU * float(_midi(62)) * t))
    pad *= _smoothstep(t / 0.45) * np.exp(-np.maximum(t - 0.45, 0) / 0.4)
    mix = _pkn(y) + 0.12 * _pkn(sh) + 0.22 * _pkn(pad)
    mix = c.reverb(mix, 2.2, 0.45, damp=1.2, key="hall")
    return _fade(mix, 0.0, 0.4)


# =============================================================================================
# Ambient loops
# =============================================================================================
def _amb_wind_howl(c):
    gust = c.u(0.09, "gust", lo=0.1, hi=1.0) ** 1.3
    g = gust * c.u(0.8, "flutter", lo=0.55, hi=1.0)

    def body_gain(ci, f):
        G = g[ci]
        fc = 220.0 + 1500.0 * G ** 1.5
        return G * (60.0 / np.maximum(f, 60.0)) ** 0.5 * _lp(f, fc, 2) * _hp(f, 70.0, 2)

    body = c.stft(c.white("body"), body_gain)
    howl = c.zeros()
    for i, (base, lvl, bw) in enumerate(((330.0, 1.0, 4.0), (520.0, 0.65, 6.0), (840.0, 0.35, 8.0))):
        f = base * 2.0 ** (0.3 * c.smooth(0.05, "hf", i) + 0.35 * (gust - 0.5))
        amp = (c.u(0.06, "ha", i) * (0.3 + gust)) ** 1.6
        howl += lvl * amp * (c.narrow(f, bw, "hn", i) + 0.15 * c.narrow(2.0 * f, bw * 1.5, "hn2", i))
    rumble = c.shape(c.white("rumble"), lambda f: _lp(f, 110.0, 3) * _hp(f, 30.0, 2)) * (0.45 + 0.55 * gust)
    return _rmsn(body) + 0.55 * _rmsn(howl) + 0.2 * _rmsn(rumble)


def _amb_alien_hum(c):
    f0 = 55.0
    drone = c.zeros()
    for k, rr in enumerate((1.0, 2.0, 3.01, 4.03, 5.07, 6.12, 7.2, 8.33, 9.5)):
        a = (1.0 / (1 + k) ** 0.8) * c.u(0.05 + 0.015 * k, "pa", k, lo=0.15, hi=1.0)
        drone += a * c.sine(f0 * rr * (1.0 + 0.0015 * c.smooth(0.08, "pd", k)), k * 0.7)
    for k, rr in enumerate((1.0, 2.0, 3.0)):
        drone += 0.35 / (1 + k) * c.sine(f0 * 1.5 * rr + 0.23 * (k + 1), 1.0 + k)
    wc = 170.0 * 2.0 ** (2.3 * c.u(0.035, "wah"))
    drone = c.stft(drone, lambda ci, f: 0.3 + 1.5 * _band(f, wc[ci], 0.45))
    throb = c.shape(c.white("throb"), lambda f: _band(f, 320.0, 0.45)) * (0.55 + 0.45 * c.lfo(0.45)) ** 2
    wf = 440.0 * 2.0 ** (0.3 * c.smooth(0.04, "wp"))
    ph = c.phase(wf * (1.0 + 0.025 * c.lfo(5.7)))
    warble = (np.sin(TAU * ph) + 0.25 * np.sin(2 * TAU * ph)) * c.u(0.06, "wa") ** 3
    shimmer = c.shape(c.white("sh"), lambda f: _band(f, 5200.0, 0.5)) * c.u(0.2, "sha", lo=0.2, hi=1.0)
    mix = _rmsn(drone) + 0.3 * _rmsn(throb) + 0.25 * _rmsn(warble) + 0.04 * _rmsn(shimmer)
    return c.reverb(mix, 2.5, 0.3, damp=0.8)


def _amb_bubbling(c):
    dens = c.u(0.07, "dens", lo=0.35, hi=1.0)
    r = c.rng("b")
    buf = c.zeros()
    for p in c.poisson(45.0, "small", intensity=dens):
        f0 = np.exp(r.uniform(np.log(380.0), np.log(1900.0)))
        c.add(buf, _bubble(f0, xi=r.uniform(0.05, 0.35)) * r.uniform(0.15, 0.6) * (500.0 / f0) ** 0.4, p)
    for p in c.poisson(10.0, "mid", intensity=dens ** 0.7):
        f0 = np.exp(r.uniform(np.log(170.0), np.log(420.0)))
        c.add(buf, _bubble(f0, xi=r.uniform(0.15, 0.5)) * r.uniform(0.5, 1.0), p)
    for p in c.poisson(1.2, "big"):
        c.add(buf, _bubble(r.uniform(90.0, 150.0), xi=0.6, damp_mul=1.5) * r.uniform(0.8, 1.2), p)
        for _ in range(r.integers(2, 6)):
            c.add(buf, _bubble(np.exp(r.uniform(np.log(250.0), np.log(700.0))), xi=0.3) * r.uniform(0.3, 0.7),
                  p + _ns(r.uniform(0.02, 0.15)))
    simmer = c.shape(c.white("sim"), lambda f: _band(f, 260.0, 0.9)) * (0.6 + 0.4 * c.u(6.0, "simam"))
    hiss = c.shape(c.white("hiss"), lambda f: _band(f, 3500.0, 0.8)) * dens
    mix = _rmsn(buf) + 0.22 * _rmsn(simmer) + 0.05 * _rmsn(hiss)
    return c.reverb(mix, 0.7, 0.2, damp=0.7)


def _chime(f, r, dur=3.4):
    k = (1500.0 / f) ** 0.5
    ratios = (1.0, 2.756, 5.404, 8.933)
    amps = (1.0, 0.45, 0.22, 0.1)
    taus = (2.3, 1.0, 0.45, 0.2)
    n = _ns(dur)
    t = _tt(n)
    y = np.zeros(n)
    for rr, a, tau in zip(ratios, amps, taus):
        fr = f * rr
        if fr > 0.42 * SR:
            continue
        e = np.exp(-t / (tau * k))
        y += a * e * (np.sin(TAU * fr * t + r.uniform(0, TAU)) + 0.6 * np.sin(TAU * fr * 1.0013 * t + r.uniform(0, TAU)))
    y *= np.minimum(1.0, t / 0.0015)
    y += 0.15 * np.concatenate([_click(r, 0.006, 4000.0, 0.0015), np.zeros(n - _ns(0.006))])
    return _fade(y, 0.0, 0.3)


def _amb_crystal_chimes(c):
    r = c.rng("strikes")
    scale = (88, 90, 93, 95, 97, 100, 102, 105)
    n_g = 6
    centers = (np.arange(n_g) + r.uniform(-0.25, 0.25, n_g)) * c.sec / n_g
    strikes = []
    for gc in centers:
        for j in range(r.integers(3, 8)):
            strikes.append((gc + abs(r.normal(0.0, 0.7)), r.uniform(0.3, 1.0) * (0.85 ** j)))
    for _ in range(8):
        strikes.append((r.uniform(0, c.sec), r.uniform(0.15, 0.5)))
    ch = c.zeros()
    for ts, vel in strikes:
        f = float(_midi(scale[r.integers(0, len(scale))]))
        c.add(ch, _chime(f, r) * vel, _ns(ts))
    # gust envelope for the airy bed (periodic sum of bumps)
    T = c.t
    gust = c.zeros()
    for gc in centers:
        s = np.mod(T - gc + c.sec / 2, c.sec) - c.sec / 2
        gust += np.exp(-0.5 * (s / 1.4) ** 2)
    gust = 0.25 + gust

    def air_gain(ci, f):
        return gust[ci] * _band(f, 900.0, 1.2) * (1.0 + 0.4 * _band(f, 4000.0, 0.6))

    air = c.stft(c.white("air"), air_gain)
    pad = c.zeros()
    for k, m in enumerate((76, 83, 88)):
        pad += c.sine(float(_midi(m)) * (1 + 0.0005 * k), k) * c.u(0.05, "pad", k, lo=0.2, hi=1.0)
    mix = _pkn(ch) * 3.0 + 0.08 * _rmsn(air) + 0.04 * _rmsn(pad)
    return c.reverb(mix, 2.8, 0.35, damp=1.2)


def _squelch(r, dur, f_lo, f_hi, q, fb):
    n = _ns(dur)
    t = _tt(n)
    w = r.standard_normal(n)
    gate = 0.5 + 0.5 * np.tanh(2.5 * _lowrand(n, 45.0, r))
    f = fb * (1.0 + 0.08 * _lowrand(n, 6.0, r))
    src = w * gate + 0.6 * _saw(np.cumsum(f) / SR, f) * (0.5 + 0.5 * gate)
    pos = np.sin(np.pi * t / dur) ** 1.2
    y = _svf(src, f_lo * (f_hi / f_lo) ** pos, q, "bpn")
    return y * _smoothstep(t / 0.03) * _smoothstep((dur - t) / (dur * 0.5))


def _thump(f0, f1, tau_f, tau_a, dur, attack=0.004):
    n = _ns(dur)
    t = _tt(n)
    f = f1 + (f0 - f1) * np.exp(-t / tau_f)
    return _fade(np.sin(TAU * np.cumsum(f) / SR) * _decaying(n, tau_a, attack), 0.0, dur * 0.3)


def _amb_wet_squelch(c):
    r = c.rng("ev")
    beat = c.zeros()
    period = c.sec / round(c.sec / 1.25)
    for k in range(int(round(c.sec / period))):
        tb = k * period
        c.add(beat, _thump(75.0, 42.0, 0.04, 0.09, 0.35) * r.uniform(0.85, 1.0), _ns(tb))
        c.add(beat, 0.7 * _thump(90.0, 50.0, 0.03, 0.07, 0.3) * r.uniform(0.8, 1.0), _ns(tb + 0.28))
    beat = c.filt(beat, _rbj("lp", 180.0, 0.7))
    sq = c.zeros()
    for p in c.poisson(0.55, "squelch"):
        dur = r.uniform(0.18, 0.5)
        c.add(sq, _squelch(r, dur, r.uniform(200, 400), r.uniform(700, 1400), r.uniform(3, 6), r.uniform(70, 130))
              * r.uniform(0.4, 1.0), p)
        for _ in range(r.integers(2, 6)):
            c.add(sq, 0.3 * _bubble(np.exp(r.uniform(np.log(200.0), np.log(900.0))), xi=0.6),
                  p + _ns(r.uniform(0.0, dur)))
    for p in c.poisson(0.18, "slurp"):
        dur = r.uniform(0.6, 1.1)
        c.add(sq, _squelch(r, dur, r.uniform(250, 350), r.uniform(900, 1600), r.uniform(5, 8), r.uniform(60, 90))
              * r.uniform(0.5, 0.9), p)
    drip = c.zeros()
    for p in c.poisson(0.4, "drip"):
        n2 = _ns(0.12)
        t2 = _tt(n2)
        f = 700.0 * (3.0 ** np.minimum(t2 / 0.02, 1.0))
        c.add(drip, np.sin(TAU * np.cumsum(f) / SR) * _decaying(n2, 0.03, 0.001) * r.uniform(0.3, 1.0), p)
    bed = c.shape(c.white("bed"), lambda f: _lp(f, 300.0, 2) * _hp(f, 50.0)) * (0.5 + 0.5 * c.u(4.0, "bedam")) ** 2
    small = c.zeros()
    for p in c.poisson(6.0, "small"):
        small_f = np.exp(r.uniform(np.log(250.0), np.log(800.0)))
        c.add(small, _bubble(small_f, xi=0.4, damp_mul=1.4) * r.uniform(0.2, 0.6), p)
    mix = 0.7 * _pkn(beat) + 0.9 * _pkn(sq) + 0.25 * _pkn(drip) + 0.3 * _rmsn(bed) * 0.4 + 0.25 * _pkn(small)
    return c.reverb(mix, 0.9, 0.3, damp=0.6)


def _thunder(r, dur=6.0):
    n = _ns(dur)
    w = r.standard_normal(n)
    low = _filt(w, [_rbj("lp", 90.0, 0.7), _rbj("lp", 160.0, 0.6), _rbj("hp", 25.0, 0.7)])
    mid = _filt(w[::-1].copy(), [_rbj("bp", 260.0, 0.8)])
    t = _tt(n)
    env_l = np.zeros(n)
    env_m = np.zeros(n)
    for i in range(r.integers(4, 8)):
        s = 0.1 if i == 0 else r.uniform(0.3, dur * 0.45)
        at = r.uniform(0.35, 0.8)
        dc = r.uniform(0.5, 1.8)
        a = r.uniform(0.4, 1.0) * (1.4 if i == 0 else 1.0)
        tt = t - s
        e = np.where(tt < 0, 0.0, _smoothstep(tt / at) * np.exp(-np.maximum(tt - at, 0) / dc))
        env_l += a * e
        env_m += a * e ** 2
    return _fade(_rmsn(low) * env_l + 0.35 * _rmsn(mid) * env_m, 0.3, 1.0)


def _amb_electric_buzz(c):
    r = c.rng("ev")
    T = c.t
    arc = c.zeros()
    for p in c.poisson(0.15, "arcs"):
        s = np.mod(T - p / SR + 1.0, c.sec) - 1.0
        length = r.uniform(0.3, 1.2)
        arc += np.where((s > 0) & (s < length), np.sin(np.pi * np.clip(s / length, 0, 1)) ** 0.5, 0.0) * r.uniform(0.5, 1)
    dens = c.u(0.2, "dens", lo=0.15, hi=1.0) ** 2 + 2.0 * arc
    imp = c.zeros()
    pos = c.poisson(150.0, "crk", intensity=np.minimum(dens / 3.0, 1.0))
    amps = np.minimum((r.pareto(1.5, len(pos)) + 1.0), 25.0) * r.choice([-1.0, 1.0], len(pos))
    np.add.at(imp, pos, amps)
    crackle = c.filt(imp, _rbj("hp", 1200.0, 0.7), _rbj("peak", 3500.0, 1.0, 6.0), _rbj("lp", 9000.0, 0.7))
    f_b = c.qf(120.0) * (1.0 + 0.004 * c.smooth(0.3, "bf") + 0.02 * arc * c.smooth(30.0, "bj"))
    ph = c.phase(f_b)
    buzz = _saw(ph, f_b) + 0.5 * _saw(ph * 2.0 + 0.3, f_b * 2)
    buzz = c.filt(buzz, _rbj("hp", 250.0, 0.7), _rbj("peak", 1800.0, 1.2, 6.0), _rbj("lp", 4500.0, 0.7))
    buzz *= 0.15 + 0.35 * c.u(0.25, "bamp") ** 2 + 0.45 * arc
    static = c.shape(c.white("static"), lambda f: _hp(f, 600.0) * _lp(f, 9000.0) * (f / 4000.0 + 0.3) ** 0.3)
    static *= 0.6 + 0.4 * c.u(0.6, "stam")
    thunder = c.zeros()
    for i, frac in enumerate((0.18, 0.62)):
        thunder_r = c.rng("thunder", i)
        c.add(thunder, _thunder(thunder_r, 6.5) * (1.0 if i == 0 else 0.75), _ns(frac * c.sec + r.uniform(-1, 1)))
    hum = c.sine(c.qf(60.0)) * 0.5 + c.sine(c.qf(180.0)) * 0.2
    mix = (0.55 * _pkn(crackle) + 0.08 * _rmsn(buzz) + 0.06 * _rmsn(static) + 1.3 * _pkn(thunder)
           + 0.04 * hum)
    return c.reverb(mix, 1.6, 0.2, damp=0.7)


def _whale(r, dur, fb):
    n = _ns(dur)
    t = _tt(n)
    contour = _curve(n, r.uniform(0.65, 1.6, 5))
    f = fb * contour * (1.0 + 0.012 * np.sin(TAU * r.uniform(3.5, 5.5) * t))
    ph = np.cumsum(f) / SR
    src = np.sin(TAU * ph) + 0.55 * np.sin(2 * TAU * ph) + 0.3 * np.sin(3 * TAU * ph) + 0.12 * np.sin(4 * TAU * ph)
    src *= 1.0 + 0.15 * _lowrand(n, 20.0, r)
    env = np.sin(np.pi * t / dur) ** 1.3
    return _filt(src * env, [_rbj("lp", 1100.0, 0.7)])


def _amb_deep_ocean(c):
    r = c.rng("ev")
    surge = c.u(1.0 / 9.0, "surge", lo=0.35, hi=1.0)

    def bed_gain(ci, f):
        return surge[ci] * _lp(f, 160.0 + 200.0 * surge[ci], 2) * _hp(f, 25.0) * (40.0 / np.maximum(f, 40.0)) ** 0.5

    bed = c.stft(c.white("bed"), bed_gain)
    far = c.shape(c.white("far"), lambda f: _band(f, 700.0, 0.8)) * c.u(0.07, "faram", lo=0.2, hi=1.0)
    calls = c.zeros()
    k = 3
    for i in range(k):
        dur = r.uniform(3.5, 6.0)
        start = (i + r.uniform(0.0, 0.4)) * c.sec / k
        c.add(calls, _whale(r, dur, r.uniform(150.0, 230.0)) * r.uniform(0.7, 1.0), _ns(start))
    n2 = _ns(2.4)
    t2 = _tt(n2)
    cry_f = 380.0 * (2.3 ** _smoothstep(t2 / 1.6))
    cry = np.sin(TAU * np.cumsum(cry_f) / SR) * np.sin(np.pi * t2 / 2.4) ** 2
    c.add(calls, 0.4 * _filt(cry, [_rbj("lp", 1500.0, 0.7)]), _ns(c.sec * 0.55))
    bub = c.zeros()
    for p in c.poisson(0.25, "bubs"):
        for _ in range(r.integers(4, 12)):
            c.add(bub, _bubble(np.exp(r.uniform(np.log(200.0), np.log(900.0))), xi=0.3) * r.uniform(0.2, 0.8),
                  p + _ns(r.exponential(0.35)))
    bub = c.filt(bub, _rbj("lp", 1200.0, 0.7))
    calls = c.reverb(calls, 4.5, 0.9, damp=0.35, key="deep", dry=0.4)
    mix = 0.45 * _rmsn(bed) + 0.06 * _rmsn(far) + 2.4 * _pkn(calls) + 0.35 * _pkn(bub)
    mix = c.reverb(mix, 2.0, 0.25, damp=0.4)
    return c.filt(mix, _rbj("lp", 2200.0, 0.7))


def _amb_volcanic_rumble(c):
    r = c.rng("ev")
    surge = c.u(0.2, "surge", lo=0.3, hi=1.0)

    def rumble_gain(ci, f):
        s = surge[ci]
        return s * _lp(f, 70.0 + 80.0 * s, 3) * _hp(f, 28.0, 2) * (40.0 / np.maximum(f, 40.0)) ** 0.3

    rumble = c.stft(c.white("rumble"), rumble_gain)
    roar = c.shape(c.white("roar"), lambda f: _band(f, 600.0, 1.0)) * c.u(0.15, "roar", lo=0.3, hi=1.0)
    blorp = c.zeros()
    for p in c.poisson(1.1, "blorp"):
        f0 = r.uniform(60.0, 170.0)
        c.add(blorp, _bubble(f0, xi=r.uniform(0.4, 0.9), damp_mul=1.8, maxdur=0.7) * r.uniform(0.5, 1.0), p)
        pop = _filt(r.standard_normal(_ns(0.05)) * _decaying(_ns(0.05), 0.01, 0.001), [_rbj("lp", 700.0, 0.7)])
        c.add(blorp, 0.4 * pop, p + _ns(0.06 + r.uniform(0, 0.05)))
    imp = c.zeros()
    pos = c.poisson(6.0, "crk", intensity=c.u(0.3, "crkd") ** 2)
    np.add.at(imp, pos, np.minimum(r.pareto(1.8, len(pos)) + 1.0, 12.0) * r.choice([-1.0, 1.0], len(pos)))
    crackle = c.filt(imp, _rbj("bp", 2200.0, 1.2), _rbj("hp", 700.0, 0.7))
    booms = c.zeros()
    for i, frac in enumerate((0.3, 0.78)):
        n2 = _ns(3.0)
        w = c.rng("boom", i).standard_normal(n2)
        b = _filt(w, [_rbj("lp", 120.0, 0.7)]) * _decaying(n2, 0.5, 0.02) * 4.0
        b += _thump(70.0, 38.0, 0.08, 0.5, 3.0, 0.01)
        c.add(booms, b, _ns(frac * c.sec))
    booms = c.reverb(booms, 3.0, 0.6, damp=0.4, key="boom")
    mix = 0.6 * _rmsn(rumble) + 0.2 * _rmsn(roar) + 1.6 * _pkn(blorp) + 0.7 * _pkn(crackle) + 2.0 * _pkn(booms)
    return c.reverb(mix, 1.5, 0.2, damp=0.5)


def _amb_eerie_choir(c):
    chords = ((57, 60, 64, 71), (53, 57, 60, 64), (50, 57, 62, 65), (52, 56, 59, 62))
    seg = c.n // len(chords)
    kern_n = _ns(1.6)
    kern = np.hanning(kern_n)
    kern /= kern.sum()
    K = np.fft.rfft(np.concatenate([kern, np.zeros(c.n - kern_n)]))
    voices = c.zeros()
    for v in range(4):
        steps = np.repeat([chords[i][v] for i in range(len(chords))], seg)
        steps = np.concatenate([steps, np.full(c.n - len(steps), chords[-1][v])])
        midi = np.roll(np.fft.irfft(np.fft.rfft(steps) * K, c.n), -(kern_n // 2))
        f = _midi(midi)
        amp = c.u(0.07, "vamp", v, lo=0.25, hi=1.0)
        for j, cents in enumerate((-9.0, 0.0, 8.0)):
            vib = 1.0 + 0.004 * np.sin(TAU * c.phase(4.6 + 0.4 * j + 0.2 * v) + j) * (0.6 + 0.4 * c.u(0.2, "vd", v, j))
            fj = f * 2.0 ** (cents / 1200.0) * vib
            voices += amp * _saw(c.phase(fj) + 0.31 * j, fj)
    morph = c.u(0.05, "vowel")
    F = [(300.0, 730.0, 90.0, 1.0), (870.0, 1090.0, 110.0, 0.55), (2240.0, 2440.0, 150.0, 0.25)]

    def formant_gain(ci, f):
        m = morph[ci]
        g = 0.015 + np.zeros_like(f)
        for lo, hi, bw, a in F:
            fc = lo + (hi - lo) * m
            g = g + a * np.exp(-0.5 * ((f - fc) / bw) ** 2)
        return g * _lp(f, 3500.0, 2)

    choir = c.stft(voices, formant_gain)
    breath = c.stft(c.white("breath"), formant_gain) * c.u(0.1, "br", lo=0.3, hi=1.0)
    wf = _midi(76.0 + 2.0 * c.smooth(0.05, "wail"))
    ghost = c.sine(wf * (1.0 + 0.006 * c.lfo(5.0))) * c.u(0.045, "ghost") ** 3
    swell = c.u(0.08, "swell", lo=0.55, hi=1.0)
    mix = (_rmsn(choir) + 0.15 * _rmsn(breath) + 0.25 * _rmsn(ghost)) * swell
    return c.reverb(mix, 3.8, 0.6, damp=0.8, key="hall")


def _cricket_chirp(fc, pulses, plen, gap, r):
    n = _ns(pulses * (plen + gap) + 0.01)
    t = _tt(n)
    env = np.zeros(n)
    for k in range(pulses):
        s = (t - k * (plen + gap)) / plen
        env += np.where((s > 0) & (s < 1), np.sin(np.pi * np.clip(s, 0, 1)) ** 2, 0.0) * (0.8 + 0.2 * r.random())
    return env * np.sin(TAU * fc * t * (1.0 + 0.01 * np.sin(TAU * 40.0 * t)))


def _frog(fc, dur, pulse_rate, r, harm=0.3):
    n = _ns(dur)
    t = _tt(n)
    f = fc * (1.0 - 0.12 * t / dur)
    ph = np.cumsum(f) / SR
    am = (0.5 + 0.5 * np.cos(TAU * pulse_rate * t)) ** 3
    y = (np.sin(TAU * ph) + harm * np.sin(2 * TAU * ph) + 0.5 * harm * np.sin(3 * TAU * ph)) * am
    return y * np.sin(np.pi * t / dur) ** 0.6


def _amb_jungle_night(c):
    r = c.rng("ev")
    crick = c.zeros()
    # foreground crickets with regular chirping
    for i, (fc, per, lvl) in enumerate(((4400.0, 0.42, 1.0), (5150.0, 0.55, 0.6))):
        active = c.u(0.06, "ca", i)
        tt = r.uniform(0, per)
        while tt < c.sec:
            if active[_ns(tt) % c.n] > 0.3:
                c.add(crick, _cricket_chirp(fc * r.uniform(0.995, 1.005), r.integers(3, 5), 0.012, 0.016, r)
                      * lvl * r.uniform(0.7, 1.0), _ns(tt))
            tt += per * r.uniform(0.94, 1.06)
    # distant chorus
    chorus = c.zeros()
    for i in range(8):
        fc = r.uniform(3600.0, 5800.0)
        per = r.uniform(0.3, 0.7)
        tt = r.uniform(0, per)
        while tt < c.sec:
            c.add(chorus, _cricket_chirp(fc, r.integers(2, 5), 0.01, 0.015, r) * r.uniform(0.3, 1.0), _ns(tt))
            tt += per * r.uniform(0.9, 1.1)
    chorus = c.filt(chorus, _rbj("lp", 5000.0, 0.7)) * c.u(0.1, "chor", lo=0.4, hi=1.0)
    # katydid rasps
    kat = c.zeros()
    for p in c.poisson(0.35, "kat"):
        for j in range(r.integers(2, 4)):
            n2 = _ns(0.035)
            burst = r.standard_normal(n2) * np.sin(np.pi * _tt(n2) / 0.035) ** 2
            c.add(kat, burst, p + _ns(j * 0.07))
    kat = c.filt(kat, _rbj("bp", 7200.0, 2.0), _rbj("bp", 7200.0, 2.0))
    # frogs
    frogs = c.zeros()
    for p in c.poisson(0.3, "treefrog"):
        fc = r.uniform(1500.0, 2300.0)
        for j in range(r.integers(3, 7)):
            call = _frog(fc, 0.08, r.uniform(110, 150), r)
            call[_ns(0.02):] += 0.7 * _frog(fc * 0.94, 0.06, 130.0, r)
            c.add(frogs, call * r.uniform(0.6, 1.0), p + _ns(j * r.uniform(0.32, 0.45)))
    for p in c.poisson(0.12, "bullfrog"):
        for j in range(r.integers(1, 3)):
            c.add(frogs, 0.6 * _frog(r.uniform(170.0, 220.0), 0.38, 28.0, r, harm=0.8), p + _ns(j * 0.9))
    # an alien night bird: two soft hoots
    hoot = c.zeros()
    for p in c.poisson(0.07, "hoot"):
        for j in range(2):
            n2 = _ns(0.35)
            t2 = _tt(n2)
            f = r.uniform(360.0, 420.0) * (1.0 - 0.05 * t2 / 0.35)
            ph = np.cumsum(f) / SR
            hoot_s = (np.sin(TAU * ph) + 0.2 * np.sin(2 * TAU * ph)) * np.sin(np.pi * t2 / 0.35) ** 2
            c.add(hoot, hoot_s, p + _ns(j * 0.5))
    bed = c.shape(c.white("bed"), lambda f: _lp(f, 400.0, 2) * _hp(f, 40.0)) * c.u(0.1, "bedam", lo=0.6, hi=1.0)
    mix = (0.35 * _pkn(crick) + 0.3 * _pkn(chorus) + 0.12 * _pkn(kat) + 0.55 * _pkn(frogs)
           + 0.25 * _pkn(hoot) + 0.12 * _rmsn(bed) * 0.3)
    return c.reverb(mix, 1.2, 0.22, damp=0.9)


def _pluck(f, dur, bright=1.0, nh=12):
    n = _ns(dur)
    t = _tt(n)
    y = np.zeros(n)
    for k in range(1, nh + 1):
        if f * k > 0.42 * SR:
            break
        tau = 0.35 / (1.0 + 0.45 * k / bright)
        y += np.sin(TAU * f * k * t) * np.exp(-t / tau) / k
    return _fade(y * np.minimum(1.0, t / 0.003), 0.0, dur * 0.3)


def _amb_neon_synth(c):
    # 80 BPM, 8 bars of 4/4 = 24.0 s: Am | F | C | G, two bars each
    beat = 60.0 / 80.0
    chords = (
        ((57, 60, 64, 69), 45, (69, 72, 76, 81)),
        ((53, 57, 60, 65), 41, (65, 69, 72, 77)),
        ((55, 60, 64, 67), 36, (67, 72, 76, 79)),
        ((55, 59, 62, 67), 43, (67, 71, 74, 79)),
    )
    seg = 8 * beat
    r = c.rng("arp")
    pad = c.zeros()
    arp = c.zeros()
    bass = c.zeros()
    xf = 0.7
    pattern = (0, 1, 2, 3, 1, 2, 3, 2)
    for ci_, (pad_notes, root, arp_notes) in enumerate(chords):
        t0 = ci_ * seg
        n_pad = _ns(seg + 2 * xf)
        tp = _tt(n_pad)
        env = _smoothstep(tp / (2 * xf)) * _smoothstep((seg + 2 * xf - tp) / (2 * xf))
        for m in pad_notes:
            f = float(_midi(m))
            for j, cents in enumerate((-7.0, 0.0, 7.0)):
                fj = f * 2.0 ** (cents / 1200.0)
                ph = fj * tp + r.random()
                c.add(pad, _saw(ph, fj) * env * 0.33, _ns(t0 - xf))
            c.add(pad, 0.3 * np.sin(TAU * f / 2 * tp) * env, _ns(t0 - xf))
        for s in range(32):
            m = arp_notes[pattern[s % 8]] + (12 if (s // 8) == 3 and pattern[s % 8] < 2 else 0)
            vel = (1.0 if s % 4 == 0 else 0.7) * r.uniform(0.85, 1.0)
            c.add(arp, _pluck(float(_midi(m)), 0.45, bright=1.2) * vel, _ns(t0 + s * beat / 4))
        for s in range(16):
            vel = 1.0 if s % 2 == 0 else 0.75
            n_b = _ns(beat / 2 * 0.95)
            tb = _tt(n_b)
            fb = float(_midi(root))
            note = (np.sin(TAU * fb * tb) + 0.25 * np.sin(2 * TAU * fb * tb) + 0.1 * np.sin(3 * TAU * fb * tb))
            note *= np.minimum(1.0, tb / 0.005) * np.exp(-tb / 0.25)
            c.add(bass, _fade(note, 0.0, 0.03) * vel, _ns(t0 + s * beat / 2))
    lfo = 0.5 + 0.5 * c.lfo(1.0 / 12.0)
    pad = c.stft(pad, lambda ci, f: _lp(f, 700.0 + 1000.0 * lfo[ci], 2) * (1.0 + 0.6 * _band(f, 700.0 + 1000.0 * lfo[ci], 0.3)))
    arp = c.filt(arp, _rbj("lp", 3200.0, 0.8))
    arp = c.delay_fb(arp, 3 * beat / 4, 0.38, lp=2500.0, wet=0.4)
    mix = 0.35 * _rmsn(pad) + 0.6 * _rmsn(arp) + 0.4 * _rmsn(bass)
    mix = np.tanh(1.1 * mix / np.max(np.abs(mix)))  # gentle tape-ish saturation
    return c.reverb(mix, 2.2, 0.3, damp=1.0, key="hall")


def _glitch_event(r, kind):
    if kind == 0:  # stutter
        seg_n = _ns(r.uniform(0.008, 0.04))
        ts = _tt(seg_n)
        f = r.uniform(200.0, 2000.0)
        snip = np.sin(TAU * f * ts + 3.0 * np.sin(TAU * f * r.uniform(0.5, 3.0) * ts)) if r.random() < 0.6 \
            else r.standard_normal(seg_n)
        reps = r.integers(4, 12)
        parts = []
        for k in range(reps):
            step = 1.0 + (k * r.uniform(0.0, 0.15) if r.random() < 0.5 else 0.0)
            idx = np.minimum((np.arange(int(seg_n / step)) * step).astype(int), seg_n - 1)
            parts.append(_fade(snip[idx], 0.0005, 0.0005) * (0.6 + 0.4 * r.random()))
        y = np.concatenate(parts)
        y = _crush(y, r.integers(3, 6), r.integers(2, 10))
    elif kind == 1:  # modem FSK
        bit = 0.008
        nb = r.integers(12, 40)
        fa, fb = (1200.0, 2200.0) if r.random() < 0.5 else (1070.0 * 1.5, 1270.0 * 1.5)
        bits = r.integers(0, 2, nb)
        f = np.repeat(np.where(bits > 0, fb, fa), _ns(bit))
        y = np.sin(TAU * np.cumsum(f) / SR)
        y = _crush(y, 4, 2)
    elif kind == 2:  # fast sweep
        n = _ns(r.uniform(0.06, 0.2))
        t = _tt(n)
        lo, hi = 150.0, r.uniform(2000.0, 6000.0)
        f = lo * (hi / lo) ** (t / t[-1]) if r.random() < 0.5 else hi * (lo / hi) ** (t / t[-1])
        y = _crush(np.sign(np.sin(TAU * np.cumsum(f) / SR)) * 0.6, 3, r.integers(4, 12))
    elif kind == 3:  # digital clicks
        n = _ns(0.08)
        y = np.zeros(n)
        for _ in range(r.integers(3, 10)):
            p = r.integers(0, n - 4)
            y[p:p + r.integers(1, 4)] = r.choice([-1.0, 1.0]) * r.uniform(0.4, 1.0)
        return _filt(y, [_rbj("lp", 9000.0, 0.7)])
    else:  # crushed static burst
        n = _ns(r.uniform(0.03, 0.09))
        y = _crush(r.standard_normal(n) * 0.5, 2, r.integers(4, 12))
    return _fade(y, 0.001, 0.002)


def _amb_glitch_noise(c):
    r = c.rng("ev")
    ev = c.zeros()
    times = np.sort(r.uniform(0, c.sec, 16))
    for tt in times:
        kind = r.integers(0, 5)
        e = _glitch_event(r, kind) * r.uniform(0.3, 1.0)
        c.add(ev, e, _ns(tt))
        if r.random() < 0.3:  # echoing repeat of the same glitch
            c.add(ev, e * 0.4, _ns(tt + r.uniform(0.1, 0.3)))
    hum = c.sine(c.qf(50.0)) + 0.4 * c.sine(c.qf(100.0), 1.0) + 0.2 * c.sine(c.qf(150.0), 2.0)
    hum *= c.u(0.1, "hum", lo=0.5, hi=1.0)
    hiss = c.shape(c.white("hiss"), lambda f: _hp(f, 5000.0) * _lp(f, 12000.0))
    data = c.white("data")
    data = data[(np.arange(c.n) // 49) * 49]
    data = c.shape(data, lambda f: _lp(f, 3000.0) * _hp(f, 300.0)) * c.u(0.2, "data") ** 3
    mix = 0.8 * _pkn(ev) + 0.07 * _rmsn(hum) + 0.015 * _rmsn(hiss) + 0.03 * _rmsn(data)
    return c.reverb(mix, 0.9, 0.18, damp=1.0)


def _amb_cosmic_drone(c):
    drone = c.zeros()
    for vi, root in enumerate((38, 45, 50, 57)):
        f0 = float(_midi(root))
        for k in range(1, 13):
            if f0 * k > 6000:
                break
            a = (1.0 / k ** 1.2) * c.u(0.03 + 0.01 * k, "h", vi, k, lo=0.0, hi=1.0) ** 1.5
            drone += a * c.sine(f0 * k, vi + k)
            drone += 0.6 * a * c.sine(f0 * k + 0.13 * (vi + 1), vi * 2 + k)
    sweep = 220.0 * 2.0 ** (3.0 * (0.5 + 0.5 * c.lfo(2.0 / c.sec)))
    drone = c.stft(drone, lambda ci, f: 0.35 + 1.2 * _band(f, sweep[ci], 0.6))
    r = c.rng("tw")
    tw = c.zeros()
    harmonics = (1174.7, 1468.3, 1760.0, 2349.3, 2637.0, 2960.0)
    for i in range(9):
        f = harmonics[r.integers(0, len(harmonics))]
        dur = r.uniform(3.0, 6.0)
        n2 = _ns(dur)
        t2 = _tt(n2)
        env = np.sin(np.pi * t2 / dur) ** 2
        s = np.sin(TAU * f * t2 * (1.0 + 0.002 * np.sin(TAU * 5.0 * t2)))
        c.add(tw, s * env * r.uniform(0.4, 1.0), _ns((i + r.uniform(0, 0.6)) * c.sec / 9))
    wind = c.shape(c.white("wind"), lambda f: _lp(f, 1500.0) * _hp(f, 100.0)) * c.u(0.06, "wind", lo=0.2, hi=1.0)
    mix = _rmsn(drone) + 0.12 * _rmsn(tw) + 0.1 * _rmsn(wind)
    return c.reverb(mix, 5.0, 0.5, damp=0.8, key="space")


def _bird_note(f0, f1, dur, fm_rate=0.0, fm_depth=0.0):
    n = _ns(dur)
    t = _tt(n)
    f = (f0 + (f1 - f0) * _smoothstep(t / dur)) * (1.0 + fm_depth * np.sin(TAU * fm_rate * t))
    ph = np.cumsum(f) / SR
    return (np.sin(TAU * ph) + 0.08 * np.sin(2 * TAU * ph)) * np.sin(np.pi * t / dur) ** 1.5


def _bird_phrase(r, species):
    parts = []
    if species == 0:  # tweet-tweet-tweet
        for _ in range(r.integers(2, 5)):
            f0 = r.uniform(2800.0, 3300.0)
            parts += [_bird_note(f0, f0 * 1.45, 0.07), np.zeros(_ns(r.uniform(0.05, 0.09)))]
    elif species == 1:  # fast warbling trill
        base = r.uniform(3600.0, 4600.0)
        for k in range(r.integers(10, 20)):
            a = base * (1.12 if k % 2 else 0.92) * r.uniform(0.97, 1.03)
            parts += [_bird_note(a, a * 0.85, 0.028, 60.0, 0.02), np.zeros(_ns(0.012))]
    else:  # fee-bee whistle
        f0 = r.uniform(3700.0, 4100.0)
        parts += [_bird_note(f0, f0 * 0.98, 0.32), np.zeros(_ns(0.06)), _bird_note(f0 * 0.84, f0 * 0.82, 0.38)]
    return np.concatenate(parts)


def _amb_cozy_breeze(c):
    gust = c.u(0.1, "gust", lo=0.2, hi=1.0)

    def wind_gain(ci, f):
        G = gust[ci]
        return G * _lp(f, 400.0 + 700.0 * G, 2) * _hp(f, 60.0) * (100.0 / np.maximum(f, 100.0)) ** 0.5

    wind = c.stft(c.white("wind"), wind_gain)
    gr = c.rng("rustle")
    rustle = c.zeros()
    for p in c.poisson(140.0, "rus", intensity=gust ** 2):
        n2 = _ns(gr.uniform(0.004, 0.02))
        c.add(rustle, gr.standard_normal(n2) * np.hanning(n2) * gr.uniform(0.1, 1.0), p)
    rustle = c.filt(rustle, _rbj("hp", 1800.0, 0.7), _rbj("lp", 7500.0, 0.7))
    r = c.rng("birds")
    birds = c.zeros()
    for i in range(9):
        sp = r.integers(0, 3)
        dist = r.uniform(0.4, 1.0)
        ph = _bird_phrase(r, sp)
        if dist < 0.5:
            ph = _filt(ph, [_rbj("lp", 5000.0, 0.7)])
        c.add(birds, ph * dist, _ns((i + r.uniform(0.0, 0.7)) * c.sec / 9))
    birds = c.reverb(birds, 1.0, 0.35, damp=1.0, key="birds")
    mix = 0.45 * _rmsn(wind) + 0.18 * _rmsn(rustle) + 2.2 * _pkn(birds)
    return c.reverb(mix, 0.8, 0.12, damp=1.0)


def _amb_clockwork(c):
    r = c.rng("ev")
    ticks = c.zeros()
    period = 0.5
    for k in range(int(round(c.sec / period))):
        jit = r.uniform(0.995, 1.005)
        if k % 2 == 0:
            tk = _modal(np.array((3150.0, 4870.0, 7230.0, 9800.0)) * jit, (0.018, 0.011, 0.007, 0.004),
                        (1.0, 0.7, 0.5, 0.3), 0.06)
            tk = tk + 0.4 * np.concatenate([_click(r, 0.004, 3000.0, 0.0006), np.zeros(len(tk) - _ns(0.004))])
        else:
            tk = _modal(np.array((2350.0, 3920.0, 6100.0, 900.0)) * jit, (0.025, 0.015, 0.008, 0.012),
                        (1.0, 0.6, 0.4, 0.5), 0.07)
            tk = tk + 0.3 * np.concatenate([_click(r, 0.004, 2000.0, 0.0006), np.zeros(len(tk) - _ns(0.004))])
        c.add(ticks, tk * r.uniform(0.85, 1.0), _ns(0.13 + k * period))
    ratchet = c.zeros()
    for s0 in np.arange(1.0, c.sec, 8.0):
        length = r.uniform(2.0, 4.0)
        for k in range(int(length * 12)):
            rk = _modal((6200.0 * r.uniform(0.98, 1.02), 8900.0), (0.004, 0.003), (1.0, 0.6), 0.015)
            c.add(ratchet, rk * r.uniform(0.5, 1.0) * np.sin(np.pi * k / (length * 12)), _ns(s0 + k / 12.0))
    clunk = c.zeros()
    for s0 in np.arange(0.38, c.sec, 6.0):
        ck = _modal((190.0, 430.0, 970.0, 1650.0), (0.12, 0.06, 0.04, 0.02), (1.0, 0.7, 0.4, 0.3), 0.4)
        thud = _filt(r.standard_normal(_ns(0.1)) * _decaying(_ns(0.1), 0.02, 0.001), [_rbj("lp", 400.0, 0.7)])
        c.add(clunk, ck, _ns(s0))
        c.add(clunk, 0.6 * thud, _ns(s0))
    whir = c.filt(_saw(c.phase(c.qf(48.0)), 48.0), _rbj("lp", 250.0, 0.8))
    whir += 0.3 * c.sine(c.qf(640.0)) * (0.5 + 0.5 * c.lfo(8.0))
    steam = c.zeros()
    for i in range(3):
        sus = r.uniform(0.4, 1.2)
        n2 = _ns(0.08 + sus + 0.6)
        t2 = _tt(n2)
        env = _smoothstep(t2 / 0.15) * (1.0 - _smoothstep((t2 - 0.08 - sus) / 0.6)) * (1.0 - 0.4 * t2 / t2[-1])
        sr_ = c.rng("steam", i)
        hs = sr_.standard_normal(n2) * env * (1.0 + 0.15 * np.sin(TAU * sr_.uniform(25, 40) * t2))
        hs = _filt(hs, [_rbj("hp", 2200.0, 0.7), _rbj("peak", 4500.0, 1.0, 5.0), _rbj("lp", 10000.0, 0.7)])
        pff = _filt(sr_.standard_normal(_ns(0.1)) * _decaying(_ns(0.1), 0.03, 0.005), [_rbj("lp", 600.0, 0.7)])
        c.add(steam, hs, _ns((i + r.uniform(0.2, 0.7)) * c.sec / 3))
        c.add(steam, 3.0 * pff, _ns((i + 0.45) * c.sec / 3))
    mix = (0.8 * _pkn(ticks) + 0.15 * _pkn(ratchet) + 0.45 * _pkn(clunk) + 0.06 * _rmsn(whir)
           + 0.25 * _pkn(steam))
    return c.reverb(mix, 0.8, 0.18, damp=1.0)


def _musicbox(f, r):
    k = (1046.5 / f) ** 0.6
    y = _modal((f, f * 1.0009, 2.0 * f, 3.0 * f, 5.93 * f), (1.4 * k, 1.4 * k, 0.5 * k, 0.25 * k, 0.05 * k),
               (0.6, 0.4, 0.15, 0.08, 0.3), 2.2, attack=0.0005, phases=r.uniform(0, 0.3, 5))
    y[:_ns(0.003)] += 0.1 * _click(r, 0.003, 5000.0, 0.0005)
    return y


def _amb_candy_chime(c):
    # 3/4 at 100 BPM: 16 bars x 1.8 s = 28.8 s
    beat = 0.6
    bar = 3 * beat
    prog = ((0, (60, 64, 67)), (9, (57, 60, 64)), (5, (53, 57, 60)), (7, (55, 59, 62)),
            (0, (60, 64, 67)), (9, (57, 60, 64)), (2, (50, 53, 57)), (7, (55, 59, 62)))
    scale = [72, 74, 76, 79, 81, 84, 86, 88, 91, 93]
    r = c.rng("melody")
    box = c.zeros()
    pad = c.zeros()
    deg = 4
    rhythm = [r.random() < 0.6 for _ in range(12)]
    for bi in range(16):
        root, chord = prog[bi // 2]
        t0 = bi * bar
        for j in range(3):
            m = chord[j] + 12
            c.add(box, 0.45 * _musicbox(float(_midi(m)), r), _ns(t0 + j * beat))
        for e in range(6):
            if not (e == 0 or rhythm[(bi % 2) * 6 + e]):
                continue
            if e == 0:
                cands = [i for i, s in enumerate(scale) if (s % 12) in [x % 12 for x in chord]]
                deg = min(cands, key=lambda i: abs(i - deg))
            else:
                deg = int(np.clip(deg + r.choice([-2, -1, -1, 1, 1, 2]), 0, len(scale) - 1))
            c.add(box, _musicbox(float(_midi(scale[deg])), r) * r.uniform(0.75, 1.0), _ns(t0 + e * beat / 2))
        if bi % 2 == 0:
            n_p = _ns(2 * bar + 1.0)
            tp = _tt(n_p)
            env = _smoothstep(tp / 0.6) * _smoothstep((2 * bar + 1.0 - tp) / 1.0)
            for m in (root + 48, root + 55):
                f = float(_midi(m))
                c.add(pad, (np.sin(TAU * f * tp) + 0.1 * np.sin(3 * TAU * f * tp)) * env, _ns(t0 - 0.3))
    tw = c.zeros()
    for p in c.poisson(1.2, "twinkle"):
        n2 = _ns(0.08)
        f = r.uniform(4500.0, 8500.0)
        c.add(tw, np.sin(TAU * f * _tt(n2)) * _decaying(n2, 0.02, 0.001) * r.uniform(0.3, 1.0), p)
    mix = _pkn(box) + 0.06 * _pkn(tw) + 0.12 * _pkn(pad)
    return c.reverb(mix, 2.0, 0.35, damp=1.0, key="hall")


def _amb_hive_drone(c):
    r = c.rng("bees")
    hive = c.zeros()
    for i in range(40):
        base = r.uniform(170.0, 265.0)
        near = c.u(r.uniform(0.04, 0.14), "near", i) ** 2.5
        dop = np.gradient(near) * SR
        dop /= np.max(np.abs(dop)) + 1e-9
        f = base * (1.0 + 0.012 * c.smooth(r.uniform(1.0, 3.0), "jit", i) + 0.03 * dop)
        ph = c.phase(f) + r.random()
        bee = _saw(ph, f) * (0.15 + near) * (1.0 + 0.12 * c.smooth(25.0, "flap", i))
        hive += bee
    hive = c.filt(hive, _rbj("hp", 120.0, 0.7), _rbj("peak", 450.0, 1.0, 6.0), _rbj("lp", 2200.0, 0.7))
    # a few close fly-bys: loudness ~1/distance, exaggerated doppler glide
    fly = c.zeros()
    T = c.t
    for i in range(5):
        tc = (i + r.uniform(0.2, 0.8)) * c.sec / 5
        x = (np.mod(T - tc + c.sec / 2, c.sec) - c.sec / 2) * r.uniform(1.5, 3.0)
        dist = np.sqrt(x * x + r.uniform(0.6, 1.2) ** 2)
        base = r.uniform(190.0, 250.0)
        f = base * (1.0 - 0.05 * x / dist) * (1.0 + 0.01 * c.smooth(3.0, "fj", i))
        ph = c.phase(f)
        fly += (_saw(ph, f) + 0.4 * np.sin(TAU * ph)) / dist ** 1.5 * (1.0 + 0.15 * c.smooth(30.0, "ff", i))
    fly = c.filt(fly, _rbj("hp", 150.0, 0.7), _rbj("peak", 600.0, 1.2, 5.0), _rbj("lp", 3500.0, 0.7))
    hum = c.sine(c.qf(110.0)) + 0.5 * c.sine(c.qf(220.4), 1.0) + 0.25 * c.sine(c.qf(330.0), 2.0)
    hum *= c.u(0.08, "hum", lo=0.5, hi=1.0)
    mix = _rmsn(hive) + 0.25 * _rmsn(hum) + 0.9 * _pkn(fly) * 2.5
    return c.reverb(mix, 1.0, 0.25, damp=0.8)


def _amb_tidal_waves(c):
    r = c.rng("waves")
    L = c.sec
    T = c.t
    periods = np.array((7.4, 8.6, 7.8, 8.2))
    periods *= L / periods.sum()
    crashes = np.concatenate([[0.0], np.cumsum(periods[:-1])]) + 2.0
    low = np.zeros(c.n)
    crash = np.zeros(c.n)
    bright = np.zeros(c.n)
    wash = np.zeros(c.n)
    for tc in crashes:
        a = r.uniform(0.7, 1.0)
        s = np.mod(T - tc + L / 2, L) - L / 2
        low += a * np.where(s < 0, _ex(s / 1.6), _ex(-s / 1.2))
        cr = a * np.where(s < 0, _ex(s / 0.8), _ex(-s / 1.3))
        crash += cr
        bright = np.maximum(bright, cr)
        sw = np.maximum(s - 0.2, 0.0)
        wash += a * np.where(s < 0.2, 0.0, (1.0 - np.exp(-sw / 0.5)) * np.exp(-sw / 2.6))

    def gain(ci, f):
        fc = 450.0 + 2600.0 * bright[ci]
        g2 = (low[ci] ** 2) * _lp(f, 350.0, 2) ** 2
        g2 = g2 + (crash[ci] ** 2) * (_lp(f, fc, 2) * (200.0 / np.maximum(f, 200.0)) ** 0.4) ** 2
        g2 = g2 + (0.6 * wash[ci]) ** 2 * (_hp(f, 1500.0) * _lp(f, 10000.0) * (1500.0 / np.maximum(f, 1500.0)) ** 0.3) ** 2
        g2 = g2 + 0.02 * _lp(f, 500.0, 2) ** 2
        return np.sqrt(g2) * _hp(f, 30.0)

    surf = c.stft(c.white("surf"), gain)
    imp = c.zeros()
    pos = c.poisson(800.0, "fizz", intensity=np.minimum(wash, 1.0))
    np.add.at(imp, pos, c.rng("fz").uniform(-1.0, 1.0, len(pos)))
    fizz = c.filt(imp, _rbj("hp", 2500.0, 0.7), _rbj("lp", 11000.0, 0.7))
    mix = _rmsn(surf) + 0.25 * _rmsn(fizz)
    return c.reverb(mix, 1.2, 0.15, damp=0.8)


def _amb_dark_void(c):
    drone = (c.sine(36.71) + 0.8 * c.sine(36.71 + 0.07, 1.0) + 0.6 * c.sine(55.0, 2.0) + 0.5 * c.sine(55.12, 3.0)
             + 0.25 * c.sine(73.42, 4.0))
    drone = np.tanh(1.4 * drone / np.max(np.abs(drone)) * 1.5) * c.u(0.03, "dam", lo=0.6, hi=1.0)
    sub = c.shape(c.white("sub"), lambda f: _lp(f, 90.0, 3) * _hp(f, 25.0))
    breath = c.shape(c.white("breath"), lambda f: _band(f, 170.0, 0.6)) * (0.5 + 0.5 * c.lfo(4.0 / c.sec)) ** 2
    r = c.rng("ev")
    ev = c.zeros()
    kinds = (0, 1, 2)
    for i, kind in enumerate(kinds):
        start = (i + r.uniform(0.1, 0.5)) * c.sec / len(kinds)
        er = c.rng("e", i)
        if kind == 0:  # distant metallic groan
            n2 = _ns(3.5)
            t2 = _tt(n2)
            bend = 1.0 - 0.04 * _smoothstep(t2 / 3.5)
            g = np.zeros(n2)
            for f, a in ((157.0, 1.0), (241.0, 0.7), (389.0, 0.5), (612.0, 0.3), (877.0, 0.15)):
                g += a * np.sin(TAU * np.cumsum(f * bend * (1 + 0.003 * np.sin(TAU * 3.0 * t2))) / SR)
            g *= np.sin(np.pi * t2 / 3.5) ** 2 * (1.0 + 0.3 * _lowrand(n2, 8.0, er))
            c.add(ev, 0.6 * g, _ns(start))
        elif kind == 1:  # distant boom
            n2 = _ns(2.5)
            b = _filt(er.standard_normal(n2), [_rbj("lp", 140.0, 0.7), _rbj("lp", 200.0, 0.7)]) * _decaying(n2, 0.35, 0.06) * 3.0
            b += _thump(60.0, 34.0, 0.1, 0.6, 2.5, 0.01) * 1.5
            c.add(ev, b, _ns(start))
        else:  # reversed swell / indrawn breath of the void
            n2 = _ns(0.4)
            burst = _filt(er.standard_normal(n2) * _decaying(n2, 0.08, 0.002), [_rbj("bp", 700.0, 0.8)])
            tail = np.convolve(burst, _ir(2.5, ("void", "sw"), 0.6, 0.0))[: _ns(2.8)]
            c.add(ev, 1.5 * _pkn(tail[::-1]), _ns(start))
    ev = c.reverb(ev, 6.0, 0.8, damp=0.5, key="void", dry=0.35)
    mix = _rmsn(drone) + 0.35 * _rmsn(sub) + 0.15 * _rmsn(breath) + 1.0 * _pkn(ev)
    return mix


def _amb_sizzle_toxic(c):
    r = c.rng("ev")
    dens = c.u(0.15, "dens", lo=0.4, hi=1.0)
    bub = c.zeros()
    for p in c.poisson(90.0, "tiny", intensity=dens):
        c.add(bub, _bubble(np.exp(r.uniform(np.log(1500.0), np.log(5000.0))), xi=0.4) * r.uniform(0.1, 0.5), p)
    for p in c.poisson(8.0, "med", intensity=dens):
        c.add(bub, _bubble(np.exp(r.uniform(np.log(450.0), np.log(1400.0))), xi=0.3) * r.uniform(0.4, 1.0), p)
    imp = c.zeros()
    pos = c.poisson(500.0, "fizz", intensity=dens)
    np.add.at(imp, pos, r.uniform(-1.0, 1.0, len(pos)) ** 3)
    fizz = c.filt(imp, _rbj("hp", 4000.0, 0.7), _rbj("lp", 12000.0, 0.7))
    hiss = c.shape(c.white("hiss"), lambda f: _hp(f, 5000.0) * _lp(f, 11000.0)) * dens
    rate = 1.5 + 10.0 * c.u(0.12, "geiger") ** 3
    gpos = c.poisson(14.0, "geig", intensity=rate / 14.0)
    geiger = c.zeros()
    for p in gpos:
        tick = _modal((2700.0 * r.uniform(0.97, 1.03), 4100.0), (0.0015, 0.001), (1.0, 0.5), 0.008)
        tick[:2] += np.array((0.8, -0.5))
        c.add(geiger, tick * r.uniform(0.7, 1.0), p)
    hum = (c.sine(c.qf(70.0) * (1 + 0.003 * c.smooth(0.3, "hw"))) + 0.4 * c.sine(c.qf(140.0), 1.0)) * \
        c.u(0.1, "hum", lo=0.4, hi=1.0)
    blorp = c.zeros()
    for p in c.poisson(0.5, "blorp"):
        c.add(blorp, _bubble(r.uniform(110.0, 210.0), xi=0.6, damp_mul=1.4) * r.uniform(0.6, 1.0), p)
    mix = (0.7 * _pkn(bub) + 0.25 * _pkn(fizz) + 0.04 * _rmsn(hiss) + 0.55 * _pkn(geiger)
           + 0.045 * _rmsn(hum) + 0.5 * _pkn(blorp))
    return c.reverb(mix, 0.6, 0.15, damp=0.9)


# =============================================================================================
# Registry, mastering, encoding
# =============================================================================================
_ONE_SHOTS = (
    ("portal.open", "portal/open", _portal_open, 3, "Portal opens"),
    ("portal.close", "portal/close", _portal_close, 1, "Portal closes"),
    ("portal.travel", "portal/travel", _portal_travel, 1, "Portal whooshes"),
    ("portal.idle", "portal/idle", _portal_idle, 1, "Portal bubbles"),
    ("gun.fire", "gun/fire", _gun_fire, 3, "Portal gun fires"),
    ("gun.empty", "gun/empty", _gun_empty, 1, "Portal gun clicks empty"),
    ("gun.reload", "gun/reload", _gun_reload, 1, "Portal gun refills"),
    ("gun.dial", "gun/dial", _gun_dial, 2, "Portal gun dial clicks"),
    ("orb.shoot", "orb/shoot", _orb_shoot, 1, "Energy orb fired"),
    ("orb.hit", "orb/hit", _orb_hit, 1, "Energy orb bursts"),
    ("dimension.arrive", "dimension/arrive", _dimension_arrive, 1, "Dimension shimmers"),
)

# name, seconds, generator, subtitle
_AMBIENT = (
    ("wind_howl", 30.0, _amb_wind_howl, "Wind howls"),
    ("alien_hum", 28.0, _amb_alien_hum, "Alien hum drones"),
    ("bubbling", 26.0, _amb_bubbling, "Liquid bubbles"),
    ("crystal_chimes", 30.0, _amb_crystal_chimes, "Crystals chime"),
    ("wet_squelch", 30.0, _amb_wet_squelch, "Something squelches"),
    ("electric_buzz", 30.0, _amb_electric_buzz, "Static crackles"),
    ("deep_ocean", 36.0, _amb_deep_ocean, "Deep water moans"),
    ("volcanic_rumble", 30.0, _amb_volcanic_rumble, "Ground rumbles"),
    ("eerie_choir", 32.0, _amb_eerie_choir, "Ghostly voices sing"),
    ("jungle_night", 28.0, _amb_jungle_night, "Night critters chirp"),
    ("neon_synth", 24.0, _amb_neon_synth, "Synth music hums"),
    ("glitch_noise", 28.0, _amb_glitch_noise, "Reality glitches"),
    ("cosmic_drone", 36.0, _amb_cosmic_drone, "Cosmic drone swells"),
    ("cozy_breeze", 30.0, _amb_cozy_breeze, "Breeze rustles"),
    ("clockwork", 24.0, _amb_clockwork, "Gears tick"),
    ("candy_chime", 28.8, _amb_candy_chime, "Music box twinkles"),
    ("hive_drone", 26.0, _amb_hive_drone, "Swarm buzzes"),
    ("tidal_waves", 32.0, _amb_tidal_waves, "Waves wash ashore"),
    ("dark_void", 36.0, _amb_dark_void, "The void rumbles"),
    ("sizzle_toxic", 24.0, _amb_sizzle_toxic, "Acid sizzles"),
)

AMBIENT_NAMES = [a[0] for a in _AMBIENT]
AMBIENT_LOOPS = ["ambient." + a for a in AMBIENT_NAMES]
SUBTITLES = {}
for _ev, _p, _fn, _cnt, _sub in _ONE_SHOTS:
    SUBTITLES[f"subtitles.{NAMESPACE}.{_ev}"] = _sub
for _name, _sec, _fn, _sub in _AMBIENT:
    SUBTITLES[f"subtitles.{NAMESPACE}.ambient.{_name}"] = _sub

ONESHOT_PEAK_DB = -1.0
LOOP_PEAK_DB = -6.0
LOOP_TARGET_LUFS = -24.0


def _bs1770_mag(N):
    return np.abs(_freqz([_rbj("hs", 1500.0, 1.0 / np.sqrt(2.0), 4.0), _rbj("hp", 38.0, 0.5)], N))


def lufs(x):
    """Approximate integrated loudness (ITU-R BS.1770 K-weighting + gating) of a mono signal."""
    n = len(x)
    y = np.fft.irfft(np.fft.rfft(x) * _bs1770_mag(n), n)
    blk, hop = _ns(0.4), _ns(0.1)
    if n < blk:
        ms = np.array([np.mean(y * y)])
    else:
        cs = np.concatenate([[0.0], np.cumsum(y * y)])
        st = np.arange(0, n - blk + 1, hop)
        ms = (cs[st + blk] - cs[st]) / blk
    lk = -0.691 + 10 * np.log10(ms + 1e-20)
    ms = ms[lk > -70.0]
    if len(ms) == 0:
        return -70.0
    rel = -0.691 + 10 * np.log10(ms.mean()) - 10.0
    ms2 = ms[-0.691 + 10 * np.log10(ms) > rel]
    return float(-0.691 + 10 * np.log10(ms2.mean()))


def _master_oneshot(x):
    x = _filt(x, [_rbj("hp", 25.0, 0.7)])
    x = _fade(x, 0.001, min(0.03, len(x) / SR * 0.2))
    return x * (_db(ONESHOT_PEAK_DB) / np.max(np.abs(x)))


def _soft_limit(x, ceiling, knee=0.7):
    """Memoryless soft knee: untouched below knee*ceiling, approaches ceiling smoothly above it."""
    th = knee * ceiling
    h = ceiling - th
    a = np.abs(x)
    over = np.maximum(a - th, 0.0)
    return np.sign(x) * (np.minimum(a, th) + h * np.tanh(over / h))


def _master_loop(x, max_squash_db=5.0):
    """DC/rumble cleanup, loudness to ~LOOP_TARGET_LUFS with peaks held at LOOP_PEAK_DB.
    Rare peaks (thunder, ticks) are soft-limited by at most max_squash_db instead of turning the
    whole loop down. Everything is memoryless or circular, so the loop stays seamless."""
    x = x - np.mean(x)
    x = _filt(x, [_rbj("hp", 25.0, 0.7)], circular=True)
    ceiling = _db(LOOP_PEAK_DB)
    g = _db(LOOP_TARGET_LUFS - lufs(x))
    g = min(g, ceiling * _db(max_squash_db) / np.max(np.abs(x)))
    y = _soft_limit(x * g, ceiling)
    # limiting lowers loudness slightly; one correction pass (never above the ceiling)
    g2 = min(_db(LOOP_TARGET_LUFS - lufs(y)), ceiling / np.max(np.abs(y)))
    return y * min(g2, 1.0) if g2 < 1.0 else y


def _variants():
    """[(event, relpath, thunk, is_loop)] in a stable order."""
    out = []
    for ev, base, fn, cnt, _sub in _ONE_SHOTS:
        for i in range(cnt):
            rel = f"{base}{i + 1}" if cnt > 1 else base
            out.append((ev, rel, (lambda fn=fn, i=i: _master_oneshot(fn(i))), False))
    for name, sec, fn, _sub in _AMBIENT:
        out.append(("ambient." + name, "ambient/" + name,
                    (lambda fn=fn, name=name, sec=sec: _master_loop(fn(_Ctx("amb_" + name, sec, loop=True)))), True))
    return out


def render(relpath):
    """Render one sound (e.g. "portal/open1" or "ambient/wind_howl") to a float array in [-1, 1]."""
    for _ev, rel, thunk, _loop in _variants():
        if rel == relpath:
            return thunk()
    raise KeyError(relpath)


def encode_ogg(x, path):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    data = np.clip(x, -1.0, 1.0).astype("<f4").tobytes()
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "1",
           "-i", "pipe:0", "-map_metadata", "-1", "-fflags", "+bitexact", "-flags:a", "+bitexact",
           "-c:a", "libvorbis", "-q:a", "4", path]
    subprocess.run(cmd, input=data, check=True)


def write_all(sounds_root):
    """Synthesize every sound into sounds_root (.../assets/portalgun/sounds) and return sounds.json."""
    table = {}
    for ev, rel, thunk, loop in _variants():
        x = thunk()
        encode_ogg(x, os.path.join(sounds_root, rel + ".ogg"))
        entry = table.setdefault(ev, {"sounds": [], "subtitle": f"subtitles.{NAMESPACE}.{ev}"})
        ref = f"{NAMESPACE}:{rel}"
        entry["sounds"].append({"name": ref, "stream": True} if loop else ref)
    return table
