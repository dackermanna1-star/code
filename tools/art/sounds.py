"""Synthesised sound effects for LaptopCraft (numpy additive/FM synthesis -> mono OGG Vorbis via ffmpeg).

Writes assets/laptopcraft/sounds/**.ogg, assets/laptopcraft/sounds.json and the English subtitles in
assets/laptopcraft/lang/parts/art.json.  Every sound is mono (so it is positional in game), 44.1 kHz,
peak-normalised (UI sounds quieter) and checked for clipping / DC offset.

Run: python3 tools/art/sounds.py
"""
from __future__ import annotations

import json
import os
import subprocess
import tempfile
import wave

import numpy as np

from lib import ASSETS, write_json

SR = 44100
RNG = np.random.default_rng(1234)


# --------------------------------------------------------------------------------------------------
# building blocks
# --------------------------------------------------------------------------------------------------

def t_axis(dur):
	return np.arange(int(dur * SR)) / SR


def silence(dur):
	return np.zeros(int(dur * SR))


def place(buf, sig, at):
	i = int(at * SR)
	n = min(len(sig), len(buf) - i)
	if n > 0:
		buf[i:i + n] += sig[:n]
	return buf


def adsr(n, a, d, s, r, sustain_time=None):
	"""Piecewise envelope (seconds); sustain fills the remainder before release."""
	A, D, R = int(a * SR), int(d * SR), int(r * SR)
	S = max(0, n - A - D - R) if sustain_time is None else int(sustain_time * SR)
	env = np.concatenate([
		np.linspace(0, 1, max(A, 1), endpoint=False) ** 1.5,
		1 - (1 - s) * (1 - np.exp(-5 * np.linspace(0, 1, max(D, 1)))) / (1 - np.exp(-5)),
		np.full(S, s),
		s * np.exp(-5 * np.linspace(0, 1, max(R, 1))),
	])
	out = np.zeros(n)
	out[:min(n, len(env))] = env[:n]
	return out


def exp_env(n, tau, attack=0.002):
	t = np.arange(n) / SR
	env = np.exp(-t / tau)
	A = max(1, int(attack * SR))
	env[:A] *= np.linspace(0, 1, A)
	return env


def osc(freq, dur, phase=0.0):
	"""Sine oscillator; freq may be a scalar or an array (per-sample frequency)."""
	n = int(dur * SR)
	f = np.broadcast_to(np.asarray(freq, dtype=np.float64), (n,))
	ph = 2 * np.pi * np.cumsum(f) / SR + phase
	return np.sin(ph)


def bell(freq, dur, partials=((1, 1.0, 1.0), (2.0, 0.35, 0.6), (3.0, 0.18, 0.45), (4.2, 0.08, 0.3)), tau=0.5, attack=0.003):
	"""Additive bell: (ratio, amplitude, decay-scale) partials with exponential decays."""
	n = int(dur * SR)
	out = np.zeros(n)
	for ratio, amp, dscale in partials:
		out += amp * osc(freq * ratio, dur, RNG.random() * 6.28) * exp_env(n, tau * dscale, attack)
	return out


def fm(carrier, ratio, index, dur, index_tau=0.3):
	n = int(dur * SR)
	t = np.arange(n) / SR
	mod_index = index * np.exp(-t / index_tau)
	mod = np.sin(2 * np.pi * carrier * ratio * t)
	return np.sin(2 * np.pi * carrier * t + mod_index * mod)


def noise(dur):
	return RNG.normal(0, 1, int(dur * SR))


def spectral_filter(x, lo=None, hi=None, order=2.0):
	"""Zero-phase filter in the frequency domain (smooth Butterworth-like magnitude)."""
	n = len(x)
	X = np.fft.rfft(x)
	f = np.fft.rfftfreq(n, 1 / SR)
	g = np.ones_like(f)
	if lo:
		g *= 1 / np.sqrt(1 + (lo / np.maximum(f, 1e-3)) ** (2 * order))
	if hi:
		g *= 1 / np.sqrt(1 + (f / hi) ** (2 * order))
	return np.fft.irfft(X * g, n)


