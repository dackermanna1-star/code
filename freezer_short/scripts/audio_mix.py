"""Mix narration + score + ambience + SFX into a 48 kHz stereo WAV (YouTube loudness -14 LUFS, true peak <= -1.5 dBTP).

Music (CC BY 4.0, Kevin MacLeod / incompetech.com): "Interloper", "Echoes of Time v2".
SFX: Mixkit (Mixkit Sound Effects Free License). The teeth-chatter grains are cut from a Mixkit click; the tinnitus tone,
foil crinkle, slip scuff, phone error beep and the factor-chip pops are synthesised here.

Sync: one-shots are placed by their transient. `hit=` is the time (in seconds into the source file) of the impact, so
the impact - not the start of the file, which often has a lead-in - lands on the picture frame (frame f <-> (f - 1) / 30 s).
Set AUDIO_MIX_STEMS=<dir> to also write vo / music / ambience / sfx stems (after the master gain and limiter).
"""
import subprocess, sys, json, math, os, re, ast
import numpy as np
from scipy import signal
from scipy.signal import resample_poly
from scipy.ndimage import minimum_filter1d, maximum_filter1d, uniform_filter1d

SR = 48000
DUR = 133.2
END = 132.95          # everything is faded to digital silence by here (the picture ends at 133.03 s)
FPS = 30
A = "/opt/assets/audio"
ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1] if len(sys.argv) > 1 else "/opt/work/mix.wav"
VO = "/opt/work/vo/narration_full.wav"
rng = np.random.default_rng(7)
mix = np.zeros((int(DUR * SR), 2), np.float32)   # ambience bus (all buses are summed into `mix` at the master)
music = np.zeros_like(mix)
sfxb = np.zeros_like(mix)
vox = np.zeros_like(mix)
vo_env = None


def T(f): return (f - 1) / FPS


def load(path, start=0.0, dur=None, rate=1.0):
    """Decode (part of) a file to float32 stereo at SR. A missing or undecodable asset is an error, never silence."""
    if not os.path.isfile(path):
        raise FileNotFoundError(f"audio_mix: missing audio asset {path}")
    cmd = ["ffmpeg", "-v", "error", "-ss", str(start)]
    if dur: cmd += ["-t", str(dur / rate)]
    cmd += ["-i", path, "-ac", "2", "-ar", str(int(SR / rate)), "-f", "f32le", "-"]
    p = subprocess.run(cmd, capture_output=True)
    x = np.frombuffer(p.stdout, np.float32).reshape(-1, 2).copy()
    if p.returncode != 0 or len(x) == 0:
        raise RuntimeError(f"audio_mix: could not decode {path} (start={start}, dur={dur}): "
                           f"{p.stderr.decode(errors='replace').strip()[-300:]}")
    if not np.any(x):
        print(f"audio_mix: WARNING {path} [start {start} s, dur {dur}] is digital silence", file=sys.stderr)
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


def peq(x, fc, gain_db, q=0.8):
    """RBJ peaking EQ (a dip when gain_db < 0)."""
    g = 10 ** (gain_db / 40); w0 = 2 * math.pi * fc / SR; al = math.sin(w0) / (2 * q)
    b = np.array([1 + al * g, -2 * math.cos(w0), 1 - al * g]); a = np.array([1 + al / g, -2 * math.cos(w0), 1 - al / g])
    return signal.lfilter(b / a[0], a / a[0], x, axis=0).astype(np.float32)


def vo_duck(i, n, db, after=0.0):
    """Gain curve that pulls a sound down by up to `db` while the narration is speaking (after its first `after` s)."""
    w = np.zeros(n, np.float32)
    j = min(len(vo_env), i + n)
    if j > i: w[: j - i] = np.clip(vo_env[i:j] / 0.05, 0, 1)
    if after > 0: w *= np.clip((np.arange(n) / SR - after) / 0.03, 0, 1)
    return (10 ** (-db * w / 20)).astype(np.float32)


