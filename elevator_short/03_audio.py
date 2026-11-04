"""Procedural sound design + music bed + voiceover mix -> build/mix.wav (48 kHz stereo).
All SFX are synthesized with numpy and placed on the event frames from shots.py."""
import os, sys, subprocess, wave
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from shots import EV, SHOT, FRAME_END, FPS, B0, B1, W, CARDS

SR = 48000
HERE = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.join(HERE, "build")
rng = np.random.default_rng(3)
N = int((FRAME_END / FPS + 0.6) * SR)
sfx = np.zeros((N, 2))
mus = np.zeros((N, 2))


def T(frame):
    return (frame - 1) / FPS


def place(buf, sig, t, gain=1.0, pan=0.0):
    i = int(t * SR)
    if i >= len(buf):
        return
    if sig.ndim == 1:
        l, r = np.sqrt(0.5 * (1 - pan)), np.sqrt(0.5 * (1 + pan))
        sig = np.stack([sig * l, sig * r], 1) * 1.41
    n = min(len(sig), len(buf) - i)
    buf[i:i + n] += sig[:n] * gain


def tt(d):
    return np.arange(int(d * SR)) / SR


def env(d, a=0.005, r=None, curve=4.0):
    t = tt(d)
    e = np.minimum(1, t / max(a, 1e-4))
    if r is None:
        e *= np.exp(-curve * t / d)
    else:
        e *= np.clip((d - t) / r, 0, 1)
    return e


def band(sig, lo, hi):
    S = np.fft.rfft(sig)
    f = np.fft.rfftfreq(len(sig), 1 / SR)
    m = np.clip((f - lo * 0.8) / (lo * 0.2 + 1), 0, 1) * np.clip((hi * 1.25 - f) / (hi * 0.25 + 1), 0, 1)
    return np.fft.irfft(S * m, len(sig))


def noise(d):
    return rng.standard_normal(int(d * SR))


def sweep_noise(d, f0, f1, width=0.6):
    """Noise through a band that sweeps f0->f1 (overlap-add blocks)."""
    n = int(d * SR)
    out = np.zeros(n + 4096)
    blk, hop = 2048, 1024
    win = np.hanning(blk)
    for i in range(0, n, hop):
        c = f0 * (f1 / f0) ** (i / max(1, n))
        seg = band(rng.standard_normal(blk), c * (1 - width / 2), c * (1 + width / 2)) * win
        out[i:i + blk] += seg
    return out[:n] / (np.abs(out).max() + 1e-9)


def norm(x, peak=1.0):
    return x / (np.abs(x).max() + 1e-9) * peak


def sine(f, d, phase=0):
    t = tt(d)
    if callable(f):
        ph = 2 * np.pi * np.cumsum(f(t)) / SR
    else:
        ph = 2 * np.pi * f * t
    return np.sin(ph + phase)


# ------------------------------------------------------------------ sound library
def whoosh(d=0.45, up=True):
    s = sweep_noise(d, 300 if up else 3000, 3000 if up else 300, 0.8)
    e = np.sin(np.pi * np.linspace(0, 1, len(s))) ** 2
    return norm(s * e)


def impact(d=1.6, low=55):
    t = tt(d)
    thump = np.sin(2 * np.pi * (low * t + 40 * (1 - np.exp(-t * 25)) / 25)) * np.exp(-t * 5)
    crack = band(noise(d), 200, 6000) * np.exp(-t * 18)
    ring = sum(np.sin(2 * np.pi * f * t) * np.exp(-t * k) for f, k in ((310, 3), (523, 4), (811, 5), (1290, 7)))
    return norm(1.2 * thump + 0.45 * norm(crack) + 0.18 * norm(ring))


