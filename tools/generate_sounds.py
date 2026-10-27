#!/usr/bin/env python3
"""Procedurally synthesizes RealWeather's ambience and thunder.

Requires numpy and an ffmpeg build with libvorbis. Run from the repository root:

    python3 tools/generate_sounds.py

Ambient loops are synthesized circularly (STFT frames and sound grains wrap around the end), so every loop is
perfectly seamless. Thunder clips are mono so Minecraft can pan them towards the lightning.
"""

import os
import subprocess
import sys
import tempfile
import wave

import numpy as np

SR = 44100
OUT = os.path.join("src", "client", "resources", "assets", "realweather", "sounds")
N_FFT = 2048
HOP = 512


# ---------------------------------------------------------------------------------------------------------------
# Building blocks
# ---------------------------------------------------------------------------------------------------------------

def periodic_noise(rng, n, period_samples, octaves=3, smooth=4):
    """Smooth random curve in [-1, 1] that loops exactly over n samples."""
    t = np.arange(n) / n
    curve = np.zeros(n)
    amplitude = 1.0
    total = 0.0
    for octave in range(octaves):
        cycles = max(1, int(round(n / period_samples * (2 ** octave))))
        harmonics = rng.normal(size=(smooth, 2))
        part = np.zeros(n)
        for k in range(smooth):
            freq = cycles * (k + 1)
            part += (harmonics[k, 0] * np.sin(2 * np.pi * freq * t) + harmonics[k, 1] * np.cos(2 * np.pi * freq * t)) / (k + 1)
        part /= np.max(np.abs(part)) + 1e-9
        curve += amplitude * part
        total += amplitude
        amplitude *= 0.5
    return curve / total


def stft_noise(rng, n, magnitude_fn, channels=2, correlation=0.35, circular=True):
    """Noise whose spectrum over time follows magnitude_fn(frame_times, freqs) -> (frames, bins).

    Frames are overlap-added with a Hann window; with circular=True the last frames wrap onto the start, which makes
    the result loop seamlessly.
    """
    frames = n // HOP if circular else n // HOP + 1
    freqs = np.fft.rfftfreq(N_FFT, 1.0 / SR)
    times = (np.arange(frames) * HOP) / SR
    magnitude = magnitude_fn(times, freqs)
    window = np.hanning(N_FFT)
    shared = rng.uniform(0, 2 * np.pi, size=magnitude.shape)
    out = np.zeros((channels, n + (0 if circular else N_FFT)))
    for c in range(channels):
        own = rng.uniform(0, 2 * np.pi, size=magnitude.shape)
        # Partially shared phases give a wide but coherent stereo image.
        phase = np.where(rng.uniform(size=magnitude.shape) < correlation, shared, own)
        spectra = magnitude * np.exp(1j * phase)
        blocks = np.fft.irfft(spectra, n=N_FFT, axis=1) * window
        for f in range(frames):
            start = f * HOP
            end = start + N_FFT
            if circular and end > n:
                np.add.at(out[c], np.arange(start, end) % n, blocks[f])
            else:
                out[c, start:end] += blocks[f]
    return out[:, :n] / 2.0


def band(freqs, center, octaves):
    """Log-gaussian band in frequency."""
    f = np.maximum(freqs, 1.0)
    return np.exp(-0.5 * (np.log2(f / center) / octaves) ** 2)


def lowpass(freqs, cutoff, order=2):
    return 1.0 / np.sqrt(1.0 + (np.maximum(freqs, 0.0) / cutoff) ** (2 * order))


def highpass(freqs, cutoff, order=2):
    f = np.maximum(freqs, 1e-3)
    return 1.0 / np.sqrt(1.0 + (cutoff / f) ** (2 * order))


def pink(freqs, reference=1000.0):
    return np.sqrt(reference / np.maximum(freqs, 20.0))


def add_grain(buffer, position, grain, gains):
    n = buffer.shape[1]
    length = grain.shape[0]
    idx = (np.arange(length) + position) % n
    for c in range(buffer.shape[0]):
        np.add.at(buffer[c], idx, grain * gains[c])


def drop_grain(rng, freq, decay, noise=0.3, chirp=0.0):
    length = int(decay * 7 * SR) + 8
    t = np.arange(length) / SR
    envelope = np.exp(-t / decay)
    envelope[:4] *= np.linspace(0.0, 1.0, 4)
    phase = 2 * np.pi * (freq * t + 0.5 * chirp * freq * t * t / max(decay * 7, 1e-3))
    tone = np.sin(phase)
    hiss = rng.normal(size=length) * np.exp(-t / (decay * 0.35))
    return (tone * (1.0 - noise) + hiss * noise) * envelope


