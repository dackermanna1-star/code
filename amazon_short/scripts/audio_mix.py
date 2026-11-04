"""Final soundtrack: VO + music (ducked) + ambiences + foley/SFX, all placed on the master timeline.
Output: audio/mix/final_mix.wav (48 kHz stereo)."""
import json, os, numpy as np, soundfile as sf, subprocess
R = '/home/user/code/amazon_short/'
A = R + 'audio/'
SR = 48000
TL = json.load(open(R + 'scripts/timeline.json'))
SH = {s['id']: s for s in TL['shots']}
T = TL['total']
N = int(T * SR) + SR
mix = {k: np.zeros((N, 2), np.float32) for k in ('vo', 'music', 'amb', 'sfx')}
_cache = {}


def load(name):
    if name in _cache: return _cache[name]
    p = name if os.path.isabs(name) else (A + 'sfx/' + name if os.path.exists(A + 'sfx/' + name) else A + name)
    d, sr = sf.read(p, dtype='float32', always_2d=True)
    if sr != SR:
        out = subprocess.run(['ffmpeg', '-v', 'quiet', '-i', p, '-ar', str(SR), '-ac', '2', '-f', 'f32le', '-'], capture_output=True).stdout
        d = np.frombuffer(out, np.float32).reshape(-1, 2)
    if d.shape[1] == 1: d = np.repeat(d, 2, 1)
    d = d[:, :2]
    pk = np.max(np.abs(d)) + 1e-9
    d = d / pk * 0.9   # peak-normalise every source, levels set by gain below
    _cache[name] = d
    return d


def db(x): return 10 ** (x / 20)


def place(bus, name, t0, dur=None, gain_db=0.0, src_off=0.0, fade_in=0.05, fade_out=0.3, loop=False, pan=0.0):
    d = load(name)
    s0 = int(src_off * SR)
    n = int((dur if dur else (len(d) - s0) / SR) * SR)
    if loop:
        reps = int(np.ceil((s0 + n) / len(d))) + 1
        d = np.concatenate([d] * reps)
    seg = d[s0:s0 + n].copy()
    n = len(seg)
    env = np.ones(n, np.float32)
    fi = int(fade_in * SR); fo = int(fade_out * SR)
    if fi > 0: env[:min(fi, n)] = np.linspace(0, 1, min(fi, n))
    if fo > 0: env[-min(fo, n):] *= np.linspace(1, 0, min(fo, n))
    seg *= env[:, None] * db(gain_db)
    if pan: seg *= np.array([1 - max(0, pan), 1 + min(0, pan)], np.float32)
    i0 = int(t0 * SR)
    i1 = min(N, i0 + n)
    mix[bus][i0:i1] += seg[:i1 - i0]


def st(sid, off=0.0): return SH[sid]['start'] + off
def en(sid): return SH[sid]['end']


# ---------------------------------------------------------------- voice-over
vo_env = np.zeros(N, np.float32)
for k, t0 in TL['vo'].items():
    d, sr = sf.read(f'{A}vo/{k}.wav', dtype='float32', always_2d=True)
    if sr != SR:
        out = subprocess.run(['ffmpeg', '-v', 'quiet', '-i', f'{A}vo/{k}.wav', '-ar', str(SR), '-ac', '1', '-f', 'f32le', '-'], capture_output=True).stdout
        d = np.frombuffer(out, np.float32)[:, None]
    d = np.repeat(d[:, :1], 2, 1)
    d = d / (np.max(np.abs(d)) + 1e-9) * 0.85
    i0 = int(t0 * SR); i1 = min(N, i0 + len(d))
    mix['vo'][i0:i1] += d[:i1 - i0]
    vo_env[i0:i1] = 1.0
# smooth ducking envelope (attack 80 ms, release 400 ms)
k = int(0.4 * SR); ker = np.ones(k, np.float32) / k
duck = np.convolve(vo_env, ker, mode='same'); duck = np.clip(duck * 1.5, 0, 1)