def screech(d):
    t = tt(d)
    f = 2600 + 500 * np.sin(2 * np.pi * 7 * t) + 300 * rng.standard_normal(len(t)).cumsum() / np.sqrt(len(t)) * 3
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.35 + norm(band(noise(d), 2500, 7000)) * 0.8
    e = np.minimum(1, t / 0.05) * np.minimum(1, (d - t) / 0.08)
    return norm(s * e * (0.7 + 0.3 * np.sin(2 * np.pi * 13 * t)))


def wind(d):
    s = sweep_noise(d, 200, 900, 1.2)
    t = tt(d)
    return norm(s * np.minimum(1, t / (d * 0.7)))


def hum(d):
    t = tt(d)
    return norm(np.sin(2 * np.pi * 100 * t) + 0.5 * np.sin(2 * np.pi * 200 * t) + 0.2 * np.sin(2 * np.pi * 300 * t)
                + 0.15 * band(noise(d), 80, 400))


def click():
    d = 0.09
    t = tt(d)
    return norm(band(noise(d), 1500, 6000) * np.exp(-t * 300) + 0.5 * np.sin(2 * np.pi * 1320 * t) * np.exp(-t * 40))


def bell_alarm(d=1.3):
    t = tt(d)
    tone = sum(np.sin(2 * np.pi * f * t) / (i + 1) for i, f in enumerate((1100, 2210, 3350)))
    am = 0.5 + 0.5 * np.sign(np.sin(2 * np.pi * 22 * t))
    return norm(band(tone * am, 500, 4000) * np.minimum(1, (d - t) / 0.1))


def cricket(d=1.0):
    t = tt(d)
    chirp = np.sin(2 * np.pi * 4300 * t) * (np.sin(2 * np.pi * 30 * t) > 0.3)
    gate = ((t % 0.5) < 0.18)
    return norm(chirp * gate)


def low_batt():
    a = sine(880, 0.12) * env(0.12, 0.005, 0.03)
    b = sine(587, 0.2) * env(0.2, 0.005, 0.08)
    return norm(np.concatenate([a, np.zeros(1200), b]))


def power_down():
    d = 0.6
    return norm(sine(lambda t: 900 * np.exp(-t * 6) + 60, d) * env(d, 0.005, 0.2))


def creak(d=1.4):
    t = tt(d)
    f = 70 + 25 * np.sin(2 * np.pi * 0.9 * t) + 8 * np.sin(2 * np.pi * 23 * t)
    s = np.sign(np.sin(2 * np.pi * np.cumsum(f) / SR)) * 0.5 + band(noise(d), 100, 900) * 0.3
    return norm(band(s, 60, 1500) * np.sin(np.pi * t / d))


def hiss(d=1.2):
    t = tt(d)
    return norm(band(noise(d), 3000, 12000) * np.exp(-t * 2.2) * np.minimum(1, t / 0.03))


def boom(d=2.5):
    t = tt(d)
    s = np.sin(2 * np.pi * (38 * t + 30 * (1 - np.exp(-t * 6)) / 6)) * np.exp(-t * 1.6)
    s += 0.3 * band(noise(d), 40, 300) * np.exp(-t * 3)
    return norm(s)


def drip():
    d = 0.25
    return norm(sine(lambda t: 900 + 2600 * t / 0.25, d) * env(d, 0.002, None, 14))


def riser(d=0.6):
    s = sweep_noise(d, 400, 6000, 0.6)
    t = tt(d)
    return norm(s * (t / d) ** 2)


def growl(d=1.1):
    t = tt(d)
    f = 95 + 40 * np.sin(2 * np.pi * 5.5 * t) + 25 * np.sin(2 * np.pi * 13 * t)
    s = np.sign(np.sin(2 * np.pi * np.cumsum(f) / SR))
    return norm(band(s, 60, 700) * np.sin(np.pi * t / d) ** 0.5 * (0.6 + 0.4 * np.sin(2 * np.pi * 9 * t)))


def saw(f, d):
    t = tt(d)
    return 2 * ((f * t) % 1) - 1


