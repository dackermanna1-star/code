#!/usr/bin/env python3
"""
Builds the mod's audio: synthesizes the signature sounds into mono OGG Vorbis files and writes sounds.json.

Most events layer re-pitched vanilla sound events ("type": "event"), so they match the game's mix and need no
redistribution of audio. The few sounds vanilla has no equivalent for are synthesized here from scratch:

  telegraph      rising, trembling warning hum played when a boss attack is wound up
  boss_sting     sub hit + minor choir swell when a guardian wakes
  floor_enter    distant tolling bell over a rumble when a floor is entered
  seal_hum       glassy shimmer layered on the runic seal closing

Requires numpy and ffmpeg (libvorbis). Run from the repository root:  python3 tools/assets/sounds.py
"""
import json
import math
import os
import subprocess
import tempfile
import wave

import numpy as np

NS = "abyssal_descent"
RATE = 44100
ROOT = os.path.join("src", "main", "resources", "assets", NS)
SOUND_DIR = os.path.join(ROOT, "sounds")
rng = np.random.default_rng(1337)


# ---------------------------------------------------------------------------------------------- DSP helpers

def t_axis(seconds):
    return np.arange(int(seconds * RATE)) / RATE


def envelope(n, attack, release, curve=2.0):
    """Linear-ish attack, power-curve release; attack/release in seconds."""
    env = np.ones(n)
    a = max(1, int(attack * RATE))
    r = max(1, int(release * RATE))
    env[:a] = np.linspace(0, 1, a) ** 0.7
    env[-r:] *= np.linspace(1, 0, r) ** curve
    return env


def one_pole_lowpass(x, cutoff):
    """Cutoff may be a scalar or an array (time-varying)."""
    cutoff = np.broadcast_to(np.asarray(cutoff, dtype=float), x.shape)
    alpha = 1.0 - np.exp(-2.0 * math.pi * cutoff / RATE)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc += alpha[i] * (x[i] - acc)
        y[i] = acc
    return y


def bandpass(x, center, q):
    """RBJ biquad band-pass (constant skirt gain)."""
    w0 = 2 * math.pi * center / RATE
    alpha = math.sin(w0) / (2 * q)
    b0, b1, b2 = alpha, 0.0, -alpha
    a0, a1, a2 = 1 + alpha, -2 * math.cos(w0), 1 - alpha
    b0, b1, b2, a1, a2 = b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0
    y = np.zeros_like(x)
    x1 = x2 = y1 = y2 = 0.0
    for i in range(len(x)):
        xi = x[i]
        yi = b0 * xi + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
        x2, x1, y2, y1 = x1, xi, y1, yi
        y[i] = yi
    return y


def reverb(x, seconds=2.5, wet=0.35, damp=0.35):
    """Small Schroeder reverb: four damped combs in parallel, two all-passes in series. Extends the tail."""
    tail = np.concatenate([x, np.zeros(int(seconds * RATE))])
    out = np.zeros_like(tail)
    for delay_ms, gain in ((29.7, 0.80), (37.1, 0.78), (41.1, 0.76), (43.7, 0.74)):
        d = int(delay_ms * RATE / 1000)
        buf = np.zeros(len(tail))
        lp = 0.0
        for i in range(len(tail)):
            delayed = buf[i - d] if i >= d else 0.0
            lp = delayed * (1 - damp) + lp * damp
            buf[i] = tail[i] + lp * gain
        out += buf
    out /= 4
    for delay_ms, gain in ((5.0, 0.7), (1.7, 0.7)):
        d = int(delay_ms * RATE / 1000)
        y = np.zeros_like(out)
        for i in range(len(out)):
            xd = out[i - d] if i >= d else 0.0
            yd = y[i - d] if i >= d else 0.0
            y[i] = -gain * out[i] + xd + gain * yd
        out = y
    return tail * (1 - wet) + out * wet


def saw(freq, t, phase=0.0):
    p = (t * freq + phase) % 1.0
    return 2.0 * p - 1.0


def normalize(x, peak=0.89):
    m = np.max(np.abs(x))
    return x if m == 0 else x * (peak / m)


def fade_tail(x, seconds=0.05):
    n = int(seconds * RATE)
    x = x.copy()
    x[-n:] *= np.linspace(1, 0, n)
    return x


# ---------------------------------------------------------------------------------------------- sounds