def svf_sweep(x, cutoff, q=0.7, mode="bp"):
	"""Chamberlin state-variable filter with a per-sample cutoff (Hz)."""
	cutoff = np.broadcast_to(np.asarray(cutoff, dtype=np.float64), x.shape)
	fcoef = 2 * np.sin(np.pi * np.clip(cutoff, 20, SR / 6) / SR)
	damp = 1 / q
	low = band = 0.0
	out = np.empty_like(x)
	for i in range(len(x)):
		high = x[i] - low - damp * band
		band += fcoef[i] * high
		low += fcoef[i] * band
		out[i] = band if mode == "bp" else (low if mode == "lp" else high)
	return out


def reverb(x, decay=0.6, wet=0.22, predelay=0.012, bright=6000):
	"""Convolution with a synthetic, slightly filtered exponential-noise impulse response."""
	n = int(decay * 1.5 * SR)
	ir = RNG.normal(0, 1, n) * np.exp(-np.arange(n) / SR / (decay / 6.9))
	ir = spectral_filter(ir, lo=200, hi=bright)
	ir /= np.sqrt(np.sum(ir ** 2))
	pd = int(predelay * SR)
	ir = np.concatenate([np.zeros(pd), ir])
	m = len(x) + len(ir) - 1
	size = 1 << (m - 1).bit_length()
	y = np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[:m]
	dry = np.concatenate([x, np.zeros(m - len(x))])
	return dry * (1 - wet * 0.5) + y * wet


def fade_tail(x, dur=0.03):
	n = min(len(x), int(dur * SR))
	x = x.copy()
	x[-n:] *= np.linspace(1, 0, n) ** 2
	return x


def trim(x, thresh=10 ** (-48 / 20)):
	idx = np.where(np.abs(x) > thresh * np.max(np.abs(x)))[0]
	return x[: idx[-1] + 1] if len(idx) else x


def finish(x, peak_db=-3.0):
	x = x - np.mean(x)
	x = fade_tail(trim(x))
	pk = np.max(np.abs(x))
	return x / pk * (10 ** (peak_db / 20))


def midi(m):
	return 440.0 * 2 ** ((m - 69) / 12)


# --------------------------------------------------------------------------------------------------
# the sounds
# --------------------------------------------------------------------------------------------------

def laptop_boot():
	dur = 2.2
	buf = silence(dur)
	# Cmaj9 arpeggio: C4 E4 G4 B4 D5, glassy FM bells
	notes = [60, 64, 67, 71, 74]
	for i, m in enumerate(notes):
		f = midi(m)
		tone = 0.55 * fm(f, 2.0, 1.6, 1.7, 0.25) + 0.35 * bell(f, 1.7, tau=0.6)
		tone *= adsr(len(tone), 0.006, 0.25, 0.45, 1.0, sustain_time=0.15)
		place(buf, tone * (0.9 - i * 0.06), 0.09 * i)
	# warm pad (detuned sines + soft octave), swelling in under the arpeggio
	pad = np.zeros(int(1.9 * SR))
	for m in (48, 55, 60, 64, 71):
		for det in (-0.12, 0.12):
			pad += osc(midi(m + det), 1.9) * (0.6 if m < 60 else 0.35)
	pad *= adsr(len(pad), 0.45, 0.4, 0.7, 0.9, sustain_time=0.15)
	pad = spectral_filter(pad, hi=2500)
	place(buf, pad * 0.16, 0.12)
	# sparkle on top
	sp = bell(midi(86), 0.8, tau=0.25) * 0.18
	place(buf, sp, 0.42)
	return finish(reverb(buf, decay=1.2, wet=0.32), -4.0)


def laptop_shutdown():
	dur = 1.5
	buf = silence(dur)
	for i, m in enumerate((79, 76, 72, 67)):
		f = midi(m)
		tone = 0.6 * fm(f, 2.0, 1.0, 0.9, 0.2) + 0.3 * bell(f, 0.9, tau=0.4)
		tone *= adsr(len(tone), 0.01, 0.2, 0.35, 0.55, sustain_time=0.05)
		place(buf, tone * (0.85 - 0.1 * i), 0.13 * i)
	pad = np.zeros(int(1.2 * SR))
	for m in (55, 60, 64):
		pad += osc(midi(m) * np.linspace(1.0, 0.94, int(1.2 * SR)), 1.2)
	pad *= adsr(len(pad), 0.1, 0.3, 0.5, 0.7, sustain_time=0.1)
	place(buf, spectral_filter(pad, hi=1500) * 0.12, 0.05)
	return finish(reverb(buf, decay=0.9, wet=0.3), -5.0)


