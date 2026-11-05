"""Mix narration + score + ambience + SFX into a 48 kHz stereo WAV (YouTube loudness ~ -14 LUFS).

Music (CC BY 4.0, Kevin MacLeod / incompetech.com): "Interloper", "Echoes of Time v2".
SFX: Mixkit (Mixkit Sound Effects Free License). Teeth chatter and tinnitus are synthesised here.
"""
import subprocess, sys, json, math
import numpy as np
from scipy import signal

SR = 48000
DUR = 133.2
A = "/opt/assets/audio"
OUT = sys.argv[1] if len(sys.argv) > 1 else "/opt/work/mix.wav"
VO = "/opt/work/vo/narration_full.wav"
rng = np.random.default_rng(7)
mix = np.zeros((int(DUR * SR), 2), np.float32)
music = np.zeros_like(mix)


def load(path, start=0.0, dur=None, rate=1.0):
    cmd = ["ffmpeg", "-v", "quiet", "-ss", str(start)]
    if dur: cmd += ["-t", str(dur / rate)]
    cmd += ["-i", path, "-ac", "2", "-ar", str(int(SR / rate)), "-f", "f32le", "-"]
    x = np.frombuffer(subprocess.run(cmd, capture_output=True).stdout, np.float32).reshape(-1, 2).copy()
    return x


def sfx(n): return f"{A}/sfx/mixkit_{n}.mp3"


def fade(x, fi=0.01, fo=0.05):
    n = len(x); a = np.ones(n, np.float32)
    k = min(n, int(fi * SR)); a[:k] = np.linspace(0, 1, k) if k else a[:k]
    k = min(n, int(fo * SR)); a[n - k:] *= np.linspace(1, 0, k) if k else 1
    return x * a[:, None]


def filt(x, kind, fc, order=2):
    b, a = signal.butter(order, fc / (SR / 2), btype=kind)
    return signal.lfilter(b, a, x, axis=0).astype(np.float32)


def place(buf, x, t, gain_db=0.0, pan=0.0):
    i = int(t * SR); x = x * (10 ** (gain_db / 20))
    L = math.cos((pan + 1) * math.pi / 4) * math.sqrt(2); R = math.sin((pan + 1) * math.pi / 4) * math.sqrt(2)
    x = x * np.array([L, R], np.float32)
    j = min(len(buf), i + len(x))
    if j > i: buf[i:j] += x[: j - i]


def loop_to(x, n):
    reps = int(np.ceil(n / len(x))) + 1
    y = np.concatenate([x] * reps)[:n]
    return y


def env(x, t0, t1, keys):
    """multiply x (placed at t0) by a gain curve keys=[(t, db), ...]"""
    tt = t0 + np.arange(len(x)) / SR
    ks = np.array(keys)
    g = np.interp(tt, ks[:, 0], ks[:, 1])
    return x * (10 ** (g / 20))[:, None]


# ------------------------------------------------------------------ narration
vo = load(VO)
vo = filt(vo, "highpass", 75)
# gentle compression
envv = np.abs(vo).mean(axis=1)
envv = signal.lfilter([1 - 0.999], [1, -0.999], envv)
gain = np.where(envv > 0.05, (0.05 / np.maximum(envv, 1e-6)) ** 0.35, 1.0).astype(np.float32)
vo = vo * gain[:, None]
vo = vo / np.abs(vo).max() * 0.85
place(mix, vo, 0.0, 0.0)
vo_env = np.abs(vo).mean(axis=1)
vo_env = np.pad(vo_env, (0, len(mix) - len(vo_env)))[: len(mix)]
vo_env = signal.filtfilt(*signal.butter(2, 4 / (SR / 2)), vo_env)

# ------------------------------------------------------------------ ambience: freezer room tone
hum = loop_to(load(sfx(2139)), int(99.3 * SR))
hum = filt(hum, "lowpass", 2500)
hum = env(hum, 0, 99.3, [(0, -26), (4.3, -26), (4.5, -20), (8.4, -20), (9.0, -16), (11.5, -16), (12.0, -20), (55.4, -20), (62, -18),
                         (81.75, -18), (82.05, -27), (99.0, -27), (99.3, -60)])
place(mix, fade(hum, 0.5, 0.3), 0.0)
fr = loop_to(load(sfx(1837)), int(99.3 * SR))
place(mix, fade(env(fr, 0, 99.3, [(0, -30), (81.95, -30), (82.3, -36), (99, -40)]), 0.5, 0.3), 0.0, pan=0.3)
air = loop_to(filt(load(sfx(1735)), "lowpass", 1800), int(99.3 * SR))
air = env(air, 0, 99.3, [(0, -40), (4.4, -40), (5, -32), (8.4, -32), (9.2, -22), (11.4, -22), (12.2, -33), (81.85, -33), (82.3, -42), (99, -46)])
place(mix, fade(air, 1.0, 0.5), 0.0, pan=-0.2)
# warm dock tone while the door is open (start, rescue, outside), muffled when closed
dock = loop_to(filt(load(sfx(447)), "lowpass", 3500), int(DUR * SR))
dock = env(dock, 0, DUR, [(0, -30), (4.35, -30), (4.45, -70), (100.0, -70), (100.7, -30), (114.9, -26), (117.6, -40), (120.6, -26),
                          (124.6, -34), (128.4, -36), (128.45, -70), (133.2, -70)])