def sting(chord, d=0.6):
    s = sum(saw(f, d) + saw(f * 1.004, d) for f in chord)
    return norm(band(s, 60, 2200) * env(d, 0.01, 0.25))


def thump(d=0.35, f=48):
    t = tt(d)
    return norm(np.sin(2 * np.pi * (f * t + 60 * (1 - np.exp(-t * 30)) / 30)) * np.exp(-t * 12))


def heartbeat():
    a = thump(0.25, 45)
    b = thump(0.25, 42) * 0.7
    return np.concatenate([a, np.zeros(int(0.06 * SR)), b])


def wobble(d=1.0):
    return norm(sine(lambda t: 520 + 180 * np.sin(2 * np.pi * 3.5 * t), d) * env(d, 0.05, 0.3) * 0.6
                + sine(lambda t: 780 + 200 * np.sin(2 * np.pi * 2.7 * t), d) * env(d, 0.05, 0.3) * 0.4)


def tinnitus(d=1.6):
    t = tt(d)
    return norm(np.sin(2 * np.pi * 6200 * t) * np.minimum(1, t / 0.5) * np.minimum(1, (d - t) / 0.3))


def shimmer(d=1.4):
    t = tt(d)
    s = sum(np.sin(2 * np.pi * f * t) * np.exp(-t * (1.2 + i * 0.4)) for i, f in enumerate((1568, 2093, 2637, 3136)))
    return norm(s * np.minimum(1, t / 0.15))


def scrape(d=0.8):
    t = tt(d)
    s = band(noise(d), 800, 5000) * (0.6 + 0.4 * np.sin(2 * np.pi * 37 * t)) + 0.4 * np.sin(2 * np.pi * 1700 * t + 3 * np.sin(2 * np.pi * 11 * t))
    return norm(s * np.sin(np.pi * t / d))


def slide(d=0.9):
    t = tt(d)
    return norm(band(noise(d), 80, 700) * np.sin(np.pi * t / d) + 0.3 * band(noise(d), 2000, 4000) * np.exp(-t * 4))


def choir(d=2.5, chord=(261.6, 329.6, 392.0, 523.3)):
    t = tt(d)
    s = sum(saw(f, d) + saw(f * 1.006, d) + saw(f * 0.995, d) for f in chord)
    s = band(s, 150, 2500) * (1 + 0.1 * np.sin(2 * np.pi * 5 * t))
    return norm(s * np.minimum(1, t / 0.4) * np.minimum(1, (d - t) / 0.8))


def gulp():
    d = 0.2
    return norm(sine(lambda t: 420 * np.exp(-t * 6) + 110, d) * env(d, 0.01, 0.06) + 0.2 * band(noise(d), 200, 800) * env(d))


def ding():
    d = 2.0
    t = tt(d)
    s = np.sin(2 * np.pi * 1318.5 * t) * np.exp(-t * 2) + 0.5 * np.sin(2 * np.pi * 2637 * t) * np.exp(-t * 3) \
        + 0.25 * np.sin(2 * np.pi * 3955 * t) * np.exp(-t * 5)
    return norm(s * np.minimum(1, t / 0.003))


def step():
    d = 0.12
    t = tt(d)
    return norm(np.sin(2 * np.pi * 90 * t) * np.exp(-t * 40) + 0.4 * band(noise(d), 300, 3000) * np.exp(-t * 60))


# ------------------------------------------------------------------ place SFX
place(sfx, wind(T(EV["slam"]) + 0.1), 0.0, 0.35)
place(sfx, impact(0.5, 90), 0.0, 0.55)                       # opening jolt
place(sfx, whoosh(0.35), T(SHOT["H2_shaft_drop"][0]) - 0.15, 0.4)
place(sfx, screech(T(EV["slam"]) - T(EV["sparks_on"]) + 0.25), T(EV["sparks_on"]), 0.32, 0.3)
place(sfx, impact(2.0, 50), T(EV["slam"]), 1.0)
place(sfx, power_down(), T(EV["power_cut"]), 0.35)
place(sfx, hum(T(EV["slam"])), 0.0, 0.06)
place(sfx, creak(1.2), T(EV["slam"]) + 0.6, 0.25, -0.4)
for i, f in enumerate(EV["btn_presses"]):
    place(sfx, click(), T(f), 0.5, 0.3)
