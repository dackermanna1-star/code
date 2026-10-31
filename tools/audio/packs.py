"""OpenGameArt packs known to the SFX build (all verified CC0 on their pages).

slug -> {"download": [file names exactly as listed in the page's File(s) field]}

build_audio.py only fetches the packs its SELECTION actually uses; the pack's
title / author / license are re-read from the live page at fetch time (and a
non-CC0 page aborts the fetch).  CANDIDATES lists packs that were downloaded
and evaluated but are not used, with the reason, so `fetch_packs.py` can
re-fetch them for future auditioning.

Skipped for licensing (first license on the page is not CC0):
  rain-on-window-loop (CC-BY 4.0), battle-sound-effects (CC-BY 3.0),
  wierd-whooshes (CC-BY 3.0), footsteps-leather-cloth-armor (OGA-BY 3.0),
  male-gruntyelling-sounds (OGA-BY 3.0).
"""

PACKS = {
    # punches / hits
    "37-hitspunches": {"download": ["independent_nu_ljudbank-hits_and_punches.7z"]},
    "punch": {"download": ["qubodupPunch.7z"]},
    "impact": {"download": ["qubodupImpact.7z"]},
    "12-wet-towel-hittingfallingpunching-floor-sounds": {"download": ["wet_towel_on_floor.7z"]},
    "40-wet-towel-clubpoundhitattack-sounds": {"download": ["wet_towel_on_body.7z"]},
    "3-melee-sounds": {"download": ["melee sounds.zip"]},
    "thwack-sounds": {"download": ["thwack-1.0.zip"]},
    # gore / crunch / bones
    "8-wet-squish-slurp-impacts": {"download": ["independent_nu_ljudbank-wet_squish_slurp_impacts.7z"]},
    "squish-sounds-effects": {"download": ["squish_01.mp3", "squish_02.mp3", "squish_03.mp3", "squish_04.mp3",
                                           "squish_05.mp3", "squish_06.mp3", "squishpop.mp3",
                                           "squishsplat_impact.mp3"]},
    "deep-bone-crackbreak-sfx": {"download": ["deep_breaks.zip"]},
    "fleshy-bone-breaksnap-sfx": {"download": ["wet_breaks.zip"]},
    "break-pumpkin": {"download": ["pumpkin_break_01.ogg", "pumpkin_break_02.ogg"]},
    "cut-peel-a-pumpkin": {"download": ["cut_pumpkin_01.ogg", "cut_pumpkin_02.ogg", "cut_pumpkin_03.ogg"]},
    "various-sound-effects-0": {"download": ["snd_splat.wav", "snd_splathit.wav", "snd_splurt.wav",
                                             "snd_enemyland.wav"]},
    # blocks / blades / swings
    "10-impactshield-blocks": {"download": ["impact_-_starninjas.zip"]},
    "20-sword-sound-effects-attacks-and-clashes": {"download": ["sword_-_starninjas.zip",
                                                                "sword_clash_-_starninjas.zip"]},
    "medieval-sound-effects-weapon-impacts": {"download": ["medieval_sfx_weapon_on_weapon_1_of_2.7z"]},  # 82 MB
    "swishes-sound-pack": {"download": ["swishes.zip"]},
    "swish-bamboo-stick-weapon-swhoshes": {"download": ["swoshes.7z"]},
    "rpg-sound-pack": {"download": ["rpg_sound_pack.zip"]},
    "80-cc0-rpg-sfx": {"download": ["80-CC0-RPG-SFX.zip"]},
    # wood / metal
    "35-wooden-crackshitsdestructions": {"download": ["independent_nu_ljudbank-wood_crack_hit_destruction.7z"]},
    "metal-impact-sounds": {"download": ["bing1.wav", "bong1.wav", "clink1.wav", "clink2.wav", "clink3.wav",
                                         "thud2.wav", "thud3.wav"]},
    "metal-interactions": {"download": ["metal_interactions.7z"]},
    "100-cc0-metal-and-wood-sfx": {"download": ["100-CC0-wood-metal-SFX.zip"]},
    "75-cc0-breaking-falling-hit-sfx": {"download": ["sfx_breaking_and_falling.zip"]},
    "100-cc0-sfx-2": {"download": ["sfx_100_v2.zip"]},
    # footsteps
    "fantozzis-footsteps-grasssand-stone": {"download": ["Fantozzi-footsteps.7z"]},
    "different-steps-on-wood-stone-leaves-gravel-and-mud": {"download": ["[kdd]DifferentSteps.zip"]},
    # vocals
    "grunts-male-death-and-pain": {"download": ["death pain grunts.wav"]},
    "15-vocal-male-strainhurtpainjump-sounds": {"download": ["slightscreams.7z"]},
    "man-hurt-sounds": {"download": ["ManHurt.ogg"]},
    "pain-sounds-by-emopreben": {"download": ["painsounds.zip"]},
    "playersounds-1-by-emopreben": {"download": ["Playersounds - Wav.zip"]},
    "voiceover-pack-fighter-40-taunts": {"download": ["kenney_voiceoverFighter.zip"]},
    # ambience
    "factory-ambiance": {"download": ["Factory.ogg"]},
    "amb-rain-loop-1": {"download": ["amb_rain_loop_1.wav"]},
}

