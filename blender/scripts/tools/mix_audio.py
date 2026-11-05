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

def place(bus, x, t, gain_db=0.0, fade_in=0.0, fade_out=0.0, dur=None, loop=False, offset=0.0):
    a = int(t * SR)
    if loop:
        x = np.roll(x, -int(offset * SR) % len(x), axis=0)
    else:
        x = x[int(offset * SR):]
    if dur is not None:
        n = int(dur * SR)
        if loop and len(x) < n:
            x = np.concatenate([x] * (n // len(x) + 1))
        x = x[:n]
    x = x.copy() * 10 ** (gain_db / 20)
    if fade_in > 0:
        k = min(len(x), int(fade_in * SR)); x[:k] *= np.linspace(0, 1, k)[:, None]
    if fade_out > 0:
        k = min(len(x), int(fade_out * SR)); x[-k:] *= np.linspace(1, 0, k)[:, None]
    b = min(N, a + len(x)); mix[bus][a:b] += x[:b - a]

def span(sid): return shots[sid]

# ------------------------------------------------------------------ VO
vo = load(A + 'vo/vo_full.wav', 0.0)
place('vo', vo, 0.0)

# ------------------------------------------------------------------ ambience beds (hard switches at underwater cuts)
bed = load(A + 'sfx/ocean_bed.wav'); calm = load(A + 'sfx/ocean_bed_calm.wav'); wind = load(A + 'sfx/wind_bed.wav')
under = load(A + 'sfx/underwater_bed.wav'); rain = load(A + 'sfx/rain_bed.wav'); sparkle = load(A + 'sfx/sparkle.wav')
UNDER = ['SH02', 'SH10', 'SH15', 'SH16', 'SH17B']
def bed_for(sid):
    if sid in UNDER: return [(under, -10)]
    if sid in ('SH01',): return [(bed, -16), (wind, -14)]
    if sid in ('SH07', 'SH27', 'SH29'): return [(bed, -20), (wind, -13)]
    if sid in ('SH18', 'SH19', 'SH20', 'SH21', 'SH23', 'SH24'): return [(calm, -12), (wind, -24)]
    if sid == 'SH22': return [(bed, -14), (rain, -11)]
    return [(bed, -14), (wind, -26)]
off = 0.0
for sid, (t0, t1) in shots.items():
    for x, g in bed_for(sid):
        place('amb', x, t0, g, fade_in=0.04, fade_out=0.04, dur=t1 - t0, loop=True, offset=(off % 30.0))
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

# hook: low hit on the first frame, whoosh as the camera rockets up
place('sfx', hit, 0.0, -8, fade_out=1.0)
place('sfx', wu, 0.75, -6); place('sfx', wu, 1.3, -10)
# plunge to underwater + bubbles
t0 = span('SH02')[0]
place('sfx', wd, t0 - 0.25, -6); place('sfx', bub, t0, -4); place('sfx', bub, t0 + 1.8, -8); place('sfx', bubs, t0 + 3.0, -6)
# surfacing burst
t0 = span('SH03')[0]
splash(t0 + 0.32, -1, 5, 1.0); splash(t0 + 0.45, -6, 12, 0.8)
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
while t < t1:
    splash(t, -17, k * 3, 0.5); t += 0.714; k += 1
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
# helicopter: distant -> overhead -> hoist -> departing
def heli_lp(x, fc):
    sos = signal.butter(4, fc, 'lowpass', fs=SR, output='sos'); return signal.sosfiltfilt(sos, x, axis=0)
h_far = heli_lp(heli, 900)
t0 = span('SH25')[0]; t1 = span('SH25')[1]
place('sfx', h_far, t0 + 0.2, -20, fade_in=2.5, dur=t1 - t0 - 0.2, loop=True)
place('sfx', heli, t0 + 2.6, -18, fade_in=2.0, dur=t1 - t0 - 2.6, loop=True)
t0 = span('SH26')[0]; t1 = span('SH28')[1]
place('sfx', heli, t0, -7, fade_in=0.15, dur=span('SH26')[1] - t0, loop=True)
place('sfx', heli, span('SH27')[0], -12, dur=span('SH27')[1] - span('SH27')[0], loop=True, offset=3.0)   # aerial: further away
place('sfx', heli, span('SH28')[0], -8, dur=span('SH28')[1] - span('SH28')[0], loop=True, offset=5.0)
place('sfx', load(A + 'sfx/wind_bed.wav'), span('SH26')[0], -12, dur=span('SH26')[1] - span('SH26')[0], loop=True)  # downwash roar
t0, t1 = span('SH29')
place('sfx', heli_lp(heli, 1400), t0, -11, fade_out=t1 - t0 - 1.0, dur=t1 - t0, loop=True, offset=2.0)

# ------------------------------------------------------------------ music: tension underscore, then hope
LN3 = load(A + 'music/Long_Note_Three.mp3'); HOPE = load(A + 'music/Eternal_Hope.mp3')
switch = span('SH25')[0]
place('music', LN3, 0.0, -9, fade_in=1.5, fade_out=3.5, dur=switch + 1.5)
place('music', HOPE, switch - 0.5, -9, fade_in=2.5, fade_out=3.0, dur=TOTAL - switch + 0.5)

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
mix['music'] *= (1 - d * (1 - 10 ** (-8 / 20)))[:, None]
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
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', A + 'mix/stranded_premaster.wav', '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11',
                '-ar', str(SR), A + 'mix/stranded_mix.wav'], check=True)
print('wrote', A + 'mix/stranded_mix.wav')
