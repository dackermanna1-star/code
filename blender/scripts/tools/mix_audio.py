"""Mix the soundtrack for "Stranded": VO + music (ducked) + ambience beds + synced SFX.
Run with /opt/tts/bin/python. Output: audio/mix/stranded_mix.wav (48 kHz stereo)."""
import json, numpy as np, soundfile as sf, subprocess, os
from scipy import signal
SR = 48000
A = '/home/user/code/audio/'
shots = {s[0]: (s[1], s[2]) for s in json.load(open('/home/user/code/story/shots.json'))['shots']}
TOTAL = shots['SH29'][1]
N = int(TOTAL * SR) + SR
mix = {k: np.zeros((N, 2)) for k in ('vo', 'music', 'amb', 'sfx')}

def load(path, gain_db=0.0):
    if not path.endswith('.wav'):
        tmp = '/tmp/claude-0/-home-user-code/73c477af-b034-5106-8934-46dafc95cd58/scratchpad/_dec.wav'
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', path, '-ar', str(SR), '-ac', '2', tmp], check=True); path = tmp
    x, sr = sf.read(path, always_2d=True)
    if sr != SR:
        x = signal.resample_poly(x, SR, sr, axis=0)
    if x.shape[1] == 1: x = np.repeat(x, 2, 1)
    return x * 10 ** (gain_db / 20)

def ns(sec): return int(round(sec * SR))    # seconds -> samples (round: int() truncation dropped a sample at e.g. 104.3 s)