# Downloaded and evaluated (CC0) but not used -- reason in the comment.
CANDIDATES = {
    # 8 kHz "recorded through an mp3 player", clipped
    "hit-sounds": {"download": ["hits.7z"]},
    # long sequences, clipped
    "2-wooden-squish-splatter-sequences": {"download": ["independent_nu_ljudbank-extreme_splatter.7z"]},
    # slow, smeared crunch sequences; pumpkin breaks / layers worked better for face_crunch
    "5-break-crunch-impacts": {"download": ["independent_nu_ljudbank-break_crunch_impact.7z"]},
    # 5 s nunchuk loop without gaps; bamboo swooshes are cleaner single swings
    "air-whoosh": {"download": ["whoosh2.wav"]},
    # knife slices have a slow (150 ms) build; blade + squish layers used instead
    "50-rpg-sound-effects": {"download": ["RPGsounds_Kenney.zip"]},
    # very short mp3 hurts; enough male pain material elsewhere
    "hurt-sound-effects": {"download": ["hurt_01.mp3", "hurt_02.mp3", "hurt_03.mp3", "hurt_04.mp3",
                                        "hurt_05.mp3", "hurt_06.mp3"]},
    # part 1 only holds bows/crossbows and a Katana Swing that is almost all sub-80 Hz wind rumble
    "medieval-sound-effects-weapon-textures": {"download": ["medieval_sfx_textures_1_of_2.7z"]},  # 90 MB
    # quiet, noisy subway steps / clanky metal feet / platformer steps
    "footsteps-0": {"download": ["01-footstep.ogg", "02-footstep.ogg", "03-footstep.ogg", "04-footstep.ogg",
                                 "05-footstep.ogg", "06-footstep.ogg"]},
    "metal-footsteps-on-concrete": {"download": ["metal_steps_48k24b.7z"]},
    "platformer-sounds-terminal-interaction-door-shots-bang-and-footsteps": {"download": ["yd-Sounds.zip"]},
    # voice gender unclear (several takes around 400-600 Hz)
    "hurt-death-sound-effect-for-character": {"download": ["death sound effect.zip"]},
    "death-sounds-0": {"download": ["exewinDeathSoundsPack.zip"]},
    # processed / partly clipped enemy voices
    "male-dead-voice": {"download": ["enemy_dead_20150802.zip"]},
    "5-hit-sounds-dying": {"download": ["5Hit_Sounds.zip"]},
    # heavily clipped (+16 dB overs, 93-sample flat runs)
    "ripping-into-meat": {"download": ["rippingintomeat.mp3"]},
    "fly-swatter-squish-sound": {"download": ["qubodup-flyswatter.7z"]},
}
