"""Shared audio helpers (decode via ffmpeg, analysis, segmentation, processing).

Only trusted code lives here; source audio files are passed in as paths and
decoded by ffmpeg into numpy arrays.
"""
import json
import subprocess

import numpy as np

SR = 44100


def probe(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", path],
                         check=True, capture_output=True).stdout
    j = json.loads(out)
    st = [s for s in j.get("streams", []) if s.get("codec_type") == "audio"][0]
    return {"codec": st.get("codec_name"), "sr": int(st.get("sample_rate", 0)), "ch": int(st.get("channels", 0)),
            "fmt": st.get("sample_fmt"), "bits": st.get("bits_per_raw_sample") or st.get("bits_per_sample"),
            "dur": float(j["format"].get("duration", 0) or 0)}


def decode(path, sr=SR, mono=False, channel=None, hq=False):
    """Decode any file to float64 numpy (frames, ch) at `sr`.

    mono=True: average channels (after decode, in numpy, so we control it).
    channel=k: take only channel k.
    hq=True: resample with soxr (used for the final build; analysis uses ffmpeg's default).
    """
    info = probe(path)
    ch = info["ch"]
    cmd = ["ffmpeg", "-v", "error", "-nostdin", "-i", path]
    if hq and info["sr"] != sr:
        cmd += ["-af", f"aresample={sr}:resampler=soxr:precision=28"]
    cmd += ["-f", "f32le", "-acodec", "pcm_f32le", "-ar", str(sr), "-"]
    raw = subprocess.run(cmd, check=True, capture_output=True).stdout
    x = np.frombuffer(raw, dtype=np.float32).reshape(-1, ch).astype(np.float64)
    if channel is not None:
        return x[:, channel]
    if mono:
        return x.mean(axis=1)
    return x


def db(x, floor=-120.0):
    return np.maximum(20 * np.log10(np.maximum(np.abs(x), 1e-12)), floor)


def envelope(x, sr=SR, win_ms=10.0, hop_ms=2.5):
    """Frame RMS envelope (linear) and hop size in samples."""
    win = max(1, int(sr * win_ms / 1000))
    hop = max(1, int(sr * hop_ms / 1000))
    if len(x) < win:
        x = np.pad(x, (0, win - len(x)))
    n = 1 + (len(x) - win) // hop
    idx = np.arange(win)[None, :] + hop * np.arange(n)[:, None]
    frames = x[idx]
    return np.sqrt(np.mean(frames ** 2, axis=1) + 1e-20), hop


def noise_floor_db(env):
    e = db(env)
    return float(np.percentile(e, 5))


def spectral_stats(x, sr=SR):
    """Energy-weighted spectral centroid and low-band (<250 Hz) energy ratio."""
    if len(x) < 512:
        x = np.pad(x, (0, 512 - len(x)))
    n = 2048
    hop = 512
    w = np.hanning(n)
    if len(x) < n:
        x = np.pad(x, (0, n - len(x)))
    frames = np.lib.stride_tricks.sliding_window_view(x, n)[::hop] * w
    spec = np.abs(np.fft.rfft(frames, axis=1)) ** 2
    freqs = np.fft.rfftfreq(n, 1 / sr)
    tot = spec.sum()
    if tot <= 0:
        return 0.0, 0.0, 0.0
    cent = float((spec.sum(axis=0) * freqs).sum() / tot)
    low = float(spec[:, freqs < 250].sum() / tot)
    high = float(spec[:, freqs > 5000].sum() / tot)
    return cent, low, high


def segments(x, sr=SR, thresh_rel_db=-40.0, floor_margin_db=12.0, min_gap_ms=120.0, min_len_ms=80.0,
             pre_ms=5.0, tail_rel_db=-50.0):
    """Energy-based silence detector. Returns list of (start, end) sample indices.

    A frame is 'active' if its RMS is above max(peak+thresh_rel_db, floor+floor_margin_db).
    Gaps shorter than min_gap_ms are bridged; segments shorter than min_len_ms dropped.
    Each segment is extended backwards by pre_ms and forwards while the envelope
    stays above max(peak+tail_rel_db, floor+6dB) so natural decays are kept.
    """
    env, hop = envelope(x, sr)
    e = db(env)
    peak = e.max()
    floor = noise_floor_db(env)
    thr = max(peak + thresh_rel_db, floor + floor_margin_db)
    tail_thr = max(peak + tail_rel_db, floor + 6.0)
    act = e > thr
    segs = []
    i = 0
    n = len(act)
    while i < n:
        if act[i]:
            j = i
            while j < n and act[j]:
                j += 1
            segs.append([i, j])
            i = j
        else:
            i += 1
    gap = int(min_gap_ms / 1000 * sr / hop)
    merged = []
    for s in segs:
        if merged and s[0] - merged[-1][1] <= gap:
            merged[-1][1] = s[1]
        else:
            merged.append(s)
    out = []
    for k, (a, b) in enumerate(merged):
        # extend tail while above tail threshold, but not into the next segment
        limit = merged[k + 1][0] if k + 1 < len(merged) else n
        while b < limit and e[b] > tail_thr:
            b += 1
        sa = max(0, a * hop - int(pre_ms / 1000 * sr))
        sb = min(len(x), b * hop + int(0.010 * sr))
        if (sb - sa) / sr * 1000 >= min_len_ms:
            out.append((sa, sb))
    return out