for k in range(3):
    place(sfx, bell_alarm(0.5), T(EV["alarm"]) + k * 0.6, 0.28)
place(sfx, cricket(0.9), T(EV["nothing"]) + 0.2, 0.08, 0.5)
place(sfx, whoosh(0.3, False), T(SHOT["P1_phone_ots"][0]) - 0.1, 0.25)
place(sfx, low_batt(), T(EV["no_signal"]), 0.35)
place(sfx, low_batt(), T(EV["battery"]) + 0.2, 0.35)
place(sfx, power_down(), T(EV["phone_dies"]), 0.3)
place(sfx, whoosh(0.4), T(SHOT["K1_car_hanging"][0]) - 0.2, 0.35)
place(sfx, creak(2.0), T(SHOT["K1_car_hanging"][0]) + 0.3, 0.3)
place(sfx, creak(1.4), T(SHOT["K2_cables"][0]) + 0.1, 0.25, 0.4)
place(sfx, impact(0.8, 120), T(EV["brake_glow"]), 0.35)
place(sfx, hiss(1.4), T(EV["brake_glow"]) + 0.05, 0.25, 0.3)
place(sfx, boom(2.8), T(EV["thirst"]) - 0.05, 0.9)
place(sfx, drip(), T(EV["thirst"]) + 0.55, 0.3)
for txt, a, b in CARDS:
    place(sfx, riser(0.45), T(a) - 0.45, 0.25)
    place(sfx, impact(0.9, 70), T(a), 0.55)
place(sfx, growl(1.0), T(EV["growl"]), 0.45)
place(sfx, whoosh(0.25), T(SHOT["C2_corner"][0]) - 0.1, 0.3)
for k, ch in enumerate(((146.8, 174.6, 220.0), (138.6, 164.8, 207.7), (130.8, 155.6, 196.0))):
    place(sfx, sting(ch, 0.35 if k < 2 else 1.1), T(EV["corner_zoom"] - 6) + k * 0.3, 0.32)
for f in EV["pounds"]:
    place(sfx, thump(0.4, 40), T(f), 0.8)
place(sfx, wobble(1.0), T(EV["dizzy"]), 0.22)
place(sfx, sweep_noise(2.5, 200, 600, 1.0) * np.hanning(int(2.5 * SR)), T(SHOT["A1_vent"][0]), 0.12)
for hb in EV["heartbeats"]:
    place(sfx, heartbeat(), T(hb), 0.75)
place(sfx, tinnitus(1.6), T(SHOT["E3_eye"][0]), 0.04)
place(sfx, creak(0.8), T(EV["crack"]) - 0.1, 0.25)
place(sfx, shimmer(1.6), T(EV["crack"]), 0.25)
place(sfx, scrape(0.6), T(EV["crowbar"]), 0.3)
place(sfx, impact(0.5, 160), T(EV["pry"]), 0.4)
place(sfx, slide(1.0), T(EV["pry"]) + 0.3, 0.45)
place(sfx, choir(2.4), T(EV["doors_open"]) - 0.3, 0.22)
for g in EV["gulps"]:
    place(sfx, gulp(), T(g), 0.5)
place(sfx, sting((261.6, 329.6, 392.0, 523.3), 0.9), T(EV["cheer"]), 0.25)
place(sfx, ding(), T(EV["ding"]), 0.45)
place(sfx, slide(0.7), T(EV["ding"]) + 0.15, 0.3)
place(sfx, sting((155.6, 185.0, 233.1), 0.5), T(EV["ding"] + 14), 0.2)
place(sfx, impact(0.6, 100), T(EV["door_bang"]), 0.5)
for f in range(SHOT["S2_stairs"][0] + 4, EV["thumbs"] - 10, 5):
    place(sfx, step(), T(f), 0.35, 0.2 * (-1) ** f)