def place(buf, x, t, gain_db=0.0, pan=0.0, duck=0.0, duck_after=0.0):
    i = int(round(t * SR)); x = x * (10 ** (gain_db / 20))
    if i < 0: x = x[-i:]; i = 0
    L = math.cos((pan + 1) * math.pi / 4) * math.sqrt(2); R = math.sin((pan + 1) * math.pi / 4) * math.sqrt(2)
    x = x * np.array([L, R], np.float32)
    if duck: x = x * vo_duck(i, len(x), duck, duck_after)[:, None]
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


# ------------------------------------------------------------------ picture events and overlay timing
WORDS = json.load(open(os.path.join(ROOT, "..", "audio", "words.json")))
LAST_WORD_END = WORDS[-1]["e"]


def overlay_timing():
    """Factor-chip times and the end-card start, taken from overlays.py so the chip pops and the end sting follow it."""
    factors, card = None, None
    try:
        sys.path.insert(0, ROOT)
        import inspect, overlays as ov
        factors = [float(v[0]) for v in ov.FACTORS]
        card = getattr(ov, "END_T0", None)
        if card is None:
            nums = re.findall(r"\b1[23]\d\.\d+\b", inspect.getsource(ov.end_card))
            card = float(nums[0]) if nums else None
    except Exception as e:     # fall back to reading the source without running it
        print("audio_mix: WARNING could not import overlays.py (%s); parsing it instead" % e, file=sys.stderr)
        try:
            src = open(os.path.join(ROOT, "overlays.py")).read()
            for node in ast.parse(src).body:
                if isinstance(node, ast.Assign) and any(getattr(t, "id", None) == "FACTORS" for t in node.targets):
                    factors = [float(v[0]) for v in ast.literal_eval(node.value)]
                if isinstance(node, ast.Assign) and any(getattr(t, "id", None) == "END_T0" for t in node.targets):
                    card = float(ast.literal_eval(node.value))
                if isinstance(node, ast.FunctionDef) and node.name == "end_card" and card is None:
                    nums = re.findall(r"\b1[23]\d\.\d+\b", ast.get_source_segment(src, node))
                    card = float(nums[0]) if nums else None
        except Exception as e2:
            print("audio_mix: WARNING could not parse overlays.py either:", e2, file=sys.stderr)
    if not factors:
        factors = [108.57, 109.49, 110.23, 110.73, 111.73, 113.23]   # = overlays.FACTORS (word-locked)
        print("audio_mix: WARNING factor-chip times not found in overlays.py, using defaults", file=sys.stderr)
    if card is None:
        card = LAST_WORD_END + 0.18
        print("audio_mix: WARNING end-card start not found in overlays.py, using %.2f s" % card, file=sys.stderr)
    return factors, card


def ecg_spike_times():
    """Times at which overlays.ecg() draws an R spike at the trace head (a copy of its sig(); keep the two in step).
    Regular slow beats until 95.5 s, irregular beats until 97.4 s, then a chaotic trace with no beats."""
    t0 = 91.75

    def sig(tt):
        if tt < 95.5:
            per = 1.55 + (tt - t0) * 0.12
            ph = ((tt - t0) % per) / per
            return 70 * math.exp(-((ph - 0.3) / 0.018) ** 2) - 18 * math.exp(-((ph - 0.36) / 0.03) ** 2) + 10 * math.exp(-((ph - 0.6) / 0.06) ** 2)
        rnd = np.random.default_rng(int(tt * 1.3))
        ph = (tt * 1.3) % 1.0
        return rnd.uniform(30, 75) * math.exp(-((ph - rnd.uniform(0.2, 0.7)) / 0.02) ** 2) + 8 * math.sin(tt * 23)

    ts = np.arange(t0, 97.4, 0.0005)
    v = np.array([sig(x) for x in ts])
    pk = signal.find_peaks(v, height=25, distance=int(0.25 / 0.0005))[0]
    return [float(ts[i]) for i in pk]