def laptop_click(variant=0):
	dur = 0.05
	n = int(dur * SR)
	f = (3200, 3600, 2900)[variant]
	body = osc(f, dur) * exp_env(n, 0.004, 0.0005)
	tick = spectral_filter(noise(dur), lo=2000, hi=9000) * exp_env(n, 0.0025, 0.0002) * 0.6
	thump = osc(900, dur) * exp_env(n, 0.006, 0.0008) * 0.4
	return finish(body * 0.5 + tick + thump, -10.0)


def laptop_notify():
	dur = 1.2
	buf = silence(dur)
	parts = ((1, 1.0, 1.0), (2.0, 0.25, 0.5), (3.01, 0.1, 0.35), (4.1, 0.05, 0.25))
	for i, m in enumerate((84, 79)):  # C6 -> G5 "ding-dong"
		tone = bell(midi(m), 0.9, parts, tau=0.32, attack=0.002) + 0.25 * fm(midi(m), 1.0, 0.8, 0.9, 0.08) * exp_env(int(0.9 * SR), 0.25)
		place(buf, tone * (1.0 if i == 0 else 0.9), 0.16 * i)
	return finish(reverb(buf, decay=0.7, wet=0.2), -6.0)


def laptop_error():
	dur = 0.4
	n = int(dur * SR)
	f = 190 * np.exp(-np.arange(n) / SR / 0.18) * 0.35 + 125
	body = osc(f, dur) + 0.35 * osc(2 * f, dur) + 0.12 * osc(3 * f, dur)
	body *= exp_env(n, 0.09, 0.003)
	thud = spectral_filter(noise(dur), hi=600) * exp_env(n, 0.02, 0.001) * 0.6
	return finish(reverb(body + thud, decay=0.3, wet=0.12), -6.0)


def laptop_lid(variant=0):
	dur = 0.3
	buf = silence(dur)
	for k, (at, g) in enumerate(((0.0, 1.0), (0.035 + 0.01 * variant, 0.45))):
		n = int(0.12 * SR)
		click = spectral_filter(noise(0.12), lo=900, hi=4200 + 600 * variant) * exp_env(n, 0.008, 0.0005)
		knock = osc(140 + 30 * variant, 0.12) * exp_env(n, 0.025, 0.001) * 0.9
		plastic = osc(1250 + 120 * variant, 0.12) * exp_env(n, 0.01, 0.0005) * 0.25
		place(buf, (click * 0.8 + knock + plastic) * g, at)
	return finish(reverb(buf, decay=0.25, wet=0.12), -6.0)


def shop_purchase():
	dur = 1.6
	buf = silence(dur)
	# "cha": drawer/lever rattle
	n = int(0.12 * SR)
	cha = spectral_filter(noise(0.12), lo=1800, hi=7000) * exp_env(n, 0.03, 0.001)
	cha += spectral_filter(noise(0.12), lo=300, hi=1200) * exp_env(n, 0.02, 0.001) * 0.5
	place(buf, cha * 0.7, 0.0)
	place(buf, cha * 0.35, 0.045)
	# "ching": bright register bell (inharmonic partials)
	ring = bell(2093, 1.3, ((1, 1.0, 1.0), (1.51, 0.5, 0.8), (2.44, 0.35, 0.55), (3.13, 0.2, 0.4), (4.07, 0.12, 0.3)), tau=0.55)
	place(buf, ring * 0.8, 0.11)
	# coin jingle
	for i in range(9):
		f = RNG.uniform(3800, 6800)
		n2 = int(0.18 * SR)
		ping = (osc(f, 0.18) + 0.5 * osc(f * 1.47, 0.18)) * exp_env(n2, RNG.uniform(0.03, 0.07), 0.0005)
		place(buf, ping * RNG.uniform(0.15, 0.35), 0.14 + RNG.uniform(0, 0.35))
	return finish(reverb(buf, decay=0.8, wet=0.22), -3.0)