# ---------------------------------------------------------------- music
place('music', 'music/music_tense_cambodian_odyssey.wav', 0.0, dur=st('S22'), gain_db=-4, fade_in=1.5, fade_out=2.5)
place('music', 'music/music_tense_thunder_dreams.wav', st('S22') - 1.0, dur=st('S31') - st('S22') + 1.5, gain_db=-5, src_off=20, fade_in=2.5, fade_out=2.0)
place('music', 'music/music_hopeful_eternal_hope.wav', st('S32', 1.6) - 0.5, dur=T - st('S32') + 0.5, gain_db=-3, src_off=0, fade_in=2.0, fade_out=2.5)
mix['music'] *= (1 - 0.6 * duck)[:, None]

# ---------------------------------------------------------------- ambiences
place('amb', 'amb_day_rainforest_tambopata_peru.wav', 0.0, dur=st('S17') + 1.0, gain_db=-9, fade_in=0.5, fade_out=1.5)
place('amb', 'amb_day_amazon_screaming_piha_tauary.wav', 0.0, dur=6.0, gain_db=-14, src_off=10, fade_in=0.5, fade_out=2.0)
place('amb', 'macaws_flock_panama.wav', 0.8, dur=3.5, gain_db=-10, fade_in=0.3, fade_out=1.0, pan=-0.3)
place('amb', 'howler_monkeys_costa_rica.wav', st('S04') - 0.2, dur=5.5, gain_db=-11, src_off=2.0, fade_in=0.6, fade_out=1.5, pan=0.4)
place('amb', 'cicada_long_loud_song.wav', st('S11'), dur=9.0, gain_db=-14, fade_in=1.5, fade_out=2.0)
place('amb', 'water_stream_small_forest.wav', st('S13'), dur=st('S22') - st('S13') + 2.0, gain_db=-13, fade_in=1.0, fade_out=2.0)
place('amb', 'rain_heavy_tropical_thailand.wav', st('S17') + 0.3, dur=en('S18') - st('S17') + 0.5, gain_db=-7, fade_in=2.0, fade_out=2.0)
place('amb', 'rain_light_on_banana_leaves_veracruz.wav', st('S19'), dur=en('S19') - st('S19') + 1.5, gain_db=-11, fade_in=1.0, fade_out=1.5)
place('amb', 'amb_night_amazon_frogs_crickets_french_guiana.wav', st('S22') + 1.5, dur=en('S23') - st('S22') - 1.0, gain_db=-7, fade_in=3.0, fade_out=1.0)
place('amb', 'howler_monkeys_cicadas_brazil.wav', st('S22') + 4.0, dur=6.0, gain_db=-16, src_off=8.0, fade_in=1.0, fade_out=2.0, pan=-0.5)
place('amb', 'amb_day_rainforest_tambopata_peru.wav', st('S24'), dur=st('S31') - st('S24'), gain_db=-10, src_off=60, fade_in=0.4, fade_out=1.5)
place('amb', 'water_brook_creek.wav', st('S30'), dur=en('S30') - st('S30'), gain_db=-15, fade_in=1.0, fade_out=1.0)
place('amb', 'water_river_amazon_dawn_tauary.wav', st('S31'), dur=T - st('S31'), gain_db=-10, fade_in=1.2, fade_out=2.5)
place('amb', 'amb_day_rainforest_howlers_sunset_elmirador.wav', st('S31'), dur=T - st('S31'), gain_db=-12, src_off=20, fade_in=1.5, fade_out=2.5)

# ---------------------------------------------------------------- SFX / foley
place('sfx', 'thunder_distant_storm_brazil.wav', st('S17', 0.45), dur=7.0, gain_db=-4, src_off=30, fade_in=0.05, fade_out=2.5)
place('sfx', 'thunder_rolling_02.wav', st('S17', 0.55), dur=6.0, gain_db=-6, fade_in=0.02, fade_out=2.0)
steps = 'foley_footsteps_leaves_twigs_binaural.wav'
for sid, a, b, g in [('S02', 0, None, -12), ('S03', 0, 1.5, -12), ('S09', 0, None, -8), ('S10', 0, 4.0, -15), ('S11', 0, None, -14), ('S12', 0, 2.0, -12),
                     ('S13', 0, 1.2, -12), ('S21', 0, None, -13), ('S26', 0, 1.5, -11), ('S28', 1.2, None, -15), ('S30', 0, None, -12), ('S31', 0, 2.4, -12)]:
    t0 = st(sid, a); t1 = st(sid, b) if b else en(sid)
    place('sfx', steps, t0, dur=t1 - t0, gain_db=g, src_off=(hash(sid) % 20), fade_in=0.1, fade_out=0.3, loop=True)