FACTOR_T, CARD_T = overlay_timing()
SLAM = T(132)          # SH02: the door makes contact
FIST_SH05 = T(390)     # SH05: the only fist contact on screen (right fist comes down onto the door), between "won't" and "budge"
METAL = T(1164)        # SH10c: the palm reaches the shelf rail (IK contact key)
PHONE_OUT = T(1228)    # SH11a: the phone is in his hand
JAM = T(1487)          # cut to SH13, the iced release ("But this one is jammed with ice")
FIST_SH13 = T(1531)    # SH13: the fist meets the ice
SLIP = T(1598)         # SH14: his feet go out
FALL = T(1611)         # SH14: his back hits the floor; the picture cuts to black f1612-1622, black until SH15 (f1664)
SH15_CUTS = (T(1722), T(1786))   # SH15 time-lapse jump cuts
PHONE_LAND = T(1988)   # SH16b: the phone lands
SIT = T(2209)          # SH17b: he sits down on the cardboard
UNLATCH = T(2998)      # SH21: the door unlatches and starts to swing...
DOOR_OPEN = T(3024)    # ...and is fully open
DOOR_CLOSE = T(3853)   # SH25b: the door closes
STING = max(CARD_T, LAST_WORD_END + 0.08)   # end card (never on top of the last word)

# ------------------------------------------------------------------ narration
vo = load(VO)
vo = filt(vo, "highpass", 75)
# gentle compression
envv = np.abs(vo).mean(axis=1)
envv = signal.lfilter([1 - 0.999], [1, -0.999], envv)
gain = np.where(envv > 0.05, (0.05 / np.maximum(envv, 1e-6)) ** 0.35, 1.0).astype(np.float32)
vo = vo * gain[:, None]
vo = vo / np.abs(vo).max() * 0.85
place(vox, vo, 0.0, 0.0)
vo_env = np.abs(vo).mean(axis=1)
vo_env = np.pad(vo_env, (0, len(mix) - len(vo_env)))[: len(mix)]
vo_env = signal.filtfilt(*signal.butter(2, 4 / (SR / 2)), vo_env)

# ------------------------------------------------------------------ ambience: freezer room tone
# (under the black after the fall, 53.7-55.4 s, only a low drone of the room tone is left)
hum = loop_to(load(sfx(2139)), int(99.3 * SR))
hum = filt(hum, "lowpass", 2500)
hum = env(hum, 0, 99.3, [(0, -26), (4.3, -26), (4.5, -20), (8.4, -20), (9.0, -16), (11.5, -16), (12.0, -20), (53.7, -20), (53.95, -23),
                         (55.35, -23), (55.55, -20), (62, -18), (81.75, -18), (82.05, -27), (99.0, -27), (99.3, -60)])
place(mix, fade(hum, 0.5, 0.3), 0.0)
fr = loop_to(load(sfx(1837)), int(99.3 * SR))
place(mix, fade(env(fr, 0, 99.3, [(0, -30), (53.7, -30), (53.95, -38), (55.35, -38), (55.55, -30), (81.95, -30), (82.3, -36), (99, -40)]), 0.5, 0.3),
      0.0, pan=0.3)
air = loop_to(filt(load(sfx(1735)), "lowpass", 1800), int(99.3 * SR))
air = env(air, 0, 99.3, [(0, -40), (4.4, -40), (5, -32), (8.4, -32), (9.2, -22), (11.4, -22), (12.2, -33), (53.7, -33), (53.95, -46), (55.35, -46),
                         (55.6, -33), (81.85, -33), (82.3, -42), (99, -46)])
place(mix, fade(air, 1.0, 0.5), 0.0, pan=-0.2)
# warm dock tone while the door is open (start, rescue, outside), muffled when closed
dock = loop_to(filt(load(sfx(447)), "lowpass", 3500), int(DUR * SR))
dock = env(dock, 0, DUR, [(0, -30), (SLAM - 0.02, -30), (SLAM + 0.04, -70), (UNLATCH - 0.02, -70), (DOOR_OPEN, -30), (114.9, -26), (117.6, -40),
                          (120.6, -26), (124.6, -34), (DOOR_CLOSE, -36), (DOOR_CLOSE + 0.05, -70), (133.2, -70)])
place(mix, dock, 0.0, pan=0.0)
# late interior tone after the rescue (empty freezer, door closing)
hum2 = loop_to(filt(load(sfx(2139)), "lowpass", 1800), int(33.7 * SR))
hum2 = env(hum2, 99.5, 133.2, [(99.5, -60), (101, -30), (114.9, -32), (115.2, -44), (117.6, -24), (120.6, -44), (124.6, -26), (128.4, -24), (129, -30), (132.5, -40), (133.2, -70)])
place(mix, hum2, 99.5)