def delivery_arrive():
	dur = 2.6
	buf = silence(dur)
	tube = ((1, 1.0, 1.0), (2.76, 0.32, 0.55), (5.4, 0.12, 0.3), (8.93, 0.04, 0.2))
	for i, m in enumerate((76, 72)):  # E5 -> C5 "ding ... dong"
		tone = bell(midi(m), 1.9, tube, tau=0.75, attack=0.002)
		tone += 0.3 * osc(midi(m) * 0.5, 1.9) * exp_env(int(1.9 * SR), 0.5)  # warm undertone
		place(buf, tone * (1.0 if i == 0 else 0.95), 0.55 * i)
	return finish(reverb(buf, decay=1.1, wet=0.28), -3.0)


def delivery_unbox(variant=0):
	dur = 0.9
	n = int(dur * SR)
	t = np.arange(n) / SR
	# tape/cardboard rip: dense random crackle grains, band-passed with a rising sweep
	grains = np.zeros(n)
	pos = 0.02
	while pos < 0.5:
		g = int(RNG.uniform(0.002, 0.008) * SR)
		at = int(pos * SR)
		grains[at:at + g] += RNG.normal(0, 1, min(g, n - at)) * RNG.uniform(0.4, 1.0)
		pos += RNG.uniform(0.004, 0.018)
	rip = svf_sweep(grains, 1200 + 2600 * np.clip(t / 0.5, 0, 1) + 300 * variant, q=1.2)
	rip *= np.clip(1 - (t - 0.45) / 0.15, 0, 1)
	# whoosh as the flaps open
	wn = noise(dur) * np.exp(-((t - 0.62) / 0.13) ** 2)
	whoosh = svf_sweep(wn, 500 + 1800 * np.exp(-((t - 0.6) / 0.15) ** 2), q=0.8)
	# soft cardboard thump at the start
	thump = osc(110, dur) * exp_env(n, 0.03, 0.002) * 0.5
	return finish(rip * 1.0 + whoosh * 0.7 + thump, -3.0)


def toy_squeak(variant=0):
	dur = 0.38
	n = int(dur * SR)
	t = np.arange(n) / SR
	base = (950, 1080, 860)[variant]
	peak = base * (1.75 + 0.1 * variant)
	contour = base + (peak - base) * np.clip(t / 0.09, 0, 1) ** 0.6
	contour = np.where(t > 0.16, contour - (t - 0.16) * 900, contour)
	vib = 1 + 0.035 * np.sin(2 * np.pi * 28 * t)
	f = contour * vib
	ph = 2 * np.pi * np.cumsum(f) / SR
	# nasal reedy tone: odd/even harmonics with a formant-ish tilt
	tone = np.sin(ph) + 0.55 * np.sin(2 * ph) + 0.35 * np.sin(3 * ph) + 0.15 * np.sin(4 * ph)
	breath = spectral_filter(noise(dur), lo=2500, hi=8000) * 0.08
	env = adsr(n, 0.012, 0.05, 0.75, 0.12, sustain_time=0.16)
	return finish((tone + breath) * env, -3.0)


def toy_pop(variant=0):
	dur = 0.75
	buf = silence(dur)
	n = int(0.08 * SR)
	crack = noise(0.08) * exp_env(n, 0.006 + 0.002 * variant, 0.0002)
	crack = spectral_filter(crack, lo=400, hi=9000)
	boom = osc(85 + 15 * variant, 0.08) * exp_env(n, 0.025, 0.001) * 1.2
	place(buf, crack + boom, 0.0)
	# confetti rustle: sparse high crackles fading out
	for i in range(70):
		at = 0.03 + RNG.exponential(0.12)
		if at > dur - 0.05:
			continue
		g = int(RNG.uniform(0.001, 0.004) * SR)
		grain = spectral_filter(RNG.normal(0, 1, g + 64), lo=3000, hi=10000)[:g] * np.hanning(g)
		place(buf, grain * RNG.uniform(0.05, 0.22) * np.exp(-at / 0.25), at)
	return finish(reverb(buf, decay=0.4, wet=0.15), -3.0)