place('sfx', 'foley_leaves_rustle_set.wav', st('S12', 0.8), dur=2.2, gain_db=-11, src_off=3)
place('sfx', 'foley_bush_rustle.wav', st('S13', 0.2), dur=1.4, gain_db=-9, src_off=2)
place('sfx', 'water_splashes_small_set.wav', st('S14', 1.0), dur=1.2, gain_db=-12)
place('sfx', 'water_splashes_small_set.wav', st('S16', 0.2), dur=1.6, gain_db=-11, src_off=4)
place('sfx', 'water_splash_splosh.wav', st('S18', 0.4), dur=5.0, gain_db=-20, src_off=5, loop=True)     # drip into bottle
place('sfx', 'human_panting_medium.wav', st('S11', 1.0), dur=8.0, gain_db=-17, fade_in=1.0, fade_out=1.0)
place('sfx', 'human_breathing_tired.wav', st('S07', 1.6), dur=2.6, gain_db=-15)
place('sfx', 'human_panting_fast.wav', st('S29'), dur=en('S30') - st('S29'), gain_db=-19, fade_in=1.0, fade_out=1.5, loop=True)
place('sfx', 'mosquito_buzz_close_binaural.wav', st('S24'), dur=en('S24') - st('S24') - 0.1, gain_db=-9, fade_in=0.2, fade_out=0.2)
place('sfx', 'foley_body_fall_dirt.wav', st('S24', 2.05), dur=0.4, gain_db=-12, src_off=1.0, fade_out=0.15)   # slap
place('sfx', 'heartbeat_human_fast.wav', st('S26', 1.3), dur=en('S28') - st('S26') - 1.0, gain_db=-11, fade_in=0.3, fade_out=1.5, loop=True)
place('sfx', 'foley_footsteps_single_leaves_mud_set.wav', st('S26', 1.4), dur=0.8, gain_db=-6)
place('sfx', 'boat_motor_distant_echoey.wav', st('S32', 1.3), dur=en('S32') - st('S32') + 2.0, gain_db=-8, fade_in=1.2, fade_out=1.0, loop=True, pan=-0.3)
place('sfx', 'boat_motor_cruising_by.wav', st('S33'), dur=en('S33') - st('S33') + 1.0, gain_db=-12, fade_in=1.0, fade_out=3.0, loop=True)
place('sfx', 'boat_motor_medium.wav', st('S34'), dur=T - st('S34'), gain_db=-18, fade_in=0.5, fade_out=3.0, loop=True)
place('sfx', 'parrots_tropical_birds_screaming.wav', st('S34', 1.0), dur=3.0, gain_db=-16, fade_in=0.4, fade_out=1.0, pan=0.4)

# ambience/sfx duck a little under VO too
mix['amb'] *= (1 - 0.35 * duck)[:, None]
mix['sfx'] *= (1 - 0.15 * duck)[:, None]
out = mix['vo'] * db(0) + mix['music'] * db(-15) + mix['amb'] * db(-3) + mix['sfx'] * db(-2)
out = out[:int(T * SR)]
# soft limiter
out = np.tanh(out * 1.2) / np.tanh(1.2)
os.makedirs(A + 'mix', exist_ok=True)
sf.write(A + 'mix/premix.wav', out, SR, subtype='PCM_24')
# loudness normalise to YouTube-friendly -14 LUFS / -1.5 dBTP
subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', A + 'mix/premix.wav', '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11', '-ar', '48000', A + 'mix/final_mix.wav'], check=True)
print('mix done', T)