# ------------------------------------------------------------------ score
mus1 = load(f"{A}/music/Interloper.mp3", 0, 82.2)
mus1 = env(mus1, 0, 82.2, [(0, -60), (1.5, -17), (FALL, -15.2), (FALL + 0.3, -42), (55.25, -42), (55.8, -15.1), (60, -15), (80.9, -14), (81.95, -70)])
place(music, mus1, 0.0)
drone = load(sfx(2749), 0, 18)
place(music, fade(env(drone, 81.95, 99.6, [(81.95, -40), (83.3, -24), (95, -22), (98.6, -30), (99.3, -70)]), 1.0, 0.3), 81.95)
# "Echoes of Time v2": the opening (a G pedal) from 100.9 s, spliced into the track's own final cadence - the D chord
# (267.8 s in the track) resolving to G (270.6 s) - back-timed so the resolution lands with the end card, then a fade.
M2 = f"{A}/music/Echoes_of_Time_v2.mp3"
M2_START, M2_DOM, M2_TONIC = 100.9, 267.8, 270.6
t_dom = STING - (M2_TONIC - M2_DOM)
xf = 0.35                                    # equal-power crossfade over [t_dom - xf/2, t_dom + xf/2]
head = load(M2, 0, t_dom + xf / 2 - M2_START)
tail = load(M2, M2_DOM - xf / 2, END - (t_dom - xf / 2))
k = int(xf * SR)
ref_h = np.sqrt(np.mean(head[-int(1.5 * SR):] ** 2)); ref_t = np.sqrt(np.mean(tail[:int(1.5 * SR)] ** 2))
tail *= min(3.2, ref_h / max(ref_t, 1e-6))   # the outro is ~8 dB quieter than the opening: level-match the splice
cos = np.cos(np.linspace(0, math.pi / 2, k)).astype(np.float32)[:, None]
head[-k:] *= cos; tail[:k] *= cos[::-1]
mus2 = np.zeros((int((END - M2_START) * SR) + 1, 2), np.float32)
n_ = min(len(head), len(mus2)); mus2[:n_] += head[:n_]
i0 = len(head) - k; n_ = min(len(tail), len(mus2) - i0); mus2[i0: i0 + n_] += tail[:n_]
mus2 = env(mus2, M2_START, END, [(M2_START, -60), (102.5, -19), (114.9, -17), (STING - 0.5, -15), (STING + 0.4, -13), (min(STING + 1.2, END - 1.0), -13.5),
                                 (END - 0.25, -45), (END, -90)])
place(music, mus2, M2_START)
# side-chain duck under the narration
duck = 1.0 - 0.55 * np.clip(vo_env / 0.08, 0, 1)
music *= duck[:, None].astype(np.float32)


# ------------------------------------------------------------------ SFX events
def ev(n, t, db=0.0, pan=0.0, start=0.0, dur=None, lp=None, hp=None, rate=1.0, fi=0.005, fo=0.08, hit=None, duck=0.0, duck_after=0.05,
       eq=None):
    """Place mixkit_<n> at t. With hit=<s into the file>, that moment (the impact) lands on t instead of the file start.
    duck=<dB> pulls the sound down under the narration (after its first `duck_after` s, so the transient stays)."""
    x = load(sfx(n), start, dur, rate)
    if lp: x = filt(x, "lowpass", lp)
    if hp: x = filt(x, "highpass", hp)
    if eq: x = peq(x, *eq)
    if hit is not None: t -= (hit - start) / rate
    place(sfxb, fade(x, fi, fo), t, db, pan, duck, duck_after if hit is None else duck_after + (hit - start) / rate)


def stereo(y, peak=0.5):
    y = np.asarray(y, np.float32); y = y / (np.abs(y).max() + 1e-12) * peak
    return np.stack([y, y], 1)