def scatter_drops(rng, buffer, rate, freq_range, decay_range, amplitude_sigma=0.6, noise=0.3, chirp=0.0, gain=1.0, pan_width=0.9):
    n = buffer.shape[1]
    count = rng.poisson(rate * n / SR)
    positions = rng.integers(0, n, size=count)
    for pos in positions:
        freq = np.exp(rng.uniform(np.log(freq_range[0]), np.log(freq_range[1])))
        decay = rng.uniform(*decay_range)
        amp = gain * np.exp(rng.normal(0.0, amplitude_sigma)) * 0.1
        pan = rng.uniform(-pan_width, pan_width)
        gains = (amp * np.sqrt(0.5 * (1 - pan)), amp * np.sqrt(0.5 * (1 + pan)))
        add_grain(buffer, pos, drop_grain(rng, freq, decay, noise, chirp * rng.uniform(0.5, 1.5)), gains)


def normalize(signal, rms_db=None, peak_db=-3.0):
    peak = np.max(np.abs(signal)) + 1e-9
    if rms_db is not None:
        rms = np.sqrt(np.mean(signal ** 2)) + 1e-9
        signal = signal * (10 ** (rms_db / 20.0) / rms)
        peak = np.max(np.abs(signal))
        limit = 10 ** (peak_db / 20.0)
        if peak > limit:
            # Soft limiter for the rare drop peaks.
            signal = np.tanh(signal / limit) * limit
        return signal
    return signal * (10 ** (peak_db / 20.0) / peak)


def fade(signal, fade_in=0.0, fade_out=0.0):
    n = signal.shape[-1]
    if fade_in > 0:
        k = int(fade_in * SR)
        signal[..., :k] *= np.linspace(0, 1, k) ** 2
    if fade_out > 0:
        k = int(fade_out * SR)
        signal[..., n - k:] *= np.linspace(1, 0, k) ** 2
    return signal


def write_ogg(name, signal, quality=4):
    path = os.path.join(OUT, name + ".ogg")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    data = np.clip(signal, -1.0, 1.0)
    if data.ndim == 1:
        data = data[None, :]
    pcm = (data.T * 32767.0).astype("<i2")
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        wav_path = tmp.name
    with wave.open(wav_path, "wb") as w:
        w.setnchannels(data.shape[0])
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav_path, "-c:a", "libvorbis", "-q:a", str(quality), "-map_metadata", "-1", path],
                   check=True)
    os.unlink(wav_path)
    print(f"  {path}  ({os.path.getsize(path) // 1024} KiB)")


# ---------------------------------------------------------------------------------------------------------------
# Ambience
# ---------------------------------------------------------------------------------------------------------------

def rain_light(rng):
    n = 20 * SR
    mod = periodic_noise(rng, n, 5 * SR)

    def spectrum(times, freqs):
        frame_mod = np.interp(times * SR, np.arange(n), mod)
        base = (0.5 * band(freqs, 3800, 1.3) + 0.25 * band(freqs, 9000, 0.8) + 0.08 * pink(freqs)) * highpass(freqs, 350)
        return np.outer(0.85 + 0.15 * frame_mod, base)

    out = stft_noise(rng, n, spectrum) * 0.6
    scatter_drops(rng, out, 170, (2200, 9500), (0.0006, 0.0022), noise=0.45, gain=0.55)
    scatter_drops(rng, out, 18, (700, 2200), (0.003, 0.010), noise=0.15, chirp=-0.3, gain=0.6)
    return normalize(out, rms_db=-21)


def rain_heavy(rng):
    n = 20 * SR
    gust = periodic_noise(rng, n, 6 * SR)

    def spectrum(times, freqs):
        g = np.interp(times * SR, np.arange(n), gust)
        base = (0.55 * band(freqs, 1400, 1.8) + 0.35 * band(freqs, 5200, 1.2) + 0.25 * pink(freqs, 600)) * lowpass(freqs, 12000, 3) * highpass(freqs, 70)
        rumble = 0.25 * band(freqs, 110, 0.8)
        return np.outer(0.8 + 0.2 * g, base) + np.outer(0.9 + 0.1 * g, rumble)

    out = stft_noise(rng, n, spectrum, correlation=0.2)
    scatter_drops(rng, out, 1400, (1800, 9000), (0.0005, 0.0018), noise=0.5, gain=0.25)
    scatter_drops(rng, out, 70, (500, 1800), (0.003, 0.012), noise=0.2, chirp=-0.3, gain=0.4)
    return normalize(out, rms_db=-17)