# id -> (subtitle text, [(file path, generator)])
SOUNDS = {
	"laptop.boot": ("Laptop starts up", [("laptop/boot", laptop_boot)]),
	"laptop.shutdown": ("Laptop shuts down", [("laptop/shutdown", laptop_shutdown)]),
	"laptop.click": ("Laptop clicks", [(f"laptop/click{i + 1}", (lambda v: lambda: laptop_click(v))(i)) for i in range(3)]),
	"laptop.notify": ("Notification chimes", [("laptop/notify", laptop_notify)]),
	"laptop.error": ("Laptop error", [("laptop/error", laptop_error)]),
	"laptop.lid": ("Laptop lid clacks", [(f"laptop/lid{i + 1}", (lambda v: lambda: laptop_lid(v))(i)) for i in range(2)]),
	"shop.purchase": ("Cash register rings", [("shop/purchase", shop_purchase)]),
	"delivery.arrive": ("Doorbell rings", [("delivery/arrive", delivery_arrive)]),
	"delivery.unbox": ("Package unboxed", [(f"delivery/unbox{i + 1}", (lambda v: lambda: delivery_unbox(v))(i)) for i in range(2)]),
	"toy.squeak": ("Toy squeaks", [(f"toy/squeak{i + 1}", (lambda v: lambda: toy_squeak(v))(i)) for i in range(3)]),
	"toy.pop": ("Party popper pops", [(f"toy/pop{i + 1}", (lambda v: lambda: toy_pop(v))(i)) for i in range(2)]),
}


def write_ogg(x: np.ndarray, rel: str) -> str:
	path = os.path.join(ASSETS, "sounds", rel + ".ogg")
	os.makedirs(os.path.dirname(path), exist_ok=True)
	pcm = np.round(np.clip(x, -1, 1) * 32767).astype("<i2")
	with tempfile.TemporaryDirectory() as td:
		wav = os.path.join(td, "s.wav")
		with wave.open(wav, "wb") as w:
			w.setnchannels(1)
			w.setsampwidth(2)
			w.setframerate(SR)
			w.writeframes(pcm.tobytes())
		subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-ac", "1", "-ar", str(SR), "-c:a", "libvorbis",
			"-q:a", "6", "-map_metadata", "-1", "-fflags", "+bitexact", "-flags:a", "+bitexact", path], check=True)
	return path


def analyse(path: str) -> dict:
	raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", path, "-f", "s16le", "-ac", "1", "-ar", str(SR), "-"],
		check=True, capture_output=True).stdout
	x = np.frombuffer(raw, dtype="<i2").astype(np.float64) / 32768
	probe = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=channels,sample_rate,codec_name", "-of", "json", path],
		check=True, capture_output=True, text=True).stdout
	s = json.loads(probe)["streams"][0]
	return {"dur": len(x) / SR, "peak_db": 20 * np.log10(max(np.max(np.abs(x)), 1e-9)), "dc": float(np.mean(x)),
		"clip": int(np.sum(np.abs(x) >= 0.999)), "rms_db": 20 * np.log10(max(np.sqrt(np.mean(x ** 2)), 1e-9)),
		"channels": s["channels"], "rate": s["sample_rate"], "codec": s["codec_name"]}


def main():
	sounds_json = {}
	lang = {}
	out = []
	for sid, (subtitle, files) in SOUNDS.items():
		key = f"subtitles.laptopcraft.{sid}"
		entries = []
		for rel, gen in files:
			p = write_ogg(gen(), rel)
			out.append(p)
			a = analyse(p)
			print(f"  {rel:20s} {a['dur']:.2f}s peak {a['peak_db']:6.1f} dBFS rms {a['rms_db']:6.1f} dc {a['dc']:+.4f} "
				f"clip {a['clip']} {a['codec']} {a['channels']}ch {a['rate']}Hz")
			assert a["channels"] == 1 and a["clip"] == 0 and abs(a["dc"]) < 0.01
			entries.append(f"laptopcraft:{rel}")
		sounds_json[sid] = {"subtitle": key, "sounds": entries}
		lang[key] = subtitle
	out.append(write_json("sounds.json", sounds_json))
	out.append(write_json("lang/parts/art.json", lang))
	print(f"sounds: wrote {len(out)} files")
	return out


if __name__ == "__main__":
	main()