def ui_pop(k=0):
    """Soft UI pop for an infographic chip: a quick upward pitch blip with a tiny click (pitch steps up per chip)."""
    n = int(0.12 * SR); t = np.arange(n) / SR
    f = (520 + 480 * (1 - np.exp(-t / 0.018))) * 1.06 ** k
    ph = 2 * np.pi * np.cumsum(f) / SR
    e = (1 - np.exp(-t / 0.0025)) * np.exp(-t / 0.03)
    y = (np.sin(ph) + 0.25 * np.sin(2 * ph) * np.exp(-t / 0.012)) * e
    clk = np.random.default_rng(100 + k).normal(0, 1, n) * np.exp(-t / 0.0012) * 0.12
    y = y + filt(clk[:, None].astype(np.float32), "highpass", 3000)[:, 0]
    return stereo(y)


def phone_error_beep():
    """Short two-tone 'call failed' beep from a small phone speaker (descending B5 -> F#5)."""
    parts = []
    for f0, d in ((988, 0.12), (740, 0.17)):
        t = np.arange(int(d * SR)) / SR
        e = np.minimum(1, t / 0.006) * np.minimum(1, (d - t) / 0.03)
        parts += [(np.sin(2 * np.pi * f0 * t) + 0.35 * np.sin(4 * np.pi * f0 * t) + 0.15 * np.sin(6 * np.pi * f0 * t)) * e, np.zeros(int(0.05 * SR))]
    y = filt(filt(np.concatenate(parts)[:, None].astype(np.float32), "highpass", 450), "lowpass", 4500)[:, 0]
    return stereo(y)


def scuff(d=0.28):
    """Boot sole skidding on frosted metal: band-passed noise with a grainy stick-slip flutter."""
    t = np.arange(int(d * SR)) / SR
    n = np.random.default_rng(11).normal(0, 1, len(t)).astype(np.float32)
    n = filt(filt(n[:, None], "highpass", 700), "lowpass", 5000)[:, 0]
    e = np.minimum(1, t / 0.02) * np.exp(-t / 0.11) * (0.75 + 0.25 * np.sin(2 * np.pi * 47 * t))
    return stereo(n * e)


def crinkle(t0, t1, db, gap=(0.14, 0.4)):
    """Foil-blanket crinkle: sparse bursts of crackly high-passed noise."""
    t = t0
    while t < t1:
        m = int(rng.uniform(0.03, 0.09) * SR)
        n = (rng.normal(0, 1, (m, 2)) * (rng.random((m, 2)) < 0.3) * 0.12).astype(np.float32)
        place(sfxb, fade(filt(n, "highpass", 3500), 0.002, 0.03), t, db + rng.uniform(-4, 3), rng.uniform(-0.3, 0.3))
        t += rng.uniform(*gap)


def chatter_grains():
    """The individual clicks of mixkit_1128 (its first 80 ms are digital silence), each cut 2 ms before its peak."""
    x = load(sfx(1128)); m = np.abs(x).max(axis=1); pk = []
    for i in np.argsort(-m):
        if m[i] < 0.3 * m.max(): break
        if all(abs(i - j) > int(0.02 * SR) for j in pk): pk.append(i)
    g = [x[max(0, p - int(0.002 * SR)): p + int(0.022 * SR)] for p in sorted(pk)]
    g = [filt(filt(c, "highpass", 900), "lowpass", 8000) for c in g]
    g = [c / np.abs(c).max() * 0.5 for c in g if np.abs(c).max() > 1e-4]
    if not g: raise RuntimeError("audio_mix: no audible click found in mixkit_1128 for the teeth chatter")
    return g


GRAINS = chatter_grains()


def chatter(t0, t1, db):
    t = t0
    while t < t1:
        r = rng.uniform(0.85, 1.25)
        clk = GRAINS[rng.integers(len(GRAINS))]
        x = signal.resample(clk, int(len(clk) / r)).astype(np.float32)
        place(sfxb, fade(x, 0.001, 0.008), t, db + rng.uniform(-3, 2), rng.uniform(-0.1, 0.1))
        t += rng.uniform(0.09, 0.15)