def analyze(x, sr=SR):
    env, hop = envelope(x, sr)
    e = db(env)
    pk = float(np.max(np.abs(x))) if len(x) else 0.0
    ipk = int(np.argmax(e))
    floor = noise_floor_db(env)
    thr = max(e.max() - 40, floor + 10)
    act = np.where(e > thr)[0]
    on = int(act[0]) if len(act) else 0
    off = int(act[-1]) if len(act) else len(e) - 1
    # decay: time from envelope peak until it first drops 30 dB below peak (or to end)
    after = np.where(e[ipk:] < e.max() - 30)[0]
    dec = (after[0] if len(after) else len(e) - ipk) * hop / sr
    seg = x[on * hop: off * hop + hop]
    cent, low, high = spectral_stats(seg if len(seg) > 0 else x, sr)
    # rise time on a 1 ms peak envelope: first crossing of peak-20 dB -> first crossing of peak-3 dB
    h1 = max(1, sr // 1000)
    n1 = len(x) // h1
    rise = 0.0
    if n1 > 0:
        p1 = db(np.abs(x[: n1 * h1]).reshape(n1, h1).max(axis=1))
        p1 -= p1.max()
        a20 = int(np.argmax(p1 > -20))
        a3 = int(np.argmax(p1 > -3))
        rise = max(0, a3 - a20) * h1 / sr * 1000
    return {
        "dur": len(x) / sr,
        "peak_db": float(db(pk)),
        "rms_db": float(db(np.sqrt(np.mean(x ** 2)) if len(x) else 0)),
        "floor_db": floor,
        "lead_ms": on * hop / sr * 1000,
        "active": (off - on) * hop / sr,
        "attack_ms": max(0, ipk - on) * hop / sr * 1000,
        "rise_ms": rise,
        "decay30": dec,
        "cent": cent,
        "low": low,
        "high": high,
        "crest_db": float(db(pk) - db(np.sqrt(np.mean(x ** 2)) + 1e-12)),
    }


def clip_fraction(xmc):
    """Fraction of samples at (near) full scale across all channels, and longest run."""
    a = np.abs(xmc) >= 0.995
    frac = float(a.mean())
    # longest run of consecutive clipped samples in any channel
    run = 0
    for c in range(a.shape[1]):
        col = a[:, c].astype(np.int8)
        if col.any():
            d = np.diff(np.concatenate([[0], col, [0]]))
            st = np.where(d == 1)[0]
            en = np.where(d == -1)[0]
            run = max(run, int((en - st).max()))
    return frac, run


def pitch_track(x, sr=SR, fmin=60.0, fmax=700.0, frame_ms=40.0, hop_ms=10.0, thresh=0.15):
    """Small YIN-style F0 tracker (cumulative mean normalized difference).

    Returns F0 (Hz) for frames that are loud (within 30 dB of the loudest
    frame) and clearly periodic.
    """
    n = int(sr * frame_ms / 1000)
    hop = int(sr * hop_ms / 1000)
    if len(x) < 2 * n:
        return np.array([])
    env, _ = envelope(x, sr)
    gate = db(env).max() - 30
    tmin, tmax = int(sr / fmax), min(n - 1, int(sr / fmin))
    out = []
    for i in range(0, len(x) - 2 * n, hop):
        fr = x[i:i + 2 * n]
        if 20 * np.log10(np.sqrt(np.mean(fr[:n] ** 2)) + 1e-12) < gate:
            continue
        # difference function via FFT-based autocorrelation
        w = fr
        energy = np.concatenate([[0.0], np.cumsum(w ** 2)])
        ac = np.fft.irfft(np.fft.rfft(w, 4 * n) * np.conj(np.fft.rfft(w[:n], 4 * n)))[: n]
        taus = np.arange(n)
        e0 = energy[n] - energy[0]
        et = energy[taus + n] - energy[taus]
        d = e0 + et - 2 * ac
        d[0] = 0
        cm = np.cumsum(d[1:]) / np.arange(1, n)
        dn = np.ones(n)
        dn[1:] = d[1:] / np.maximum(cm, 1e-12)
        cand = np.where(dn[tmin:tmax] < thresh)[0]
        if len(cand) == 0:
            continue
        k = tmin + cand[0]
        while k + 1 < tmax and dn[k + 1] < dn[k]:
            k += 1
        out.append(sr / k)
    return np.array(out)