def rain_indoor(rng):
    n = 20 * SR
    gust = periodic_noise(rng, n, 7 * SR)

    def spectrum(times, freqs):
        g = np.interp(times * SR, np.arange(n), gust)
        base = (0.6 * band(freqs, 420, 1.3) + 0.3 * band(freqs, 1100, 0.9)) * lowpass(freqs, 1600, 3) * highpass(freqs, 60)
        return np.outer(0.82 + 0.18 * g, base)

    out = stft_noise(rng, n, spectrum, correlation=0.6) * 0.7
    # Drumming on the roof: dull, resonant thuds.
    scatter_drops(rng, out, 380, (140, 650), (0.005, 0.022), noise=0.25, gain=0.5, pan_width=0.7)
    # A gutter dripping somewhere.
    drip_positions = np.cumsum(rng.uniform(0.25, 0.9, size=60) * SR).astype(int)
    for pos in drip_positions[drip_positions < n]:
        grain = drop_grain(rng, rng.uniform(750, 1300), rng.uniform(0.02, 0.04), noise=0.05, chirp=0.6)
        pan = 0.55
        add_grain(out, int(pos), grain * 0.03, (np.sqrt(0.5 * (1 - pan)), np.sqrt(0.5 * (1 + pan))))
    return normalize(out, rms_db=-19)


def wind_light(rng):
    n = 30 * SR
    sweep = periodic_noise(rng, n, 9 * SR)
    gust = periodic_noise(rng, n, 6 * SR)
    leaves = periodic_noise(rng, n, 1.7 * SR, octaves=4, smooth=6)

    def spectrum(times, freqs):
        s = np.interp(times * SR, np.arange(n), sweep)
        g = np.interp(times * SR, np.arange(n), gust)
        lv = np.interp(times * SR, np.arange(n), leaves)
        center = 380.0 * 2 ** (0.9 * s)
        amp = 0.45 + 0.4 * (0.5 + 0.5 * g) ** 1.5
        rows = []
        for c, a, gg, ll in zip(center, amp, g, lv):
            body = band(freqs, c, 1.1) + 0.35 * band(freqs, c * 2.6, 0.9)
            rustle = 0.05 * (0.6 + 0.4 * gg) * (0.5 + 0.5 * ll) * band(freqs, 4200, 1.1)
            rows.append(a * (body * highpass(freqs, 70) + rustle))
        return np.array(rows)

    out = stft_noise(rng, n, spectrum, correlation=0.25)
    return normalize(out, rms_db=-22)


def wind_strong(rng):
    n = 30 * SR
    gust = periodic_noise(rng, n, 5 * SR)
    whistle_a = periodic_noise(rng, n, 7 * SR)
    whistle_b = periodic_noise(rng, n, 11 * SR)

    def spectrum(times, freqs):
        g = np.interp(times * SR, np.arange(n), gust)
        wa = np.interp(times * SR, np.arange(n), whistle_a)
        wb = np.interp(times * SR, np.arange(n), whistle_b)
        rows = []
        for gg, a, b in zip(g, wa, wb):
            strength = 0.5 + 0.5 * (0.5 + 0.5 * gg) ** 1.3
            body = (0.8 * band(freqs, 260, 1.6) + 0.45 * band(freqs, 900, 1.3)) * highpass(freqs, 35)
            rumble = 0.35 * band(freqs, 60, 0.7)
            whistle = 0.22 * max(0.0, gg + 0.2) * (band(freqs, 720 * 2 ** (0.5 * a), 0.07) + 0.6 * band(freqs, 1350 * 2 ** (0.4 * b), 0.06))
            hiss = 0.1 * strength * band(freqs, 3500, 1.0)
            rows.append(strength * (body + rumble + hiss) + whistle)
        return np.array(rows)

    out = stft_noise(rng, n, spectrum, correlation=0.3)
    return normalize(out, rms_db=-18)


def blizzard(rng):
    n = 30 * SR
    gust = periodic_noise(rng, n, 4 * SR)
    howls = [periodic_noise(rng, n, p * SR) for p in (8, 13, 17)]

    def spectrum(times, freqs):
        g = np.interp(times * SR, np.arange(n), gust)
        hs = [np.interp(times * SR, np.arange(n), h) for h in howls]
        rows = []
        for i, gg in enumerate(g):
            strength = 0.55 + 0.45 * (0.5 + 0.5 * gg)
            body = (0.7 * band(freqs, 300, 1.5) + 0.3 * band(freqs, 1100, 1.2)) * highpass(freqs, 30)
            howl = 0.0
            for k, (base_freq, q) in enumerate(((330, 0.05), (520, 0.045), (760, 0.04))):
                howl = howl + (0.3 - 0.06 * k) * max(0.0, 0.3 + hs[k][i]) * band(freqs, base_freq * 2 ** (0.35 * hs[k][i]), q)
            snow_hiss = 0.22 * strength ** 2 * band(freqs, 6500, 0.9)
            rumble = 0.3 * band(freqs, 55, 0.8)
            rows.append(strength * (body + rumble) + howl * strength + snow_hiss)
        return np.array(rows)

    out = stft_noise(rng, n, spectrum, correlation=0.3)
    return normalize(out, rms_db=-17)