ev(538, 0.25, -21, 0.0, start=0.5, dur=3.4, lp=6000)                 # footsteps walking in
ev(168, SLAM, -20, -0.2, hit=0.32)                                   # whoosh peaking on the slam
# door slam: impact on the contact frame, with a dip at 1.6 kHz and its ring ducked under "slams shut"
ev(201, SLAM, -9, 0.1, start=0.155, fi=0.004, hit=0.193, eq=(1600, -6, 0.8), duck=9, duck_after=0.06)
ev(2849, SLAM + 0.06, -15, 0.1, hit=0.172, duck=6, duck_after=0.03)  # latch catches
ev(2300, SLAM, -19, start=2.08, dur=0.45, hit=2.12, hp=30, fo=0.15)  # sub knock (only the last pulse of the swell)
ev(2232, 5.3, -24, start=0.0, dur=1.6)                               # startled breath
ev(379, 11.7, -18, start=1.0, dur=2.2, duck=6, duck_after=0.0)        # straining at the door
# SH05: the fists never strike on screen; one muffled thump where the right fist comes down on the door (after "won't")
ev(2182, FIST_SH05, -13, 0.15, hit=0.052, lp=1800, duck=8, duck_after=0.05)
ev(2775, FIST_SH05, -22, 0.15, hit=0.0, lp=1200, duck=8, duck_after=0.05)
ev(2232, 14.2, -26, start=1.0, dur=3.0)

chatter(29.6, 34.0, -24); chatter(62.4, 65.0, -18); chatter(77.5, 81.2, -21); chatter(81.2, 81.9, -28); chatter(115.0, 117.5, -25)
ev(2232, 36.9, -16, start=0.2, dur=1.6, lp=5000)                     # big exhale
ev(2070, METAL, -17, 0.2, hit=0.004, dur=0.18, lp=1800, fo=0.06)      # palm on cold metal: soft dull tap
ev(1898, PHONE_OUT - 0.75, -20, start=0.45, dur=0.75, fi=0.1, fo=0.2)  # phone out of the bib pocket (cloth slide, no thump)
for t in (41.3, 41.9):
    ev(1924, t, -27, start=0.1, dur=0.08, hit=0.132, fo=0.02)        # phone screen taps: tiny clicks
place(sfxb, phone_error_beep(), 44.70, -21, duck=6)                  # "call failed" beep, after "...your signal."
ev(1473, 45.25, -19, duck=6, duck_after=0.1)                         # realisation whoosh
ev(2914, 46.3, -20, start=0.0, dur=JAM - 46.3, fo=0.12, duck=4, duck_after=0.0)   # riser into the release
# impact on the cut to the iced release: only the boom of 2917 (its first 6 s are a riser), sub only, gone before L11
ev(2917, JAM, -17, start=5.97, dur=1.9, hit=6.0, hp=35, lp=450, fi=0.003, fo=0.9, duck=4, duck_after=0.15)   # sub only: leaves 'But' clear
ev(2775, FIST_SH13, -15, 0.1, hit=0.0, lp=3000)                      # fist on the ice
ev(2159, FIST_SH13, -20, 0.1, hit=0.176, dur=0.6, lp=6000)           # icy knock layer
ev(1329, FIST_SH13 + 0.02, -27, hp=2500, dur=0.9, fo=0.4)            # ice crackle
ev(538, 52.05, -18, start=2.0, dur=1.3, rate=1.15)                   # hurrying steps (first footfall ~f1567)
place(sfxb, scuff(), SLIP, -20, -0.1, duck=4)                        # the slip
# the fall: body hit + metal + sub + effort on the frame his back hits the floor (then the picture cuts to black)
ev(2498, FALL, -9, hit=0.145, lp=2500, duck=5, duck_after=0.08)
ev(756, FALL, -15, hit=0.105, lp=3000, duck=5, duck_after=0.06)
ev(2300, FALL, -20, start=2.08, dur=0.45, hit=2.12, hp=30, fo=0.15)
ev(379, FALL + 0.02, -17, start=7.02, dur=0.35, hit=7.05, fo=0.12, duck=6, duck_after=0.0)
ev(167, 55.3, -18, duck=4)                                           # time-lapse
for t in SH15_CUTS: ev(168, t, -20, hit=0.32)                        # whooshes peaking on the jump cuts
ev(1329, 55.5, -24, hp=2800, dur=6.0, fi=0.5, fo=0.5)                # frost crackling
ev(2300, 61.04, -16, start=2.08, dur=0.45, hit=2.12, hp=30, fo=0.15)  # "hypothermia" hit (sub knock on the word)
ev(2232, 62.4, -20, start=0.0, dur=2.6)
ev(2839, PHONE_LAND, -12, 0.15, hit=0.145); ev(1124, PHONE_LAND, -20, hit=0.107)  # phone hits the floor
ev(538, 67.5, -22, start=5.0, dur=1.8, rate=0.85)                    # stagger
ev(1898, SIT, -20, start=1.0, dur=0.75, rate=0.8, hit=1.412, duck=5, duck_after=0.08)  # sits on cardboard
ev(1914, 82.3, -24, start=2.0, dur=12.0, fi=1.0, fo=1.0)            # slow breathing after the shivering stops
# tinnitus during the confusion POV
tt = np.arange(int(4.6 * SR)) / SR
tone = (0.02 * np.sin(2 * np.pi * 6200 * tt) * np.sin(np.pi * tt / 4.6) ** 2).astype(np.float32)
place(sfxb, np.stack([tone, tone], 1), 87.0, -6)
# heartbeat: the lub lands on every R spike the ECG overlay draws (no beats once the trace turns chaotic at 97.4 s)
hb = fade(filt(filt(load(sfx(490)), "lowpass", 900), "highpass", 32), 0.002, 0.1)
for ts in ecg_spike_times():
    place(sfxb, hb, ts - 0.010, -10 if ts < 95.5 else -13, duck=3)