place(mix, dock, 0.0, pan=0.0)
# late interior tone after the rescue (empty freezer, door closing)
hum2 = loop_to(filt(load(sfx(2139)), "lowpass", 1800), int(33.7 * SR))
hum2 = env(hum2, 99.5, 133.2, [(99.5, -60), (101, -30), (114.9, -32), (115.2, -44), (117.6, -24), (120.6, -44), (124.6, -26), (128.4, -24), (129, -30), (132.5, -40), (133.2, -70)])
place(mix, hum2, 99.5)

# ------------------------------------------------------------------ score
mus1 = load(f"{A}/music/Interloper.mp3", 0, 82.2)
mus1 = env(mus1, 0, 82.2, [(0, -60), (1.5, -17), (60, -15), (80.9, -14), (81.95, -70)])
place(music, mus1, 0.0)
drone = load(sfx(2749), 0, 18)
place(music, fade(env(drone, 81.95, 99.6, [(81.95, -40), (83.3, -24), (95, -22), (98.6, -30), (99.3, -70)]), 1.0, 0.3), 81.95)
mus2 = load(f"{A}/music/Echoes_of_Time_v2.mp3", 0, 32.5)
mus2 = env(mus2, 100.9, 133.2, [(100.9, -60), (102.5, -19), (114.9, -17), (130.4, -14), (132.2, -22), (133.1, -70)])
place(music, mus2, 100.9)
# side-chain duck under the narration
duck = 1.0 - 0.55 * np.clip(vo_env / 0.08, 0, 1)
music *= duck[:, None].astype(np.float32)
mix += music

# ------------------------------------------------------------------ SFX events
def ev(n, t, db=0.0, pan=0.0, start=0.0, dur=None, lp=None, hp=None, rate=1.0, fi=0.005, fo=0.08):
    x = load(sfx(n), start, dur, rate)
    if lp: x = filt(x, "lowpass", lp)
    if hp: x = filt(x, "highpass", hp)
    place(mix, fade(x, fi, fo), t, db, pan)


ev(538, 0.25, -21, 0.0, start=0.5, dur=3.4, lp=6000)                 # footsteps walking in
ev(168, 4.1, -20, -0.2)                                              # whoosh into the slam
ev(201, 4.40, -4, 0.1); ev(2849, 4.46, -10, 0.1); ev(2300, 4.42, -10)  # door slam + latch + sub
ev(2232, 5.3, -24, start=0.0, dur=1.6)                               # startled breath
ev(379, 11.7, -18, start=1.0, dur=2.2)                               # straining at the door
for k, t in enumerate([12.7, 13.12, 13.5]):
    ev(2182, t, -8 - k, 0.15); ev(2775, t + 0.01, -18, 0.15, lp=2500)  # fists on the insulated door
ev(2232, 14.2, -26, start=1.0, dur=3.0)


def chatter(t0, t1, db):
    clk = load(sfx(1128))
    clk = clk[: int(0.05 * SR)]
    t = t0
    while t < t1:
        r = rng.uniform(0.85, 1.25)
        x = signal.resample(clk, int(len(clk) / r)).astype(np.float32)
        place(mix, fade(x, 0.001, 0.01), t, db + rng.uniform(-3, 2), rng.uniform(-0.1, 0.1))
        t += rng.uniform(0.09, 0.15)


chatter(29.6, 34.0, -22); chatter(62.4, 65.0, -18); chatter(77.5, 81.2, -18); chatter(81.2, 81.9, -26); chatter(115.0, 117.5, -24)
ev(2232, 36.9, -16, start=0.2, dur=1.6, lp=5000)                     # big exhale
ev(1122, 38.75, -22, 0.2)                                            # hand on cold metal
ev(1898, 40.35, -18); ev(1116, 41.3, -26); ev(1116, 41.9, -28)       # phone out of pocket, taps
ev(1110, 43.4, -18)                               # "no service" error tone
ev(1473, 45.25, -16)                                                 # realisation whoosh
ev(2914, 46.3, -20, start=0.0, dur=3.3, fo=0.3)                      # riser into the release
ev(2917, 49.62, -10)                                                 # impact: jammed with ice
for t in (49.85, 50.15, 50.45, 50.75):
    ev(2159, t, -12, 0.1, lp=3000)