# ---------------------------------------------------------------------------------------------------------------
# Thunder
# ---------------------------------------------------------------------------------------------------------------

def rolling_envelope(rng, times, onset, peaks, rise, decay, duration):
    env = np.zeros_like(times)
    t = onset
    amplitude = 1.0
    for _ in range(peaks):
        r = rng.uniform(*rise)
        d = rng.uniform(*decay)
        shape = np.where(times < t, np.exp(-((t - times) / r) ** 2 * 4.0), np.exp(-(times - t) / d))
        env = np.maximum(env, amplitude * shape) + 0.25 * amplitude * shape
        t += rng.uniform(0.35, 1.3) * (1.0 + 0.4 * (t / duration))
        amplitude *= rng.uniform(0.55, 0.9)
    tail = np.clip(1.0 - (times - duration * 0.75) / (duration * 0.25), 0.0, 1.0)
    return env * tail


def thunder(rng, kind, duration):
    n = int(duration * SR)
    if kind == "near":
        onset, peaks, rise, decay = 0.03, 7, (0.03, 0.12), (0.35, 1.1)
        cutoff_start, cutoff_end = 3200.0, 260.0
    elif kind == "far":
        onset, peaks, rise, decay = 0.35, 6, (0.18, 0.45), (0.6, 1.6)
        cutoff_start, cutoff_end = 900.0, 180.0
    else:
        onset, peaks, rise, decay = 0.6, 5, (0.35, 0.8), (0.9, 2.2)
        cutoff_start, cutoff_end = 320.0, 110.0

    def spectrum(times, freqs):
        env = rolling_envelope(rng, times, onset, peaks, rise, decay, duration)
        cutoff = cutoff_end + (cutoff_start - cutoff_end) * np.exp(-times / (duration * 0.18))
        rows = []
        for e, c in zip(env, cutoff):
            body = (pink(freqs, 120) ** 1.6) * lowpass(freqs, c, 2) * highpass(freqs, 22, 2)
            boom = 1.4 * band(freqs, 55, 0.7)
            rows.append(e * (body + boom))
        return np.array(rows)

    out = stft_noise(rng, n, spectrum, channels=1, circular=False)[0]

    if kind == "near":
        # The crack: a violent broadband burst followed by a dense crackle of tearing air.
        t = np.arange(n) / SR
        crack = rng.normal(size=n) * np.exp(-t / 0.018) * 2.4
        crack[: int(0.002 * SR)] *= np.linspace(0, 1, int(0.002 * SR))
        buffer = np.zeros((1, n))
        positions = np.sort(rng.exponential(0.09, size=140))
        for p in positions[positions < 0.9]:
            length = int(rng.uniform(0.0008, 0.004) * SR)
            click = rng.normal(size=length) * np.exp(-np.arange(length) / (length * 0.3))
            amp = 0.9 * np.exp(-p / 0.25) * rng.uniform(0.3, 1.0)
            add_grain(buffer, int((p + 0.01) * SR), click, (amp,))
        rumble = out / (np.max(np.abs(out)) + 1e-9) * 0.8
        tear = crack + buffer[0] * 1.2
        tear = tear / (np.max(np.abs(tear)) + 1e-9) * 0.75
        out = np.tanh((rumble + tear) * 1.2)
    out = fade(out, fade_in=0.004, fade_out=0.6)
    return normalize(out, peak_db=-0.8)


def main():
    if not os.path.isdir("src"):
        sys.exit("Run from the repository root")
    rng = np.random.default_rng(20251209)
    print("Ambience:")
    write_ogg("ambient/rain_light", rain_light(rng))
    write_ogg("ambient/rain_heavy", rain_heavy(rng))
    write_ogg("ambient/rain_indoor", rain_indoor(rng))
    write_ogg("ambient/wind_light", wind_light(rng))
    write_ogg("ambient/wind_strong", wind_strong(rng))
    write_ogg("ambient/blizzard", blizzard(rng))
    print("Thunder:")
    for i in range(3):
        write_ogg(f"thunder/near_{i + 1}", thunder(rng, "near", 9.0 + i), quality=5)
    for i in range(3):
        write_ogg(f"thunder/far_{i + 1}", thunder(rng, "far", 10.0 + i), quality=4)
    for i in range(2):
        write_ogg(f"thunder/distant_{i + 1}", thunder(rng, "distant", 9.0 + i * 1.5), quality=3)


if __name__ == "__main__":
    main()