# SH21: latch on the unlatch frame, creak through the swing, light-flood whoosh, Maya stepping in from the dock
ev(198, UNLATCH, -17, start=0.33, dur=0.5, hit=0.388, lp=2500, fo=0.15, duck=8, duck_after=0.02)
ev(200, UNLATCH + 0.02, -15, start=0.75, dur=DOOR_OPEN - UNLATCH, lp=6000, fi=0.08, fo=0.25, duck=6, duck_after=0.0)
ev(167, DOOR_OPEN, -22, hit=0.81, dur=1.1, fo=0.3, duck=6, duck_after=0.0)
ev(538, 100.30, -18, start=5.25, dur=0.8, lp=6000, fo=0.18)          # two steps in the doorway: 100.37, 100.81 s
crinkle(107.85, 108.45, -26)                                         # foil blanket settling as SH23 opens
crinkle(115.0, 117.4, -29, gap=(0.2, 0.5))                           # SH24a: shivering inside the foil
for k, ts in enumerate(FACTOR_T):
    place(sfxb, ui_pop(k), ts, -24, duck=8, duck_after=0.015)                          # factor chips
# door closes on its frame; the thud lands in the gap before "dead" and its ring is ducked under the word
ev(201, DOOR_CLOSE, -12, start=0.155, fi=0.004, hit=0.193, lp=2000, duck=14, duck_after=0.06)
ev(2849, DOOR_CLOSE + 0.05, -19, hit=0.172, lp=3000, duck=10, duck_after=0.03)
ev(780, STING, -16, hit=0.10, dur=END - (STING - 0.10) - 0.03, fo=1.2)  # end card (faded out before the end)

# ------------------------------------------------------------------ master
SPLIT = os.environ.get("AUDIO_MIX_STEMS")
buses = {"vo": vox, "music": music, "amb": mix, "sfx": sfxb}
for k_, b_ in buses.items():
    buses[k_] = filt(b_, "highpass", 25)
try:
    import pyloudnorm as pyln
    _meter = pyln.Meter(SR)
    def lufs(x): return _meter.integrated_loudness(x.astype(np.float64))
except Exception:
    pyln = None
    def lufs(x): return 20 * np.log10(np.sqrt(np.mean(x ** 2)) * 4 + 1e-9) - 6.0   # rough fallback


def bus_sum(): return buses["vo"] + buses["music"] + buses["amb"] + buses["sfx"]


