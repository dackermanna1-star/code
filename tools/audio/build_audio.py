#!/usr/bin/env python3
"""Regenerate the brawler's sound-effects library (public/audio) from CC0 packs
on OpenGameArt.

    python3 -I tools/audio/build_audio.py [--src DIR] [--out public/audio]
                                          [--credits CREDITS.md] [--no-fetch]
                                          [--refresh-pages]

    --src defaults to $AUDIO_SRC_DIR or <tmp>/brawler-audio-src (~125 MB of
    downloads, mostly the medieval weapon-impact pack; ~350 MB once
    extracted).  Needs ffmpeg with libsoxr, numpy and (for .7z packs) py7zr.
    The output is deterministic: a run from fresh downloads reproduces
    public/audio bit for bit.

Steps
  1. fetch   - download every pack referenced in SELECTION below into its own
               directory <src>/<slug>/ (page.html, dl/, x/), re-verify on the
               OpenGameArt page that the license is CC0, extract archives with
               path checks (see fetch_packs.py).  Downloaded data is treated as
               untrusted: it is only decoded by ffmpeg, never executed.
  2. render  - for every hard-coded selection: decode -> (channel pick / slice
               / pitch / filter / layer mix) -> finish:
                 * mono (channel average, or one channel of dual-mono
                   files whose channels hold different takes), 44.1 kHz
                   (soxr), 30 Hz high-pass (DC / rumble)
                 * leading silence trimmed: cut <= 5 ms before the onset, the
                   pre-roll gets a short fade-in so the transient stays sharp
                 * trailing silence trimmed (10 ms RMS below peak+tail_db or
                   the whole source file's noise floor + 6 dB); optional max
                   length; a longer cosine decay when a sound had to be
                   shortened or the source itself stops abruptly; 20 ms
                   fade-out
                 * peak normalised to -1 dBFS, 16-bit PCM WAV
               Ambience loops: 22050 Hz mono, equal-power crossfaded loop.
  3. write   - public/audio/<category>/<category>_NN.wav, manifest.json
  4. verify  - ffprobe every file (mono / rate / s16), manifest paths exist,
               total size budget.
  5. credits - (re)write the "Audio" section of CREDITS.md between markers,
               leaving any other content untouched.

All selection decisions (which file, which channel, which slice, layering)
are hard-coded in SELECTION; analyze_sources.py is the helper that was used to
make them (durations, envelopes, spectral centroid, onset sharpness, clipping).
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import wave

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)  # our own (trusted) tools directory only
import numpy as np  # noqa: E402

import audiolib as al  # noqa: E402
import fetch_packs  # noqa: E402

REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
SR = 44100
AMB_SR = 22050
PEAK_DBFS = -1.0
PRE_ROLL_MS = 5.0
FADE_OUT_MS = 20.0
MIN_FADE_IN = 24          # samples (~0.5 ms) when a sound starts right at its onset
HIGHPASS_HZ = 30          # DC / sub-rumble removal on every source
SIZE_BUDGET = 12 * 1024 * 1024


# ---------------------------------------------------------------------------
# Selection helpers
# ---------------------------------------------------------------------------
def E(pack, path, **kw):
    """One source file. kw: ch (channel index; default = average of channels),
    t=(start, end) slice in seconds, pitch (semitones, tape-style), af (ffmpeg
    filter), gain_db / offset_ms (when used as a layer), note, plus finishing
    overrides onset_db / tail_db / max_len / fade_out_ms."""
    d = {"pack": pack, "path": path}
    d.update(kw)
    return d


def LAYER(*layers, **kw):
    """Mix of several sources, each aligned on its own onset (+offset_ms)."""
    d = {"layers": list(layers)}
    d.update(kw)
    return d


HITS = "37-hitspunches"
QPUNCH = "punch"
QIMPACT = "impact"
TFLOOR = "12-wet-towel-hittingfallingpunching-floor-sounds"
TBODY = "40-wet-towel-clubpoundhitattack-sounds"
MELEE3 = "3-melee-sounds"
SPLAT8 = "8-wet-squish-slurp-impacts"
WOOD35 = "35-wooden-crackshitsdestructions"
SQUISH = "squish-sounds-effects"
DEEPB = "deep-bone-crackbreak-sfx"
WETB = "fleshy-bone-breaksnap-sfx"
BLOCKS = "10-impactshield-blocks"
SWORDS = "20-sword-sound-effects-attacks-and-clashes"
MEDI = "medieval-sound-effects-weapon-impacts"
SWISH13 = "swishes-sound-pack"
BMAC = "metal-impact-sounds"
QMETAL = "metal-interactions"
RD_MW = "100-cc0-metal-and-wood-sfx"
RD_BFH = "75-cc0-breaking-falling-hit-sfx"
RD_2 = "100-cc0-sfx-2"
RD_80 = "80-cc0-rpg-sfx"
GRUNTS = "grunts-male-death-and-pain"
QVOCAL = "15-vocal-male-strainhurtpainjump-sounds"
VO = "voiceover-pack-fighter-40-taunts"
FACTORY = "factory-ambiance"
RAIN = "amb-rain-loop-1"
RPGPACK = "rpg-sound-pack"
BAMBOO = "swish-bamboo-stick-weapon-swhoshes"
FANTOZZI = "fantozzis-footsteps-grasssand-stone"
TINYSTEPS = "different-steps-on-wood-stone-leaves-gravel-and-mud"
MANHURT = "man-hurt-sounds"
EMO_PAIN = "pain-sounds-by-emopreben"
EMO_PLAYER = "playersounds-1-by-emopreben"
THWACK = "thwack-sounds"
PUMPKIN = "break-pumpkin"
PUMPKIN_CUT = "cut-peel-a-pumpkin"
SPRING = "various-sound-effects-0"

GRUNTS_WAV = "death pain grunts.wav"
H = "hits/hit{:02d}.mp3.flac".format
TB = "wet_towel_on_body/wet_towel_on_body-{:02d}.flac".format
TF = "wet_towel_on_floor/wet_towel_on_floor-{:02d}.flac".format
QP = "qubodupPunch/qubodupPunch{:02d}.flac".format
BAM = "swosh-{:02d}.flac".format
SS = "slightscream-{:02d}.flac".format
EMO_JUMP = "Playersounds - Wav/Playersounds - Track 9 - Jump.wav"
EMO_JUMP2 = "Playersounds - Wav/Playersounds - Track 10 - Jump2.wav"

# Per-category finishing defaults.
#   onset_db: level (re. peak) that counts as the onset; impacts use a high
#             value (-12 dB) so the soft swish / scuff lead-ins that several
#             packs put before the actual hit are cut and the hit starts
#             within 5 ms; vocals, whooshes and speech keep their natural rise.
#   tail_db:  trailing trim threshold re. envelope peak.
#   max_len:  seconds (sounds longer than this get a cosine decay to fit).
CATEGORY_DEFAULTS = {
    "punch_light": dict(onset_db=-12, tail_db=-45, max_len=0.6),
    "punch_heavy": dict(onset_db=-12, tail_db=-45, max_len=0.8),
    "kick": dict(onset_db=-12, tail_db=-45, max_len=0.8),
    "body_hit": dict(onset_db=-12, tail_db=-45, max_len=0.7),
    "face_crunch": dict(onset_db=-12, tail_db=-45, max_len=0.8),
    "bone_break": dict(onset_db=-14, tail_db=-45, max_len=0.9),
    "block": dict(onset_db=-12, tail_db=-45, max_len=0.6),
    "parry": dict(onset_db=-12, tail_db=-45, max_len=0.6),
    "whoosh_light": dict(onset_db=-40, tail_db=-45, max_len=0.5),
    "whoosh_heavy": dict(onset_db=-40, tail_db=-45, max_len=0.8),
    "sword_swing": dict(onset_db=-40, tail_db=-45, max_len=0.8),
    "sword_clash": dict(onset_db=-12, tail_db=-48, max_len=0.9),
    "blade_flesh": dict(onset_db=-24, tail_db=-45, max_len=0.8),
    "club_hit": dict(onset_db=-12, tail_db=-45, max_len=0.7),
    "wood_break": dict(onset_db=-15, tail_db=-45, max_len=1.0),
    "metal_hit": dict(onset_db=-12, tail_db=-45, max_len=1.2),
    "body_fall": dict(onset_db=-12, tail_db=-45, max_len=0.8),
    "footstep": dict(onset_db=-15, tail_db=-42, max_len=0.4),
    "squish": dict(onset_db=-20, tail_db=-45, max_len=0.8),
    "grunt_attack": dict(onset_db=-40, tail_db=-45, max_len=1.2),
    "grunt_pain": dict(onset_db=-40, tail_db=-45, max_len=1.2),
    "death": dict(onset_db=-40, tail_db=-45, max_len=2.0),
    "announcer": dict(onset_db=-40, tail_db=-48, max_len=2.5),
}

# ---------------------------------------------------------------------------
# The library.  Order = file numbering.
# ---------------------------------------------------------------------------
SELECTION = {
    # quick jabs / slaps: bright, short single-channel hits + towel slaps
    "punch_light": [
        E(HITS, H(10), ch=0, note="bright jab (left channel of a dual-mono file)"),
        E(HITS, H(11), ch=0, note="snappy jab (left channel)"),
        E(HITS, H(12), ch=1, note="crisp jab (right channel)"),
        E(HITS, H(13), ch=0, note="jab (left channel)"),
        E(HITS, H(15), ch=0, note="jab (left channel)"),
        E(HITS, H(18), ch=0, note="light hit (left channel)"),
        E(TBODY, TB(15), note="wet slap"),
        E(TBODY, TB(23), note="short wet slap"),
    ],
    # heavy punches / haymakers: low centroid, longer decay
    "punch_heavy": [
        E(QPUNCH, QP(1), note="heavy punch"),
        E(QPUNCH, QP(4), note="heavy punch"),
        E(QPUNCH, QP(5), note="heavy punch"),
        E(HITS, H(26), note="heavy body punch"),
        E(HITS, H(27), note="heavy punch"),
        E(HITS, H(28), note="heavy punch, very sharp attack"),
        E(HITS, H(29), note="heavy punch"),
        E(HITS, H(2), ch=1, note="haymaker thump (right channel)"),
    ],
    # deep heavy thuds
    "kick": [
        E(QPUNCH, QP(3), note="deep thud (lowest-centroid punch of the pack)"),
        E(QPUNCH, QP(2), note="deep thud"),
        E(HITS, H(10), ch=1, note="deep body thud (right channel)"),
        E(TFLOOR, TF(3), note="deep wet thud"),
        E(RD_2, "sfx100v2_hit_02.ogg", note="short heavy hit"),
        E(HITS, H(7), ch=0, pitch=-3, max_len=0.5, note="heavy thump pitched down 3 semitones (substitute)"),
    ],
    # wet thumps to the body (wet towel on a human back, low-mid centroid)
    "body_hit": [
        E(TBODY, TB(4), note="wet body thump"),
        E(TBODY, TB(6), note="wet body thump"),
        E(TBODY, TB(25), note="wet body thump"),
        E(TBODY, TB(26), note="wet body thump"),
        E(TBODY, TB(34), note="wet body thump, longer"),
        E(QIMPACT, "qubodupImpact/qubodupImpactMeat02.flac", note="meaty impact"),
    ],
    # wet crunchy face impacts: pumpkin smashes, splats, punch+crunch layers
    "face_crunch": [
        E(PUMPKIN, "pumpkin_break_01.ogg", note="pumpkin smash (crunchy, bone-like)"),
        E(PUMPKIN, "pumpkin_break_02.ogg", ch=0, note="pumpkin smash (left channel)"),
        E(SPRING, "snd_splathit.wav", note="wet splat hit"),
        LAYER(E(HITS, H(5), ch=0, onset_db=-10), E(WETB, "Wet Break 2.wav", onset_db=-8, gain_db=-6, offset_ms=12),
              note="layered: punch + wet bone crack"),
        LAYER(E(HITS, H(30), onset_db=-10), E(PUMPKIN, "pumpkin_break_02.ogg", ch=1, gain_db=-3, offset_ms=3),
              note="layered: heavy punch + pumpkin crunch (right channel)"),
        E(SPRING, "snd_splat.wav", note="wet splat"),
    ],
    # cracks / snaps
    "bone_break": [
        E(DEEPB, "Deep Break 9.wav", note="deep crack"),
        E(DEEPB, "Deep Break 5.wav", note="deep crack, crackly"),
        E(DEEPB, "Deep Break 1.wav", note="deep crack"),
        E(DEEPB, "Deep Break 6.wav", note="deep crack"),
        E(WETB, "Wet Break 1.wav", note="fleshy snap"),
        E(WETB, "Wet Break 5.wav", note="fleshy snap"),
        E(WETB, "Wet Break 7.wav", note="fleshy snap"),
        E(WETB, "Wet Break 9.wav", note="short fleshy snap"),
    ],
    # dull guarded impacts (cardboard hits)
    "block": [
        E(BLOCKS, "impact.1.ogg", note="dull guarded impact"),
        E(BLOCKS, "impact.4.ogg", note="dull guarded impact"),
        E(BLOCKS, "impact.6.ogg", note="dull guarded impact"),
        E(BLOCKS, "impact.8.ogg", note="dull guarded impact, low"),
        E(BLOCKS, "impact.9.ogg", note="dull guarded impact"),
        E(THWACK, "PCM/thwack-07.wav", note="dull thwack"),
    ],
    # sharp clash / slap deflect
    "parry": [
        E(MEDI, "Dagger Katana Blade on Blade.wav", t=(4.083, 4.303), note="dagger vs katana deflect"),
        E(MEDI, "Axe Sabre Blade on Hilt.wav", t=(1.065, 1.307), note="blade on hilt deflect"),
        E(SWORDS, "sword_clash.4.ogg", note="short blade clash"),
        E(TBODY, TB(24), note="sharp slap deflect"),
        E(MEDI, "Mace Spear Haft.wav", t=(2.983, 3.190), note="hard knock on a wooden haft (staff parry)"),
    ],
    "whoosh_light": [
        E(SWISH13, "swishes/swish-10.wav", note="light swish"),
        E(SWISH13, "swishes/swish-11.wav", note="light swish"),
        E(RPGPACK, "RPG Sound Pack/battle/swing2.wav", note="light swing"),
        E(BAMBOO, BAM(12), note="bamboo stick swish"),
        E(BAMBOO, BAM(17), note="bamboo stick swish"),
        E(BAMBOO, BAM(22), note="bamboo stick swish"),
    ],
    "whoosh_heavy": [
        E(BAMBOO, BAM(3), note="heavy low swoosh"),
        E(BAMBOO, BAM(13), note="heavy low swoosh"),
        E(BAMBOO, BAM(5), note="heavy swoosh"),
        E(BAMBOO, BAM(24), note="long heavy swoosh"),
        E(MELEE3, "melee sounds/melee sound.wav", note="heavy melee swing"),
        E(SWISH13, "swishes/swish-7.wav", note="short heavy swish"),
    ],
    "sword_swing": [
        E(MELEE3, "melee sounds/sword sound.wav", note="sword swing whoosh"),
        E(SWORDS, "sword - StarNinjas/sword.6.ogg", note="blade swing 'shing'"),
        LAYER(E(BAMBOO, BAM(15)), E(SWORDS, "sword - StarNinjas/sword.8.ogg", gain_db=-7, offset_ms=10),
              note="layered: swoosh + blade ring"),
        LAYER(E(BAMBOO, BAM(11)), E(SWORDS, "sword - StarNinjas/sword.2.ogg", gain_db=-8, offset_ms=15),
              note="layered: swoosh + blade ring"),
    ],
    "sword_clash": [
        E(MEDI, "Norse Sword Katana Blade on Blade.wav", t=(13.844, 14.337), note="norse sword vs katana"),
        E(MEDI, "Norse Sword Katana Blade on Blade.wav", t=(14.836, 15.365), note="norse sword vs katana"),
        E(MEDI, "Sabre Katana Blade on Blade.wav", t=(12.270, 12.532), note="sabre vs katana"),
        E(MEDI, "Sabre Norse Sword Blade on Blade.wav", t=(12.442, 12.739), note="sabre vs norse sword"),
        E(SWORDS, "sword_clash.1.ogg", note="ringing knife clash"),
        E(SWORDS, "sword_clash.9.ogg", note="long ringing clash"),
    ],
    # slash / stab into flesh: knife-into-pumpkin cuts and knife + squish layers
    "blade_flesh": [
        E(PUMPKIN_CUT, "cut_pumpkin_01.ogg", ch=1, t=(1.437, 2.118), note="knife cut into pumpkin (right channel)"),
        E(PUMPKIN_CUT, "cut_pumpkin_03.ogg", ch=0, t=(0.988, 1.472), note="knife cut into pumpkin (left channel)"),
        LAYER(E(RD_80, "blade_03.ogg"), E(SQUISH, "squish_03.mp3", gain_db=-3, offset_ms=5),
              note="layered: blade slash + wet squish"),
        LAYER(E(RD_80, "blade_01.ogg"), E(SQUISH, "squish_05.mp3", gain_db=-4, offset_ms=5),
              note="layered: blade slash + wet squish"),
    ],
    # wooden bat / club on body: towel body hits + wooden knocks
    "club_hit": [
        LAYER(E(TBODY, TB(5)), E(RD_MW, "wood_hit_05.ogg", gain_db=-3), note="layered: body thump + wood knock"),
        LAYER(E(TBODY, TB(29)), E(RD_BFH, "bfh1_wood_hit_03.ogg", gain_db=-3), note="layered: body thump + wood knock"),
        LAYER(E(TBODY, TB(12)), E(RD_MW, "wood_hammer_01.ogg", gain_db=-4), note="layered: body thump + wood hammer"),
        E(THWACK, "PCM/thwack-06.wav", note="thwack"),
    ],
    # crate smash
    "wood_break": [
        E(WOOD35, "wood_impact/impactwood22.mp3.flac", note="wooden smash"),
        E(WOOD35, "wood_impact/impactwood23.mp3.flac", note="wooden smash"),
        E(WOOD35, "wood_impact/impactwood03.mp3.flac", note="big wooden crash"),
        E(RD_BFH, "bfh1_breaking_01.ogg", note="breaking with debris"),
        E(RD_MW, "wood_breaking_01.ogg", note="wood breaking"),
        E(RD_BFH, "bfh1_wood_breaking_03.ogg", note="short wood break"),
    ],
    # body slammed into steel pillar / drum, clangs
    "metal_hit": [
        E(RD_MW, "metal_slam_01.ogg", note="heavy metal slam"),
        E(BMAC, "bong1.wav", note="resonant steel drum bong"),
        E(RD_BFH, "bfh1_metal_hit_05.ogg", note="low metal hit"),
        E(QMETAL, "metal_interactions/metal_interaction2.wav", note="heavy metal clank"),
        E(BMAC, "thud2.wav", note="metal thud"),
        E(RD_2, "sfx100v2_metal_hit_01.ogg", note="ringing metal hit"),
    ],
    # body hitting the floor (wet towel dropped on a stone floor)
    "body_fall": [
        E(TFLOOR, TF(1), note="body fall"),
        E(TFLOOR, TF(6), note="body fall"),
        E(TFLOOR, TF(7), note="body fall"),
        E(TFLOOR, TF(8), note="body fall"),
        LAYER(E(TFLOOR, TF(2)), E(RD_BFH, "bfh1_hit_02.ogg", gain_db=-9),
              note="layered: body fall + deep thud (heavier)"),
        LAYER(E(TFLOOR, TF(10)), E(SPRING, "snd_enemyland.wav", gain_db=-6),
              note="layered: body fall + heavy landing thud"),
    ],
    # hard-surface steps
    "footstep": [
        E(FANTOZZI, "Fantozzi-footsteps/flac/Fantozzi-StoneL1.flac", note="stone step, left foot"),
        E(FANTOZZI, "Fantozzi-footsteps/flac/Fantozzi-StoneR1.flac", note="stone step, right foot"),
        E(FANTOZZI, "Fantozzi-footsteps/flac/Fantozzi-StoneL2.flac", note="stone step, left foot"),
        E(FANTOZZI, "Fantozzi-footsteps/flac/Fantozzi-StoneR2.flac", note="stone step, right foot"),
        E(TINYSTEPS, "stone01.ogg", note="stone step, duller"),
        E(FANTOZZI, "Fantozzi-footsteps/flac/Fantozzi-StoneR3.flac", note="stone step, right foot"),
        E(RD_2, "sfx100v2_footstep_01.ogg", note="hard-soled step"),
        E(RD_2, "sfx100v2_footstep_02.ogg", note="hard-soled step"),
    ],
    # gore / blood squelch
    "squish": [
        E(SQUISH, "squish_02.mp3", note="squish"),
        E(SQUISH, "squish_04.mp3", note="squish"),
        E(SQUISH, "squish_06.mp3", note="squish"),
        E(SPLAT8, "impsplat/impactsplat03.mp3.flac", note="wet slurp impact"),
        E(SPLAT8, "impsplat/impactsplat07.mp3.flac", note="wet squish impact"),
        E(SPRING, "snd_splurt.wav", note="splurt"),
    ],
    # male effort grunts (short strain / jump vocalisations)
    "grunt_attack": [
        E(QVOCAL, SS(1), note="male effort grunt"),
        E(QVOCAL, SS(2), note="male effort grunt"),
        E(QVOCAL, SS(7), note="male effort grunt"),
        E(QVOCAL, SS(8), note="male effort grunt"),
        E(QVOCAL, SS(11), note="short male effort grunt"),
        E(QVOCAL, SS(12), note="short male effort grunt"),
        E(EMO_PLAYER, EMO_JUMP, note="male jump/effort grunt"),
        E(EMO_PLAYER, EMO_JUMP2, note="male jump/effort grunt"),
    ],
    "grunt_pain": [
        E(QVOCAL, SS(5), note="male pain grunt"),
        E(QVOCAL, SS(10), note="male pain grunt, longer"),
        E(QVOCAL, SS(14), note="male pain grunt"),
        E(EMO_PAIN, "Painsounds v2 - Track 1 - Arrrch.ogg", note="male pain 'arrrch'"),
        E(EMO_PAIN, "Painsounds v2 - Track 3 - Huuurh.ogg", note="male pain 'huuurh'"),
        E(MANHURT, "ManHurt.ogg", t=(0.935, 1.544), note="male hurt grunt"),
        E(MANHURT, "ManHurt.ogg", t=(2.108, 2.721), note="male hurt grunt"),
        E(GRUNTS, GRUNTS_WAV, t=(29.835, 30.354), note="male pain grunt"),
    ],
    "death": [
        E(GRUNTS, GRUNTS_WAV, t=(3.944, 6.139), note="male death groan"),
        E(GRUNTS, GRUNTS_WAV, t=(14.442, 16.146), note="male death groan"),
        E(GRUNTS, GRUNTS_WAV, t=(20.326, 22.392), note="male death groan"),
        E(GRUNTS, GRUNTS_WAV, t=(35.943, 37.370), note="male death groan"),
        E(GRUNTS, GRUNTS_WAV, t=(47.357, 49.121), note="male death groan"),
        E(MANHURT, "ManHurt.ogg", t=(4.964, 6.483), note="male dying groan"),
    ],
}

# Announcer phrases (file name = announcer/announcer_<phrase>.wav)
ANNOUNCER = ["fight", "round_1", "round_2", "round_3", "final_round", "ready", "begin", "prepare_yourself",
             "combo", "combo_breaker", "flawless_victory", "you_win", "you_lose", "game_over", "winner", "time"]

# Ambience loops: (pack, file, start s, loop length s, crossfade s, note)
AMBIENCE = [
    (FACTORY, "Factory.ogg", 20.0, 40.0, 2.0, "industrial factory ambience loop"),
    (RAIN, "amb_rain_loop_1.wav", 4.0, 30.0, 2.0, "steady rain loop"),
]


# ---------------------------------------------------------------------------
# DSP
# ---------------------------------------------------------------------------
def db2lin(d):
    return 10.0 ** (d / 20.0)


def ff_pipe(x, in_sr, out_sr, af=None):
    """Run a mono float signal through ffmpeg (filters and/or soxr resampling)."""
    filters = [af] if af else []
    filters.append(f"aresample={out_sr}:resampler=soxr:precision=28")
    cmd = ["ffmpeg", "-v", "error", "-nostdin", "-f", "f32le", "-ar", str(int(in_sr)), "-ac", "1", "-i", "-",
           "-af", ",".join(filters), "-f", "f32le", "-acodec", "pcm_f32le", "-ar", str(out_sr), "-"]
    out = subprocess.run(cmd, input=x.astype(np.float32).tobytes(), capture_output=True, check=True).stdout
    return np.frombuffer(out, dtype=np.float32).astype(np.float64)


def pitch_shift(x, semitones):
    """Tape-style pitch shift (changes duration too)."""
    ratio = 2.0 ** (semitones / 12.0)
    return ff_pipe(x, round(SR * ratio), SR)


def rms_env_db(x, win, hop):
    """Sliding RMS (dB) with window `win` and hop `hop`, via cumulative sums."""
    if len(x) < win:
        x = np.pad(x, (0, win - len(x)))
    c = np.concatenate([[0.0], np.cumsum(x * x)])
    starts = np.arange(0, len(x) - win + 1, hop)
    e = (c[starts + win] - c[starts]) / win
    return al.db(np.sqrt(e + 1e-20)), starts


def noise_floor(x):
    """Noise floor (absolute dBFS): 5th percentile of the 10 ms RMS envelope of a whole file."""
    env, _ = rms_env_db(x, int(0.010 * SR), int(0.002 * SR))
    return float(np.percentile(env, 5))


def onset_sample(x, rel_db, floor_db):
    """First sample above max(peak+rel_db, min(floor+12 dB, peak-10 dB))."""
    peak_db = al.db(np.abs(x).max())
    thr_db = max(peak_db + rel_db, min(floor_db + 12.0, peak_db - 10.0))
    idx = np.flatnonzero(np.abs(x) > db2lin(thr_db))
    return int(idx[0]) if len(idx) else 0


def tail_end(x, tail_db, floor_db):
    """End sample: last 10 ms window above max(env_peak+tail_db, min(floor+6, env_peak-30)), +10 ms."""
    win, hop = int(0.010 * SR), int(0.001 * SR)
    env, starts = rms_env_db(x, win, hop)
    thr = max(env.max() + tail_db, min(floor_db + 6.0, env.max() - 30.0))
    above = np.flatnonzero(env > thr)
    if not len(above):
        return len(x)
    return int(min(len(x), starts[above[-1]] + win + int(0.010 * SR)))


def cos_fade_out(n):
    return 0.5 + 0.5 * np.cos(np.pi * np.arange(1, n + 1) / n)


def finish(x, floor_db, onset_db=-40, tail_db=-45, max_len=None, fade_out_ms=FADE_OUT_MS):
    """Trim, fade and peak-normalise a mono 44.1 kHz signal. Returns (y, info).

    floor_db is the noise floor of the whole source file (absolute dBFS), so
    slices that contain no silence of their own are still trimmed correctly.
    """
    on = onset_sample(x, onset_db, floor_db)
    start = max(0, on - int(PRE_ROLL_MS / 1000 * SR))
    end = tail_end(x, tail_db, floor_db)
    end = max(end, min(len(x), on + int(0.05 * SR)))
    truncated = bool(max_len and end - start > int(max_len * SR))
    if truncated:
        end = start + int(max_len * SR)
    y = x[start:end].copy()
    # fade-in over the pre-roll only (the transient itself is untouched)
    k = on - start
    if k >= 2:
        y[:k] *= 0.5 - 0.5 * np.cos(np.pi * np.arange(k) / k)
    else:
        m = min(MIN_FADE_IN, len(y))
        y[:m] *= np.linspace(0.0, 1.0, m, endpoint=False)
    # was the sound still loud where it ends (shortened by us, or cut short in the source)?
    win = int(0.030 * SR)
    peak_rms = rms_env_db(y, int(0.010 * SR), int(0.001 * SR))[0].max()
    end_rms = al.db(np.sqrt(np.mean(y[-win:] ** 2)) + 1e-20)
    abrupt = end_rms > peak_rms - 30.0
    if truncated or abrupt:  # cosine decay so the sound still dies away instead of stopping
        lf = int(min(0.35 * len(y), (0.30 if truncated else 0.12) * SR))
        y[-lf:] *= cos_fade_out(lf)
    fo = min(len(y), int(fade_out_ms / 1000 * SR))
    y[-fo:] *= cos_fade_out(fo)
    pk = np.abs(y).max()
    if pk > 0:
        y *= db2lin(PEAK_DBFS) / pk
    tot = float(np.sum(x * x)) + 1e-20
    return y, {"pre_roll_ms": k / SR * 1000, "truncated": truncated, "abrupt": bool(abrupt and not truncated),
               "head_cut": float(np.sum(x[:start] ** 2)) / tot, "tail_cut": float(np.sum(x[end:] ** 2)) / tot}


def make_loop(x, sr, start, length, xfade):
    """Equal-power crossfaded loop of `length` s starting at `start` s."""
    a = int(start * sr)
    L, X = int(length * sr), int(xfade * sr)
    s = x[a:a + L + X]
    if len(s) < L + X:
        raise ValueError("ambience source too short for requested loop")
    out = s[:L].copy()
    t = np.arange(X) / X
    out[:X] = s[:X] * np.sin(0.5 * np.pi * t) + s[L:L + X] * np.cos(0.5 * np.pi * t)
    pk = np.abs(out).max()
    return out * (db2lin(PEAK_DBFS) / pk)


# ---------------------------------------------------------------------------
# Rendering
# ---------------------------------------------------------------------------
class Renderer:
    """Decodes sources (cached), slices / pitches / filters / layers them.

    Every source signal travels with the noise floor of its whole file.
    """

    def __init__(self, src_dir):
        self.src = src_dir
        self._cache = {}

    def path(self, pack, rel):
        return os.path.join(self.src, pack, "x", rel)

    def decode(self, pack, rel, ch):
        key = (pack, rel, ch)
        if key not in self._cache:
            p = self.path(pack, rel)
            if ch is None:
                x = al.decode(p, sr=SR, mono=True, hq=True)
            else:
                x = al.decode(p, sr=SR, channel=ch, hq=True)
            x = ff_pipe(x, SR, SR, af=f"highpass=f={HIGHPASS_HZ}:poles=2")  # DC / rumble
            self._cache[key] = (x, noise_floor(x))
        return self._cache[key]

    def source(self, e):
        if "layers" in e:
            return self.mix(e)
        x, floor_db = self.decode(e["pack"], e["path"], e.get("ch"))
        if "t" in e:
            a, b = e["t"]
            x = x[int(a * SR):int(b * SR)]
        x = x.copy()
        if e.get("pitch"):
            x = pitch_shift(x, e["pitch"])
        if e.get("af"):
            x = ff_pipe(x, SR, SR, af=e["af"])
        return x, floor_db

    def mix(self, e):
        parts, floor_pow = [], 0.0
        for lay in e["layers"]:
            x, floor_db = self.source(lay)
            g = db2lin(lay.get("gain_db", 0.0)) / max(np.abs(x).max(), 1e-9)
            x = x * g
            floor_db += al.db(g)
            on = onset_sample(x, lay.get("onset_db", -30), floor_db)
            x = x[max(0, on - int(PRE_ROLL_MS / 1000 * SR)):]
            off = int(lay.get("offset_ms", 0) / 1000 * SR)
            parts.append((off, x))
            floor_pow += 10 ** (floor_db / 10)
        n = max(off + len(x) for off, x in parts)
        y = np.zeros(n)
        for off, x in parts:
            y[off:off + len(x)] += x
        return y, 10 * np.log10(floor_pow + 1e-30)


def describe_source(e):
    """(pack, original, layers-detail) strings for the manifest."""
    if "layers" in e:
        packs = [lay["pack"] for lay in e["layers"]]
        uniq = list(dict.fromkeys(packs))
        detail = []
        for lay in e["layers"]:
            d = {"pack": lay["pack"], "original": lay["path"]}
            for k in ("ch", "t", "gain_db", "offset_ms", "pitch"):
                if lay.get(k) is not None:
                    d[k] = list(lay[k]) if k == "t" else lay[k]
            detail.append(d)
        return " + ".join(uniq), " + ".join(lay["path"] for lay in e["layers"]), detail
    return e["pack"], e["path"], None


def source_note(e):
    bits = []
    if e.get("ch") is not None:
        bits.append("left channel" if e["ch"] == 0 else "right channel")
    if "t" in e:
        bits.append(f"slice {e['t'][0]:.2f}-{e['t'][1]:.2f}s")
    if e.get("pitch"):
        bits.append(f"pitch {e['pitch']:+g} st")
    return bits


def write_wav(path, y, sr):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    pcm = np.clip(np.round(y * 32767.0), -32768, 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(pcm.tobytes())
    return len(pcm) / sr


def used_packs():
    packs = set()

    def walk(e):
        if "layers" in e:
            for lay in e["layers"]:
                walk(lay)
        else:
            packs.add(e["pack"])
    for entries in SELECTION.values():
        for e in entries:
            walk(e)
    packs.add(VO)
    for amb in AMBIENCE:
        packs.add(amb[0])
    return sorted(packs)


def generated_dirs():
    return list(SELECTION) + ["announcer", "ambience"]


def build(src_dir, out_dir):
    r = Renderer(src_dir)
    manifest = {"version": 1, "categories": {}, "files": {}}
    for name in generated_dirs():  # remove only what this script generates
        p = os.path.join(out_dir, name)
        if os.path.isdir(p):
            shutil.rmtree(p)
    if os.path.exists(os.path.join(out_dir, "manifest.json")):
        os.remove(os.path.join(out_dir, "manifest.json"))
    os.makedirs(out_dir, exist_ok=True)

    def add(cat, rel, dur, pack, original, note, extra=None):
        manifest["categories"].setdefault(cat, []).append(rel)
        d = {"duration": round(dur, 3), "pack": pack, "original": original}
        if note:
            d["note"] = note
        if extra:
            d.update(extra)
        manifest["files"][rel] = d

    for cat, entries in SELECTION.items():
        opts = CATEGORY_DEFAULTS[cat]
        for i, e in enumerate(entries, 1):
            x, floor_db = r.source(e)
            fo = {k: e.get(k, opts.get(k)) for k in ("onset_db", "tail_db", "max_len")}
            y, info = finish(x, floor_db, fade_out_ms=e.get("fade_out_ms", FADE_OUT_MS), **fo)
            rel = f"audio/{cat}/{cat}_{i:02d}.wav"
            dur = write_wav(os.path.join(out_dir, cat, f"{cat}_{i:02d}.wav"), y, SR)
            pack, original, layers = describe_source(e)
            bits = source_note(e) + (["shortened with fade"] if info["truncated"] else []) + \
                (["end faded (source stops abruptly)"] if info["abrupt"] else [])
            note = e.get("note", "")
            if bits and "layers" not in e:
                note = f"{note} [{', '.join(bits)}]" if note else ", ".join(bits)
            add(cat, rel, dur, pack, original, note, {"layers": layers} if layers else None)
            print(f"  {rel:42s} {dur:5.2f}s  pre-roll {info['pre_roll_ms']:3.1f} ms  cut head {info['head_cut']:6.2%}"
                  f" tail {info['tail_cut']:6.2%}  <- {pack}: {original}")

    opts = CATEGORY_DEFAULTS["announcer"]
    for phrase in ANNOUNCER:
        x, floor_db = r.source(E(VO, f"Audio/{phrase}.ogg"))
        y, info = finish(x, floor_db, **opts)
        rel = f"audio/announcer/announcer_{phrase}.wav"
        dur = write_wav(os.path.join(out_dir, "announcer", f"announcer_{phrase}.wav"), y, SR)
        add("announcer", rel, dur, VO, f"Audio/{phrase}.ogg", f'"{phrase.replace("_", " ")}"',
            {"phrase": phrase})
        print(f"  {rel:42s} {dur:5.2f}s")

    for i, (pack, rel_src, start, length, xfade, note) in enumerate(AMBIENCE, 1):
        x = al.decode(r.path(pack, rel_src), sr=AMB_SR, mono=True, hq=True)
        x = ff_pipe(x, AMB_SR, AMB_SR, af=f"highpass=f={HIGHPASS_HZ}:poles=2")
        y = make_loop(x, AMB_SR, start, length, xfade)
        rel = f"audio/ambience/ambience_{i:02d}.wav"
        dur = write_wav(os.path.join(out_dir, "ambience", f"ambience_{i:02d}.wav"), y, AMB_SR)
        add("ambience", rel, dur, pack, rel_src,
            f"{note} [{start:g}-{start + length + xfade:g}s, {xfade:g}s equal-power loop crossfade, 22050 Hz]",
            {"loop": True})
        print(f"  {rel:42s} {dur:5.2f}s (loop)")

    with open(os.path.join(out_dir, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
        f.write("\n")
    return manifest


# ---------------------------------------------------------------------------
# Verification + credits
# ---------------------------------------------------------------------------
def verify(out_dir, manifest):
    site_root = os.path.dirname(out_dir)  # public/
    problems = []
    total = 0
    for rel, meta in manifest["files"].items():
        p = os.path.join(site_root, rel)
        if not os.path.exists(p):
            problems.append(f"missing {rel}")
            continue
        info = al.probe(p)
        want_sr = AMB_SR if meta.get("loop") else SR
        if info["ch"] != 1 or info["sr"] != want_sr or info["codec"] != "pcm_s16le":
            problems.append(f"bad format {rel}: {info}")
        if abs(info["dur"] - meta["duration"]) > 0.01:
            problems.append(f"duration mismatch {rel}: {info['dur']} vs {meta['duration']}")
    for cat, paths in manifest["categories"].items():
        for rel in paths:
            if rel not in manifest["files"]:
                problems.append(f"{cat}: {rel} not in files")
    for dp, _, fns in os.walk(out_dir):
        for fn in fns:
            total += os.path.getsize(os.path.join(dp, fn))
            rel = os.path.relpath(os.path.join(dp, fn), site_root).replace(os.sep, "/")
            if fn.endswith(".wav") and rel.split("/")[1] in generated_dirs() and rel not in manifest["files"]:
                problems.append(f"unlisted file {rel}")
    if total > SIZE_BUDGET:
        problems.append(f"total size {total} exceeds budget {SIZE_BUDGET}")
    return problems, total


CREDITS_START = "<!-- audio-credits:start (generated by tools/audio/build_audio.py) -->"
CREDITS_END = "<!-- audio-credits:end -->"


def write_credits(path, src_dir, manifest):
    packs_in_use = []
    for meta in manifest["files"].values():
        for p in (meta["pack"].split(" + ")):
            if p not in packs_in_use:
                packs_in_use.append(p)
    lines = [CREDITS_START, "## Audio", "",
             "All sound effects in `public/audio/` were cut, converted and normalised from the "
             "following OpenGameArt.org packs. Every pack is released under **CC0** (public domain "
             "dedication); attribution is not required but given here with thanks. "
             "Regenerate with `python3 -I tools/audio/build_audio.py`.", "",
             "| Pack | Author | License | URL |", "|---|---|---|---|"]
    for slug in sorted(packs_in_use):
        with open(os.path.join(src_dir, slug, "meta.json")) as f:
            m = json.load(f)
        author = m["author"] or m.get("submitted_by") or "unknown"
        if m.get("submitted_by") and m["submitted_by"] != author:
            author += f" (submitted by {m['submitted_by']})"
        lines.append(f"| {m['title'].replace('|', '/')} | {author} | {m['license']} | {m['url']} |")
    lines += ["", CREDITS_END]
    section = "\n".join(lines) + "\n"
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            text = f.read()
        if CREDITS_START in text and CREDITS_END in text:
            a = text.index(CREDITS_START)
            b = text.index(CREDITS_END) + len(CREDITS_END)
            text = text[:a] + section.rstrip("\n") + text[b:]
        else:
            text = text.rstrip("\n") + "\n\n" + section
    else:
        text = "# Credits\n\n" + section
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)
    return packs_in_use


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--src", default=os.environ.get("AUDIO_SRC_DIR",
                                                    os.path.join(tempfile.gettempdir(), "brawler-audio-src")),
                    help="download/extraction directory (untrusted data, one subdir per pack)")
    ap.add_argument("--out", default=os.path.join(REPO, "public", "audio"))
    ap.add_argument("--credits", default=os.path.join(REPO, "CREDITS.md"))
    ap.add_argument("--no-fetch", action="store_true", help="use already downloaded packs")
    ap.add_argument("--refresh-pages", action="store_true",
                    help="re-download every pack page to re-check its license even if cached")
    args = ap.parse_args()

    packs = used_packs()
    if not args.no_fetch:
        print(f"[1/5] fetching {len(packs)} packs into {args.src}")
        for slug in packs:
            m = fetch_packs.fetch_pack(slug, args.src, refresh=args.refresh_pages)
            print(f"  ok {slug}: {m['title']} by {m['author']} ({m['license']})")
    print("[2-3/5] rendering")
    manifest = build(args.src, args.out)
    print("[4/5] verifying")
    problems, total = verify(args.out, manifest)
    for cat, paths in manifest["categories"].items():
        d = sum(manifest["files"][p]["duration"] for p in paths)
        print(f"  {cat:13s} {len(paths):2d} files {d:6.2f}s")
    print(f"  total size: {total / 1024 / 1024:.2f} MB")
    if problems:
        print("PROBLEMS:\n  " + "\n  ".join(problems))
        return 1
    print("[5/5] credits")
    used = write_credits(args.credits, args.src, manifest)
    print(f"  {len(used)} packs credited in {args.credits}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