place(sfx, whoosh(0.3), T(EV["thumbs"]) - 0.15, 0.3)
place(sfx, shimmer(1.4), T(EV["thumbs"]), 0.2)

# ------------------------------------------------------------------ music bed
BPM = 120
beat = 60 / BPM
total = N / SR


def pluck(f, d=0.35):
    t = tt(d)
    return (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(4 * np.pi * f * t)) * np.exp(-t * 9)


def bass(f, d=0.45):
    t = tt(d)
    return np.tanh(2 * np.sin(2 * np.pi * f * t)) * np.exp(-t * 5)


tense = [110.0, 130.8, 164.8, 130.8, 116.5, 130.8, 155.6, 130.8]      # A minor-ish with b2 colour
hopeful = [130.8, 164.8, 196.0, 261.6, 174.6, 220.0, 261.6, 349.2]   # C major lift
t0_rescue = T(EV["doors_open"])
t_end_music = T(FRAME_END)
k = 0
t = T(SHOT["H3_aftermath"][0])
while t < t_end_music:
    tense_mode = t < t0_rescue
    seq = tense if tense_mode else hopeful
    # quieter / sparser during day 3
    sparse = T(SHOT["E1_lying"][0]) <= t < T(SHOT["L1_crack"][0])
    if not (sparse and k % 2):
        place(mus, pluck(seq[k % 8] * 2, 0.3), t, 0.12 if not sparse else 0.06, 0.4 * np.sin(k))
    if k % 4 == 0:
        place(mus, bass(seq[(k // 4) % 8] / 2), t, 0.35 if not sparse else 0.18)
    if k % 2 == 1 and not sparse and tense_mode:
        place(mus, band(noise(0.05), 6000, 12000) * env(0.05), t, 0.05)
    t += beat / 2
    k += 1
# drone pad underneath
pad_t = tt(total)
drone = (np.sin(2 * np.pi * 55 * pad_t) + 0.5 * np.sin(2 * np.pi * 82.4 * pad_t)) * 0.06
drone *= np.clip((pad_t - T(SHOT["H3_aftermath"][0])) / 1.0, 0, 1) * np.clip((t0_rescue - pad_t) / 0.5, 0, 1)
mus[:, 0] += drone
mus[:, 1] += drone

# ------------------------------------------------------------------ voiceover + ducking
vo48 = os.path.join(BUILD, "vo48.wav")
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", os.path.join(BUILD, "voiceover.wav"), "-ar", str(SR),
                "-ac", "1", vo48], check=True)
with wave.open(vo48) as w:
    vo = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float64) / 32768
vo = norm(vo, 0.9)
# light "radio voice" presence: a touch of high-shelf by mixing a high band
vo = vo + 0.25 * band(vo, 2500, 9000)
vo = norm(vo, 0.9)
voice = np.zeros(N)
voice[:min(N, len(vo))] = vo[:N]
k = int(0.05 * SR)
ve = np.convolve(np.abs(voice), np.ones(k) / k, mode="same")
duck = 1 - 0.55 * np.clip(ve / 0.05, 0, 1)
duck = np.convolve(duck, np.ones(int(0.15 * SR)) / int(0.15 * SR), mode="same")
mix = mus * duck[:, None] * 0.9 + sfx * (1 - 0.35 * (1 - duck))[:, None] + np.stack([voice, voice], 1)
mix = np.tanh(mix * 1.1) / np.tanh(1.1)
mix = norm(mix, 0.95)
out = os.path.join(BUILD, "mix.wav")
with wave.open(out, "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((mix * 32767).astype(np.int16).tobytes())
print("wrote", out, round(N / SR, 2), "s")