def vo_limiter_gain(x, ceiling, look=0.004, rel=0.06):
    """Narration-bus peak limiter (lookahead, 60 ms release) so the master limiter only touches rare peaks."""
    pk = np.abs(x).max(axis=1); blk = SR // 1000; nb = -(-len(pk) // blk)
    pk = np.pad(pk, (0, nb * blk - len(pk))).reshape(nb, blk).max(axis=1)
    att = maximum_filter1d(np.maximum(0.0, 20 * np.log10(np.maximum(pk, 1e-9) / ceiling)), 2 * int(look * 1000) + 1)
    r = math.exp(-1.0 / (rel * 1000)); s = 0.0; out = np.empty_like(att)
    for i, a in enumerate(att):
        s = a if a > s else s * r; out[i] = s
    gdb = np.interp(np.arange(len(x)), np.arange(nb) * blk + blk / 2, out)
    return (10 ** (-uniform_filter1d(gdb, int(0.002 * SR)) / 20)).astype(np.float32)


def tp_limiter_gain(x, ceil):
    """True-peak limiter (-1.5 dBTP, so the AAC encode stays under -1 dBTP): 4x-oversampled peak estimate, then a hold
    (12 ms) + average (10 ms) gain curve, which never exceeds the gain each sample needs."""
    up = np.abs(resample_poly(x, 4, 1, axis=0)).max(axis=1)
    tp = up[: len(x) * 4].reshape(-1, 4).max(axis=1)
    need = np.minimum(1.0, ceil / np.maximum(tp, 1e-9))
    ra, rh = int(0.010 * SR), int(0.012 * SR)
    return uniform_filter1d(minimum_filter1d(need, 2 * rh + 1, mode="nearest"), 2 * ra + 1, mode="nearest")


ceil = 10 ** (-1.5 / 20)
VO_CEIL = 10 ** (-2.5 / 20)        # narration peak ceiling after the master gain (leaves the master limiter only rare, small peaks)
l0 = lufs(bus_sum())
print("LUFS before", round(l0, 1))
g = 10 ** ((-14.0 - l0) / 20)
vo_raw = buses["vo"]
for it in range(4):                # the narration limiter lowers the loudness, which raises the master gain: iterate
    vg = vo_limiter_gain(vo_raw, VO_CEIL / g)
    buses["vo"] = vo_raw * vg[:, None]
    g_new = 10 ** ((-14.0 - lufs(bus_sum())) / 20)
    if abs(20 * np.log10(g_new / g)) < 0.1: g = g_new; break
    g = g_new
sp = vo_env > 0.02
print("narration limiter: max %.1f dB, mean on speech %.2f dB" % (-20 * np.log10(vg.min()), -20 * np.mean(np.log10(vg[sp]))))
for it in range(3):
    mix = bus_sum() * g
    gain = tp_limiter_gain(mix, ceil)
    mix *= gain[:, None]
    l1 = lufs(mix)
    if abs(l1 + 14.0) < 0.05: break
    g *= 10 ** ((-14.0 - l1) / 20)
grd = -20 * np.log10(gain)
print("limiter: max gain reduction %.1f dB at %.2f s, %.2f%% of samples limited (%.2f%% by more than 1 dB; mean on speech %.2f dB)"
      % (grd.max(), grd.argmax() / SR, 100 * (gain < 0.999).mean(), 100 * (grd > 1).mean(), grd[sp].mean()))
# end: fade the programme to digital silence by END (the picture fades to black over the last 10 frames)
fe = np.ones(len(mix), np.float32); i0, i1 = int((END - 0.4) * SR), int(END * SR)
fe[i0:i1] = np.cos(np.linspace(0, math.pi / 2, i1 - i0)) ** 2; fe[i1:] = 0.0
mix *= fe[:, None]
pk = np.abs(mix).max()
if pk > ceil: mix *= ceil / pk
print("LUFS after", round(lufs(mix), 2))
import wave


def write(path, x):
    with wave.open(path, "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype("<i2").tobytes())


write(OUT, mix)
if SPLIT:
    os.makedirs(SPLIT, exist_ok=True)
    for k_, b_ in buses.items():
        write(os.path.join(SPLIT, f"stem_{k_}.wav"), b_ * (g * gain * fe)[:, None])
print("MIX", OUT, round(len(mix) / SR, 2), "s")