def place(bus, x, t, gain_db=0.0, fade_in=0.0, fade_out=0.0, dur=None, loop=False, offset=0.0, eqp=False):
    # eqp: equal-power (sine) fades, so a crossfade between two uncorrelated loops keeps a constant level
    ramp = (lambda k: np.sin(np.linspace(0, np.pi / 2, k))) if eqp else (lambda k: np.linspace(0, 1, k))
    a = ns(t)
    if loop:
        x = np.roll(x, -ns(offset) % len(x), axis=0)
    else:
        x = x[ns(offset):]
    if dur is not None:
        n = ns(dur)
        if loop and len(x) < n:
            x = np.concatenate([x] * (n // len(x) + 1))
        x = x[:n]
    x = x.copy() * 10 ** (gain_db / 20)
    if fade_in > 0:
        k = min(len(x), ns(fade_in)); x[:k] *= ramp(k)[:, None]
    if fade_out > 0:
        k = min(len(x), ns(fade_out)); x[-k:] *= ramp(k)[::-1, None]
    if a < 0: x = x[-a:]; a = 0                 # a crossfade overlap reaching before 0 s
    b = min(N, a + len(x)); mix[bus][a:b] += x[:b - a]

# consecutive per-shot loops (beds, helicopter) overlap by 2*XF across each cut with equal-power fades, instead of a
# hard splice or a fade to silence on both sides (those read as ticks / drop-outs on the cut)
XF = 0.05

def span(sid): return shots[sid]

# ------------------------------------------------------------------ VO
vo = load(A + 'vo/vo_full.wav', 0.0)
place('vo', vo, 0.0)

# ------------------------------------------------------------------ ambience beds (switch at the cuts with a short crossfade)
bed = load(A + 'sfx/ocean_bed.wav'); calm = load(A + 'sfx/ocean_bed_calm.wav'); wind = load(A + 'sfx/wind_bed.wav')
under = load(A + 'sfx/underwater_bed.wav'); rain = load(A + 'sfx/rain_bed.wav'); sparkle = load(A + 'sfx/sparkle.wav')
rain_rec = load(A + 'sfx_src/rain_rec.wav'); rain_rec = rain_rec / (np.abs(rain_rec).max() + 1e-9) * 0.7   # public-domain recording
UNDER = ['SH02', 'SH10', 'SH15', 'SH16', 'SH17B']
def bed_for(sid):
    if sid in UNDER: return [(under, -10)]
    if sid in ('SH01',): return [(bed, -16), (wind, -14)]
    if sid in ('SH07', 'SH27', 'SH29'): return [(bed, -20), (wind, -13)]
    if sid in ('SH18', 'SH19', 'SH20', 'SH21', 'SH23', 'SH24'): return [(calm, -12), (wind, -24)]
    if sid == 'SH22': return [(bed, -12), (wind, -14)]    # grey, windy morning (no rain: it would contradict the thirst narration)
    return [(bed, -14), (wind, -26)]
off = 0.0
for sid, (t0, t1) in shots.items():
    for x, g in bed_for(sid):
        place('amb', x, t0 - XF, g, fade_in=2 * XF, fade_out=2 * XF, dur=t1 - t0 + 2 * XF, loop=True, offset=(off % 30.0),
              eqp=True)
    off += 7.3
    if sid == 'SH21': place('amb', sparkle, t0 + 0.4, -14, fade_in=0.5, fade_out=1.0, dur=t1 - t0 - 0.4, loop=True)

# ------------------------------------------------------------------ SFX events
sp = load(A + 'sfx_src/bathtub_splashes.wav'); onsets = json.load(open(A + 'sfx_src/splash_onsets.json'))
def splash(t, gain_db=-6, i=0, dur=0.7):
    o = onsets[i % len(onsets)]
    place('sfx', sp, t - 0.03, gain_db, fade_out=0.25, dur=dur, offset=max(0, o - 0.03))
bub = load(A + 'sfx/bubbles_burst.wav'); bubs = load(A + 'sfx/bubbles_small.wav')
wu = load(A + 'sfx/whoosh_up.wav'); wd = load(A + 'sfx/whoosh_down.wav'); hit = load(A + 'sfx/sub_hit.wav')
hb = load(A + 'sfx/heartbeat.wav'); heli = load(A + 'sfx/heli_synth.wav')
hb = np.repeat(hb[:, :1], 2, 1)    # heartbeat in mono: its L/R Haas delay nearly phase-inverts the 52 Hz thump (-9 dB on mono playback)

# hook: low hit on the first frame, whoosh as the camera rockets up
place('sfx', hit, 0.0, -8, fade_out=1.0)
place('sfx', wu, 0.75, -6); place('sfx', wu, 1.3, -10)
# plunge to underwater + bubbles
t0 = span('SH02')[0]
place('sfx', wd, t0 - 0.25, -6); place('sfx', bub, t0, -4); place('sfx', bub, t0 + 1.8, -8); place('sfx', bubs, t0 + 3.0, -6)
# surfacing burst: the head breaks the surface at ~10.30 s (SH03 local frame 4), spray peaks ~10.4 s.
# Onset 5 builds for 0.17 s (low slosh) before its attack (-10 dB point) and crests 0.31 s in, so start it 0.04 s
# before the cut: attack ~10.30 s, crest ~10.44 s. Onset 12 attacks at once: 0.12 s after the main attack.
t0 = span('SH03')[0]
splash(t0 - 0.04, -1, 5, 1.0); splash(t0 + 0.22, -6, 12, 0.8)
for k, tt in enumerate((1.25, 1.8)): splash(t0 + tt, -14, 20 + k, 0.4)
# panicked treading in SH04 (small sloshes)
t0, t1 = span('SH04')
for k in range(6): splash(t0 + 0.3 + k * 0.55, -16, 30 + k, 0.45)
# frantic crawl: each arm entry ~ every 0.53 s
t0, t1 = span('SH06')
k = 0; t = t0 + 0.15
while t < t1:
    splash(t, -7, k * 3, 0.55); t += 0.526; k += 1
t0, t1 = span('SH07')
t = t0 + 0.2
while t < t1 - 0.3:          # SH08 is the silent struggle: no stroke may ring on past the cut
    splash(t, -17, k * 3, min(0.5, t1 - t)); t += 0.714; k += 1
# silent struggle: no splashing - only muffled bloops when his mouth dips
t0 = span('SH08')[0]
for d in (18, 62, 104): place('sfx', bubs, t0 + d / 30 + 0.2, -16, dur=0.8, fade_out=0.3)
# float transition: one soft slosh as he leans back
splash(span('SH09')[0] + 1.6, -15, 9, 0.8)
# underwater silhouette
place('sfx', bubs, span('SH10')[0] + 0.3, -14)
# time-lapse whoosh
place('sfx', wu, span('SH11')[0] - 0.2, -8); place('sfx', wd, span('SH11')[1] - 0.6, -12)
# drinking: hands scoop water, then spit
t0 = span('SH13')[0]
splash(t0 + 30 / 30, -14, 14, 0.5); splash(t0 + 50 / 30, -18, 16, 0.5)
place('sfx', bubs, t0 + 72 / 30, -24, dur=0.5)          # dribble
splash(t0 + 112 / 30, -12, 18, 0.45)                    # spit
# science insert: whoosh in, glass fills (bubbly), whoosh out
t0 = span('SH14')[0]
place('sfx', wu, t0 - 0.25, -6); place('sfx', bubs, t0 + 0.3, -12); place('sfx', bubs, t0 + 3.4, -10)
place('sfx', wd, span('SH14')[1] - 0.5, -9)
# shark: heartbeat under SH16-SH17B, low hit when it appears
t0 = span('SH16')[0]; t1 = span('SH17B')[1]
place('sfx', hit, t0 + 0.2, -12, fade_out=1.5)
place('sfx', hb, t0, -6, fade_in=0.8, fade_out=1.2, dur=t1 - t0 + 0.6, loop=True)
# sunset transition
place('sfx', wd, span('SH18')[0] - 0.3, -12)
# mirage shimmer
place('sfx', wu, span('SH23')[0] + 0.3, -16); place('sfx', wd, span('SH23')[0] + 2.0, -14)
# helicopter: distant -> overhead -> hoist -> departing (one loop per shot, crossfaded with its neighbours at the cuts)
def heli_lp(x, fc):
    sos = signal.butter(4, fc, 'lowpass', fs=SR, output='sos'); return signal.sosfiltfilt(sos, x, axis=0)
def lp_sweep(x, t_start, ta, tb, fa, fb):
    """Low-pass x (which starts at timeline time t_start) with a 4th-order Butterworth magnitude whose cutoff sweeps
    geometrically fa -> fb over timeline ta..tb (unfiltered before ta, held at fb after tb). STFT, zero phase."""
    f, ft, Z = signal.stft(x.T, SR, nperseg=2048)
    fc = fa * (fb / fa) ** np.clip((t_start + ft - ta) / (tb - ta), 0, 1)
    g = 1 / np.sqrt(1 + (f[:, None] / fc[None, :]) ** 8); g[:, t_start + ft < ta] = 1.0
    return signal.istft(Z * g, SR, nperseg=2048)[1].T[:len(x)]
def shot_loop(sid, x, gain_db, offset=0.0):
    t0, t1 = span(sid)
    place('sfx', x, t0 - XF, gain_db, fade_in=2 * XF, fade_out=2 * XF, dur=t1 - t0 + 2 * XF, loop=True, offset=offset, eqp=True)
h_far = heli_lp(heli, 900)
t0 = span('SH25')[0]; t1 = span('SH25')[1]
# distant rotor thump is audible before he lifts his head (~95.1 s), then grows into the SH26 hover
place('sfx', h_far, t0 + 0.3, -5, fade_in=0.6, fade_out=2 * XF, dur=t1 - t0 - 0.3 + XF, loop=True)
place('sfx', heli, t0 + 1.8, -13, fade_in=3.0, fade_out=2 * XF, dur=t1 - t0 - 1.8 + XF, loop=True)
shot_loop('SH26', heli, -7)
shot_loop('SH27', heli, -9, offset=3.0)    # low orbit, ~16 m away
shot_loop('SH28', heli, -9, offset=5.0)    # (offsets keep each segment inside the 14 s loop: no wrap step)
shot_loop('SH26', wind, -12)               # downwash roar
# SH29: it hovers while he is reeled in (to ~121.9 s, local frame 92), then departs and shrinks to a dot by ~123.9 s.
# Full band at the cut; -4 dB eased in over the hover as the camera climbs, then from 122 s a dB-linear fade
# (-18 dB at 125 s, same slope on to the end) with a low-pass swept 8 kHz -> 1 kHz over 121-125 s. The music carries the end.
t0, t1 = span('SH29')
dep = np.roll(heli, -ns(2.0), axis=0)[:ns(t1 - t0 + XF)]
tt = t0 - XF + np.arange(len(dep)) / SR                       # timeline time of each sample
# the camera starts climbing away at the cut, so ease the level down a little through the hover (-4 dB by 122 s)
g_db = -4.0 * np.clip((tt - 119.8) / 2.2, 0, 1) + np.clip(tt - 122.0, 0, None) * (-14.0 / 3.0)
dep = lp_sweep(dep * 10 ** (g_db / 20)[:, None], t0 - XF, 121.0, 125.0, 8000, 1000)
place('sfx', dep, t0 - XF, -9, fade_in=2 * XF, eqp=True)

# ------------------------------------------------------------------ music: tension underscore, then hope
LN3 = load(A + 'music/Long_Note_Three.mp3'); HOPE = load(A + 'music/Eternal_Hope.mp3')
switch = span('SH25')[0]
place('music', LN3, 0.0, -9, fade_in=1.5, fade_out=3.5, dur=switch + 1.5)
# Eternal Hope's new section lifts on its first downbeat 83.80 s into the track: put it on the cut to the hover (SH26).
# The 2.5 s fade-in (93.6-96.1 s, a quiet stretch of the track) overlaps the Long Note Three fade-out (92.1-95.6 s).
h_start = switch - 0.5
place('music', HOPE, h_start, -7, fade_in=2.5, fade_out=3.0, dur=TOTAL - h_start, offset=83.80 - (span('SH26')[0] - h_start))
# Long Note Three swells to the level of the narration under "You look around. / No boat. No land. / Just horizon":
# dip the music 5 dB over 15.4-18.7 s (dB-linear ramps of 0.4 s in, 0.5 s out)
mix['music'] *= 10 ** (np.interp(np.arange(N) / SR, [15.0, 15.4, 18.7, 19.2], [0, -5, -5, 0]) / 20)[:, None]

# ------------------------------------------------------------------ ducking: music & ambience dip under the voice
env = np.abs(mix['vo']).max(1)
win = int(0.05 * SR)
env = np.sqrt(np.convolve(env ** 2, np.ones(win) / win, 'same'))
act = (env > 0.02).astype(float)
# attack 60 ms, release 450 ms
def smooth(a, att, rel):
    out = np.zeros_like(a); y = 0.0
    ka = 1 - np.exp(-1 / (att * SR)); kr = 1 - np.exp(-1 / (rel * SR))
    for i in range(0, len(a), 64):
        tgt = a[i]; k = ka if tgt > y else kr
        y += (tgt - y) * (1 - (1 - k) ** 64)
        out[i:i + 64] = y
    return out
d = smooth(act, 0.06, 0.45)
duck_db = np.where(np.arange(N) < int(switch * SR), -8.0, -6.0)     # lighter ducking under the hope cue
mix['music'] *= (1 - d * (1 - 10 ** (duck_db / 20)))[:, None]
mix['amb'] *= (1 - d * (1 - 10 ** (-4 / 20)))[:, None]

final = mix['vo'] * 1.0 + mix['music'] * 10 ** (4 / 20) + mix['amb'] * 10 ** (-3 / 20) + mix['sfx'] * 10 ** (-4 / 20)
final = final[:int(TOTAL * SR)]
k = int(1.2 * SR); final[-k:] *= np.linspace(1, 0, k)[:, None] ** 1.5    # fade out with the picture
os.makedirs(A + 'mix', exist_ok=True)
for name in ('vo', 'music', 'amb', 'sfx'):
    sf.write(A + 'mix/stem_%s.wav' % name, mix[name][:int(TOTAL * SR)].astype(np.float32), SR)
peak = np.abs(final).max()
sf.write(A + 'mix/stranded_premaster.wav', (final / max(peak, 1.0) * 0.98).astype(np.float32), SR)
print('premaster', TOTAL, 's peak', peak)
# loudness normalise for YouTube (~ -14 LUFS, -1 dBTP)
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', A + 'mix/stranded_premaster.wav', '-af', 'loudnorm=I=-14:TP=-2.2:LRA=11',
                '-ar', str(SR), A + 'mix/stranded_mix.wav'], check=True)
print('wrote', A + 'mix/stranded_mix.wav')