ev(2775, 51.05, -14, 0.1, lp=3000); ev(1329, 50.2, -26, hp=2500, dur=1.5)  # fist + ice crackle
ev(538, 51.6, -18, start=2.0, dur=1.8, rate=1.15)                    # hurrying steps
ev(2498, 54.85, -4); ev(756, 54.9, -10); ev(2300, 54.86, -12); ev(379, 54.95, -16, start=4.0, dur=1.2)  # the fall
ev(167, 55.3, -18)                                                   # time-lapse
for t in (57.35, 59.45): ev(168, t, -20)
ev(1329, 55.5, -24, hp=2800, dur=6.0, fi=0.5, fo=0.5)                # frost crackling
ev(2300, 61.0, -12)                                                  # "hypothermia" hit
ev(2232, 62.4, -20, start=0.0, dur=2.6)
ev(2839, 65.68, -12, 0.15); ev(1124, 65.72, -20)                     # phone hits the floor
ev(538, 67.5, -22, start=5.0, dur=1.8, rate=0.85)                    # stagger
ev(1898, 73.6, -20, rate=0.8)                                        # sits on cardboard
ev(1914, 82.3, -24, start=2.0, dur=12.0, fi=1.0, fo=1.0)            # slow breathing after the shivering stops
# tinnitus during the confusion POV
tt = np.arange(int(4.6 * SR)) / SR
tone = (0.02 * np.sin(2 * np.pi * 6200 * tt) * np.sin(np.pi * tt / 4.6) ** 2).astype(np.float32)
place(mix, np.stack([tone, tone], 1), 87.0, -6)
# heartbeat synced to the ECG overlay
hb = load(sfx(490)); t0 = 91.75; tt = t0
while tt < 95.5:
    per = 1.55 + (tt - t0) * 0.12
    place(mix, fade(filt(hb, "lowpass", 900), 0.002, 0.1), tt + 0.3 * per, -6)
    tt += per
for t in (95.9, 96.5, 97.3):
    place(mix, fade(filt(hb, "lowpass", 700), 0.002, 0.1), t, -10)
ev(198, 100.2, -10, 0.0); ev(200, 100.45, -12, 0.0, lp=5000)         # latch + door swings open
ev(167, 100.3, -22)
ev(538, 101.4, -18, start=0.0, dur=1.6, rate=1.2)                    # rescuer running in
for k, t in enumerate(np.arange(105.0, 107.6, 0.22)):                 # foil blanket crinkle (synth)
    n = (rng.normal(0, 1, (int(0.08 * SR), 2)) * 0.12).astype(np.float32)
    place(mix, fade(filt(n, "highpass", 3500), 0.002, 0.04), t + rng.uniform(0, 0.08), -24 + rng.uniform(-4, 3))
for t in (108.55, 109.05, 110.25, 110.75, 111.75, 113.2):
    ev(2568, t, -22)                                                 # factor chips
ev(201, 128.38, -10, lp=3000); ev(2849, 128.45, -16, lp=3000)        # door closes (heard from inside)
ev(780, 129.85, -16)                                                 # end card

# ------------------------------------------------------------------ master
mix = filt(mix, "highpass", 25)
# loudness to ~ -14 LUFS (pyloudnorm if available) then true-peak-ish limiting
try:
    import pyloudnorm as pyln
    meter = pyln.Meter(SR)
    l = meter.integrated_loudness(mix.astype(np.float64))
    mix *= 10 ** ((-14.0 - l) / 20)
    print("LUFS before", round(l, 1))
except Exception as e:
    mix *= 0.5 / (np.sqrt(np.mean(mix ** 2)) * 4 + 1e-9)
# true-peak limiter (-1.5 dBTP, so the AAC encode stays under -1 dBTP): 4x-oversampled peak estimate,
# then a hold (12 ms) + average (10 ms) gain curve, which never exceeds the gain each sample needs.
# (The old tanh soft clip + 0.98 sample-peak cap let inter-sample peaks reach 0 dBTP after encoding.)
from scipy.signal import resample_poly
from scipy.ndimage import minimum_filter1d, uniform_filter1d
ceil = 10 ** (-1.5 / 20)
up = np.abs(resample_poly(mix, 4, 1, axis=0)).max(axis=1)
tp = up[: len(mix) * 4].reshape(-1, 4).max(axis=1)
need = np.minimum(1.0, ceil / np.maximum(tp, 1e-9))
ra, rh = int(0.010 * SR), int(0.012 * SR)
gain = uniform_filter1d(minimum_filter1d(need, 2 * rh + 1, mode="nearest"), 2 * ra + 1, mode="nearest")
mix = mix * gain[:, None]
print("limiter: max gain reduction %.1f dB, %.2f%% of samples limited" % (-20 * np.log10(gain.min()), 100 * (gain < 0.999).mean()))
pk = np.abs(mix).max()
if pk > ceil: mix *= ceil / pk
import wave
with wave.open(OUT, "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((np.clip(mix, -1, 1) * 32767).astype("<i2").tobytes())
print("MIX", OUT, round(len(mix) / SR, 2), "s")