def telegraph(base):
    """A warning that rises in pitch and tremolo speed, so its end lines up with the strike."""
    dur = 0.95
    t = t_axis(dur)
    progress = t / dur
    freq = base * (1.0 + 0.9 * progress ** 1.6)
    phase = np.cumsum(freq) / RATE
    tone = np.sin(2 * math.pi * phase) + 0.5 * np.sin(2 * math.pi * phase * 2.003) + 0.25 * np.sin(2 * math.pi * phase * 3.01)
    tremolo_rate = 7 + 18 * progress
    tremolo = 0.65 + 0.35 * np.sin(2 * math.pi * np.cumsum(tremolo_rate) / RATE)
    shimmer = one_pole_lowpass(rng.standard_normal(len(t)), 3000) * 0.25 * progress
    x = (tone * tremolo + shimmer) * envelope(len(t), 0.04, 0.12, 1.5)
    return fade_tail(normalize(reverb(x, 0.6, 0.25)))


def boss_sting():
    """Sub drop and a dark choir swell (D minor), drenched in reverb."""
    dur = 4.2
    t = t_axis(dur)
    # Sub hit: pitch falls 90 -> 38 Hz in 0.6 s.
    f = 38 + 52 * np.exp(-t / 0.18)
    sub = np.sin(2 * math.pi * np.cumsum(f) / RATE) * np.exp(-t / 1.1)
    thump = one_pole_lowpass(rng.standard_normal(len(t)), 260) * np.exp(-t / 0.08) * 3.0
    # Choir: detuned saws through vowel-ish formant bands, with slow vibrato.
    notes = [73.42, 146.83, 174.61, 220.00, 293.66]
    choir = np.zeros(len(t))
    for k, n in enumerate(notes):
        for detune in (-0.006, 0.0, 0.007):
            vib = 1 + 0.004 * np.sin(2 * math.pi * (4.8 + k * 0.3) * t + k)
            choir += saw(n * (1 + detune), np.cumsum(vib) / RATE * 1.0, phase=rng.random()) / 3
    formants = bandpass(choir, 700, 4) * 1.0 + bandpass(choir, 1150, 5) * 0.6 + bandpass(choir, 2600, 6) * 0.25
    swell = np.clip((t - 0.15) / 1.4, 0, 1) ** 1.5 * np.exp(-np.clip(t - 2.6, 0, None) / 0.9)
    x = sub * 0.9 + thump + normalize(formants, 0.6) * swell
    x *= envelope(len(t), 0.002, 0.6, 1.2)
    return fade_tail(normalize(reverb(x, 2.8, 0.42, 0.45)))


def floor_enter():
    """A distant tolling bell (inharmonic partials) over a low rumble."""
    dur = 3.6
    t = t_axis(dur)
    rumble = one_pole_lowpass(rng.standard_normal(len(t)), 90) * 6.0
    rumble *= np.clip(t / 0.6, 0, 1) * np.exp(-t / 1.8)
    bell = np.zeros(len(t))
    fundamental = 98.0
    for ratio, amp, decay in ((0.5, 0.6, 2.6), (1.0, 1.0, 2.2), (2.0, 0.5, 1.6), (2.76, 0.45, 1.2), (5.40, 0.25, 0.7), (8.93, 0.12, 0.4)):
        bell += amp * np.sin(2 * math.pi * fundamental * ratio * t + rng.random() * 6) * np.exp(-t / decay)
    bell *= np.clip(t / 0.004, 0, 1)
    x = rumble * 0.8 + one_pole_lowpass(bell, 2200) * 0.8
    return fade_tail(normalize(reverb(x, 3.0, 0.5, 0.5)))


def seal_hum():
    """Glassy shimmer: a cluster of high partials with beating, swelling then fading."""
    dur = 1.6
    t = t_axis(dur)
    x = np.zeros(len(t))
    for freq in (880.0, 1318.5, 1760.0, 2217.5, 2637.0):
        for detune in (-1.5, 1.5):
            x += np.sin(2 * math.pi * (freq + detune) * t + rng.random() * 6) / (freq / 880.0)
    x *= np.clip(t / 0.25, 0, 1) * np.exp(-t / 0.55)
    return fade_tail(normalize(reverb(x, 1.2, 0.4, 0.2), 0.7))


def write_ogg(path, samples):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    pcm = (np.clip(samples, -1, 1) * 32767).astype(np.int16)
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        wav_path = tmp.name
    try:
        with wave.open(wav_path, "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(RATE)
            w.writeframes(pcm.tobytes())
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav_path, "-c:a", "libvorbis", "-q:a", "5", path], check=True)
    finally:
        os.unlink(wav_path)


