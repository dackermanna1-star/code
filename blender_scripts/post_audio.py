"""Mix voiceover, music, ambience and SFX into /opt/work/final_audio.wav (48 kHz stereo)."""
import json, glob, os, sys, numpy as np, soundfile as sf
from scipy.signal import resample_poly
sys.path.insert(0, '/opt/work'); sys.path.insert(0, '/opt/work/scripts')
from vo_lines import LINES

SR = 48000
DUR = 121.2
AUD = '/tmp/claude-0/-home-user-code/659d754b-575d-58e3-8842-cc6b5d903fda/scratchpad/audio'
FPS = 30
from post_audio_cfg import VO_START

def load(path):
    a, sr = sf.read(path, always_2d=True)
    a = a.astype(np.float32)
    if sr != SR:
        a = resample_poly(a, SR, sr, axis=0).astype(np.float32)
    if a.shape[1] == 1: a = np.repeat(a, 2, axis=1)
    return a[:, :2]

def db(x): return 10 ** (x / 20.0)

N = int(DUR * SR)
vo = np.zeros((N, 2), np.float32); mus = np.zeros((N, 2), np.float32); fx = np.zeros((N, 2), np.float32)

def place(buf, a, t, gain_db=0.0, fade_in=0.0, fade_out=0.0, length=None, pan=0.0, loop=False):
    s = int(t * SR)
    if s >= N: return
    if length is not None:
        L = int(length * SR)
        if loop and len(a) < L:
            a = np.concatenate([a] * (L // len(a) + 1))
        a = a[:L]
    a = a[:N - s].copy() * db(gain_db)
    n = len(a)
    if fade_in: k = min(n, int(fade_in * SR)); a[:k] *= np.linspace(0, 1, k)[:, None]
    if fade_out: k = min(n, int(fade_out * SR)); a[n - k:] *= np.linspace(1, 0, k)[:, None]
    if pan:
        a[:, 0] *= min(1, 1 - pan); a[:, 1] *= min(1, 1 + pan)
    buf[s:s + n] += a

# ---------------- voice (with light compression-ish normalisation + tiny room)
for key, txt in LINES:
    a = load('/opt/work/vo/%s.wav' % key)
    a = a / (np.abs(a).max() + 1e-6) * 0.85
    place(vo, a, VO_START[key], 0.0)
# subtle early reflection to glue the voice
rev = np.zeros_like(vo)
for d, g in ((0.023, 0.12), (0.041, 0.08), (0.067, 0.05)):
    k = int(d * SR); rev[k:] += vo[:-k] * g
vo = vo + rev

# ---------------- music
M = AUD + '/music/'
mu = [('music_wounded_melancholic_alt.wav', 0.0, 22.9, 0.0, -14, 0.5, 2.0),
      ('music_awkward_meeting_tense.wav', 22.4, 37.9, 3.0, -15, 1.0, 2.5),
      ('music_sad_trio_melancholic.wav', 37.4, 100.2, 0.0, -13, 2.5, 3.0),
      ('music_peaceful_desolation_ending.wav', 99.4, DUR, 0.0, -12, 3.0, 3.0)]
for f, t0, t1, off, g, fi, fo in mu:
    a = load(M + f)[int(off * SR):]
    place(mus, a, t0, g, fade_in=fi, fade_out=fo, length=t1 - t0, loop=True)

# ---------------- ambience beds per scene
S = AUD + '/sfx/'
def sfx(name): return load(S + name + '.wav')
amb = sfx('amb_airport_departures_hall'); amb2 = sfx('amb_airport_terminal_busy_crowd')
beds = [(0.0, 10.6, amb, -12), (17.8, 22.6, amb, -14), (33.8, 46.4, amb2, -15), (52.2, 66.0, amb, -15),
        (70.8, 78.6, amb2, -13), (78.6, 107.0, amb, -16), (107.0, DUR, amb2, -18)]
for t0, t1, a, g in beds:
    place(fx, a[int(t0 * 7 % 20 * SR):], t0, g, fade_in=0.4, fade_out=0.6, length=t1 - t0, loop=True)

# ---------------- shot SFX cues from the group builds
for j in sorted(glob.glob('/opt/work/groups/G*.json')):
    d = json.load(open(j))
    for f, name, gain, pan in d['sfx']:
        if name.startswith('amb_'): continue
        p = S + name + '.wav'
        if not os.path.exists(p): print('missing sfx', name); continue
        a = sfx(name)
        L = None
        if name in ('snore_man_loop',): L = 4.8
        if name in ('clock_wall_ticking',): L = 7.6
        if name in ('tap_sink_running',): L = 2.2
        if name in ('pencil_writing_long',): L = 1.8
        if name in ('heart_monitor_beep_67bpm',): L = 5.0
        if name in ('footsteps_hard_floor_reverb_loop',): L = 3.5
        if name in ('trolley_suitcase_wheels',): L = 3.2
        if name in ('camera_press_crowd_flashes',): L = 8.5
        if name in ('jet_takeoff',): L = 4.6
        place(fx, a, (f - 1) / FPS, gain, fade_out=0.3 if L else 0.05, length=L, pan=pan)

# transition whooshes (whip cuts) and soft impacts (dips)
TRANS = json.load(open('/opt/work/transitions.json'))
for tr in TRANS:
    t = (tr['frame'] - 1) / FPS
    if tr['type'] == 'whip': place(fx, sfx('whoosh_air'), t - 0.25, -13)
    if tr['type'] == 'flash': place(fx, sfx('whoosh_tunnel_reverb'), t - 0.6, -15)

# ---------------- ducking: music & fx dip under the voice
env = np.abs(vo).max(axis=1)
win = int(0.25 * SR)
cs = np.concatenate([[0.0], np.cumsum(env, dtype=np.float64)])
idx = np.arange(len(env)); lo = np.clip(idx - win // 2, 0, len(env)); hi = np.clip(idx + win // 2, 0, len(env))
env = ((cs[hi] - cs[lo]) / np.maximum(1, hi - lo)).astype(np.float32)
duck = 1.0 - 0.55 * np.clip(env / 0.15, 0, 1)
mus *= duck[:, None]
fx *= (1.0 - 0.3 * np.clip(env / 0.15, 0, 1))[:, None]

mix = vo * db(0) + mus + fx
# end fade
k = int(2.0 * SR); mix[-k:] *= np.linspace(1, 0, k)[:, None]
peak = np.abs(mix).max()
mix = np.tanh(mix / peak * 1.1) * 0.89
sf.write('/opt/work/final_audio.wav', mix, SR, subtype='PCM_16')
print('audio ok', mix.shape, 'peak', peak)