# ---------------------------------------------------------------------------------------------- sounds.json

def ev(name, volume=1.0, pitch=1.0, weight=1, attenuation=None):
    entry = {"name": name, "type": "event"}
    if volume != 1.0:
        entry["volume"] = volume
    if pitch != 1.0:
        entry["pitch"] = pitch
    if weight != 1:
        entry["weight"] = weight
    if attenuation:
        entry["attenuation_distance"] = attenuation
    return entry


def own(path, volume=1.0, pitch=1.0, stream=False, attenuation=None):
    entry = {"name": f"{NS}:{path}"}
    if volume != 1.0:
        entry["volume"] = volume
    if pitch != 1.0:
        entry["pitch"] = pitch
    if stream:
        entry["stream"] = True
    if attenuation:
        entry["attenuation_distance"] = attenuation
    return entry


M = "minecraft:"
SOUNDS = {
    # ---- blocks
    "block.trap.click": [ev(M + "block.stone_pressure_plate.click_on", 0.9, 0.7), ev(M + "block.tripwire.click_on", 0.9, 0.6)],
    "block.spike_trap.extend": [ev(M + "block.piston.extend", 0.8, 1.6), ev(M + "block.pointed_dripstone.land", 1.0, 0.8)],
    "block.dart_trap.fire": [ev(M + "block.dispenser.launch", 0.9, 1.35)],
    "block.crumbling_wall.crumble": [ev(M + "block.deepslate_bricks.break", 1.0, 0.6), ev(M + "entity.zombie.break_wooden_door", 0.5, 0.5)],
    "block.reliquary.open": [ev(M + "block.vault.open_shutter", 1.0, 0.9)],
    "block.runic_seal.close": [ev(M + "block.beacon.activate", 0.9, 1.35), own("block/seal_hum", 0.6)],
    "block.runic_seal.open": [ev(M + "block.beacon.deactivate", 0.9, 1.3)],
    "block.abyssal_gate.attune": [ev(M + "block.respawn_anchor.charge", 1.0, 0.7)],
    "block.abyssal_gate.travel": [ev(M + "block.respawn_anchor.deplete", 1.0, 0.6), ev(M + "entity.enderman.teleport", 0.8, 0.5)],
    # ---- run events
    "event.descend": [ev(M + "block.respawn_anchor.deplete", 1.0, 0.5)],
    "event.extract": [ev(M + "block.beacon.power_select", 1.0, 0.8), ev(M + "block.respawn_anchor.set_spawn", 1.0, 0.9)],
    "event.defeat": [ev(M + "entity.elder_guardian.curse", 0.7, 0.6)],
    "event.floor_enter": [own("event/floor_enter", 0.9)],
    "event.room_clear": [ev(M + "block.vault.deactivate", 1.0, 1.1), ev(M + "block.amethyst_block.resonate", 1.0, 0.9)],
    "event.encounter_start": [ev(M + "block.trial_spawner.ominous_activate", 0.9, 1.0)],
    "event.enemy_summon": [ev(M + "block.trial_spawner.spawn_mob", 1.0, 0.85)],
    "event.curse_accept": [ev(M + "event.mob_effect.bad_omen", 0.9, 0.8)],
    "event.trial_begin": [ev(M + "event.mob_effect.trial_omen", 1.0, 0.9)],
    # ---- loot (rarer = brighter and longer)
    "loot.uncommon": [ev(M + "entity.experience_orb.pickup", 0.5, 0.75)],
    "loot.rare": [ev(M + "block.amethyst_block.chime", 1.0, 1.1), ev(M + "block.note_block.chime", 0.5, 1.2)],
    "loot.epic": [ev(M + "block.amethyst_cluster.break", 1.0, 1.2), ev(M + "block.note_block.bell", 0.6, 0.9)],
    "loot.legendary": [ev(M + "ui.toast.challenge_complete", 0.55, 1.0)],
    # ---- weapons & armor
    "weapon.chain_lightning": [ev(M + "entity.lightning_bolt.impact", 0.35, 1.7), ev(M + "block.copper_bulb.turn_on", 1.0, 0.7)],
    "weapon.soul_flare": [ev(M + "entity.blaze.shoot", 0.8, 0.6), ev(M + "item.firecharge.use", 0.8, 0.8)],
    "weapon.shockwave": [ev(M + "item.mace.smash_ground_heavy", 0.9, 0.9)],
    "weapon.bleed": [ev(M + "entity.player.hurt_sweet_berry_bush", 1.0, 0.8)],
    "weapon.bone_shrapnel": [ev(M + "block.bone_block.break", 1.0, 1.3), ev(M + "entity.skeleton.hurt", 0.6, 1.4)],
    "armor.deathward": [ev(M + "item.totem.use", 0.8, 1.1)],
    # ---- Hollow Warden
    "entity.hollow_warden.awaken": [ev(M + "entity.warden.emerge", 1.0, 0.9)],
    "entity.hollow_warden.roar": [ev(M + "entity.warden.roar", 1.0, 0.85)],
    "entity.hollow_warden.cleave": [ev(M + "entity.player.attack.sweep", 1.0, 0.55), ev(M + "item.trident.throw", 1.0, 0.6)],
    "entity.hollow_warden.slam": [ev(M + "item.mace.smash_ground_heavy", 1.0, 0.75)],
    "entity.hollow_warden.charge": [ev(M + "entity.ravager.roar", 1.0, 1.1)],
    "entity.hollow_warden.volley": [ev(M + "entity.wither.shoot", 0.8, 0.8), ev(M + "entity.evoker.cast_spell", 1.0, 0.7)],
    "entity.hollow_warden.hurt": [ev(M + "entity.iron_golem.hurt", 1.0, 0.6), ev(M + "entity.skeleton.hurt", 1.0, 0.5)],
    "entity.hollow_warden.death": [ev(M + "entity.warden.death", 1.0, 0.8)],
    "entity.hollow_warden.step": [ev(M + "entity.iron_golem.step", 1.0, 0.7)],
    "entity.telegraph": [own("entity/telegraph_low", 0.8), own("entity/telegraph_high", 0.8)],
    # ---- Forgotten Halls enemies
    "entity.wailing_skull.wail": [ev(M + "entity.ghast.warn", 0.5, 1.5), ev(M + "entity.vex.charge", 1.0, 0.6)],
    "entity.wailing_skull.shoot": [ev(M + "entity.blaze.shoot", 0.8, 1.3)],
    "entity.crypt_ghoul.screech": [ev(M + "entity.zoglin.angry", 0.9, 1.35)],
    "entity.crypt_ghoul.leap": [ev(M + "entity.wolf.growl", 0.8, 0.65), ev(M + "entity.goat.long_jump", 1.0, 0.8)],
    "entity.barrow_knight.swing": [ev(M + "entity.player.attack.sweep", 1.0, 0.6), ev(M + "entity.iron_golem.attack", 1.0, 0.8)],
    "entity.soul_bolt.hit": [ev(M + "item.firecharge.use", 0.6, 1.6), ev(M + "block.amethyst_block.break", 1.0, 0.8)],
    # ---- music & ambience
    "music.boss_sting": [own("music/boss_sting", 1.0, attenuation=48)],
    "music.boss.forgotten_halls": [ev(M + "music.dragon")],
    "ambient.forgotten_halls.loop": [ev(M + "ambient.soul_sand_valley.loop", 0.7, 0.8)],
    "ambient.forgotten_halls.additions": [
        ev(M + "ambient.cave", 0.6, 0.9, weight=3),
        ev(M + "block.pointed_dripstone.drip_water", 1.0, 0.8, weight=3),
        ev(M + "block.chain.step", 0.6, 0.6, weight=2),
        ev(M + "entity.skeleton.ambient", 0.4, 0.5, weight=1),
        ev(M + "ambient.soul_sand_valley.additions", 0.8, 0.7, weight=2),
    ],
}


def main():
    write_ogg(os.path.join(SOUND_DIR, "entity", "telegraph_low.ogg"), telegraph(196.0))
    write_ogg(os.path.join(SOUND_DIR, "entity", "telegraph_high.ogg"), telegraph(246.9))
    write_ogg(os.path.join(SOUND_DIR, "music", "boss_sting.ogg"), boss_sting())
    write_ogg(os.path.join(SOUND_DIR, "event", "floor_enter.ogg"), floor_enter())
    write_ogg(os.path.join(SOUND_DIR, "block", "seal_hum.ogg"), seal_hum())

    data = {}
    for key, entries in SOUNDS.items():
        data[key] = {"subtitle": f"subtitles.{NS}.{key}", "sounds": entries}
    # Music and loops carry no subtitle.
    for key in ("music.boss.forgotten_halls", "ambient.forgotten_halls.loop"):
        data[key].pop("subtitle")
    with open(os.path.join(ROOT, "sounds.json"), "w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")
    print(f"wrote {len(data)} sound events")


if __name__ == "__main__":
    main()
