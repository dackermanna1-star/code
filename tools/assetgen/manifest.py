"""The complete list of deliverables (paths relative to assets/jjkshowdown/)."""
from __future__ import annotations

TEXTURES = {  # path -> (width, height)
    "textures/entity/gojo.png": (64, 64),
    "textures/entity/gojo_eyes.png": (64, 64),
    "textures/entity/sukuna.png": (64, 64),
    "textures/entity/sukuna_markings.png": (64, 64),
    "textures/entity/sukuna_heian.png": (64, 64),
    "textures/entity/sukuna_heian_markings.png": (64, 64),
    "textures/entity/equipment/humanoid/gojo_blindfold.png": (64, 32),
    "textures/entity/technique/glow.png": (64, 64),
    "textures/entity/technique/blue_orb.png": (64, 64),
    "textures/entity/technique/red_orb.png": (64, 64),
    "textures/entity/technique/purple_orb.png": (128, 128),
    "textures/entity/technique/ring.png": (128, 128),
    "textures/entity/technique/slash.png": (128, 32),
    "textures/entity/technique/slash_red.png": (128, 32),
    "textures/entity/technique/world_slash.png": (256, 16),
    "textures/entity/technique/fuga_arrow.png": (64, 16),
    "textures/entity/technique/void_stars.png": (256, 128),
    "textures/entity/technique/infinity_ripple.png": (64, 64),
    "textures/block/unlimited_void_barrier.png": (16, 128),
    "textures/block/void_floor.png": (16, 64),
    "textures/block/shrine_pillar.png": (16, 16),
    "textures/block/shrine_pillar_top.png": (16, 16),
    "textures/block/shrine_roof.png": (16, 16),
    "textures/block/shrine_bone.png": (16, 16),
    "textures/block/cursed_blood.png": (16, 128),
    "textures/item/sukuna_finger.png": (16, 16),
    "textures/item/gojo_blindfold.png": (16, 16),
    "textures/item/gojo_spawn_egg.png": (16, 16),
    "textures/item/sukuna_spawn_egg.png": (16, 16),
    "textures/particle/shockwave.png": (32, 32),
    "textures/gui/emblem_gojo.png": (32, 32),
    "textures/gui/emblem_sukuna.png": (32, 32),
    "textures/gui/select_gojo.png": (160, 240),
    "textures/gui/select_sukuna.png": (160, 240),
    "textures/gui/vignette_void.png": (256, 256),
    "textures/gui/vignette_red.png": (256, 256),
    "textures/gui/info_overload.png": (256, 256),
    "textures/gui/qte_ring.png": (64, 64),
    "textures/gui/qte_key.png": (32, 32),
    "icon.png": (128, 128),
}
for _p, _s, _n in [("blue_spark", 8, 4), ("red_spark", 8, 4), ("purple_spark", 8, 4), ("ce_wisp_blue", 16, 4),
                   ("ce_wisp_red", 16, 4), ("slash", 16, 4), ("slash_red", 16, 4), ("black_flash", 16, 4),
                   ("void_star", 8, 4), ("impact_flash", 32, 4), ("rct_glow", 8, 4), ("fuga_flame", 16, 4),
                   ("blood", 8, 2), ("domain_ember", 8, 4)]:
    for _i in range(_n):
        TEXTURES[f"textures/particle/{_p}_{_i}.png"] = (_s, _s)
for _icon in ["blue", "red", "blink", "hollow_purple", "infinity", "unlimited_void", "dismantle", "cleave", "fuga",
              "world_slash", "domain_amplification", "malevolent_shrine", "reverse_cursed_technique", "black_flash",
              "dodge", "block", "locked"]:
    TEXTURES[f"textures/gui/icons/{_icon}.png"] = (32, 32)

MCMETA = {  # path -> (frametime, interpolate, frames)
    "textures/block/unlimited_void_barrier.png.mcmeta": (4, True, 8),
    "textures/block/void_floor.png.mcmeta": (8, True, 4),
    "textures/block/cursed_blood.png.mcmeta": (3, True, 8),
}

# sound path -> (channels, nominal duration seconds, loop?)
SOUNDS = {
    "sounds/gojo/infinity_on.ogg": (1, 0.8, False), "sounds/gojo/infinity_off.ogg": (1, 0.6, False),
    "sounds/gojo/infinity_block.ogg": (1, 0.4, False), "sounds/gojo/blue_cast.ogg": (1, 1.0, False),
    "sounds/gojo/blue_loop.ogg": (1, 2.0, True), "sounds/gojo/red_charge.ogg": (1, 1.2, False),
    "sounds/gojo/red_fire.ogg": (1, 0.7, False), "sounds/gojo/red_impact.ogg": (1, 2.0, False),
    "sounds/gojo/purple_charge.ogg": (1, 3.0, False), "sounds/gojo/purple_fire.ogg": (1, 3.5, False),
    "sounds/gojo/blink.ogg": (1, 0.35, False), "sounds/gojo/void_activate.ogg": (1, 4.0, False),
    "sounds/gojo/void_ambient.ogg": (1, 6.0, True),
    "sounds/sukuna/dismantle.ogg": (1, 0.45, False), "sounds/sukuna/dismantle_barrage.ogg": (1, 1.2, False),
    "sounds/sukuna/cleave.ogg": (1, 0.8, False), "sounds/sukuna/fuga_charge.ogg": (1, 2.0, False),
    "sounds/sukuna/fuga_fire.ogg": (1, 1.0, False), "sounds/sukuna/fuga_explode.ogg": (1, 3.0, False),
    "sounds/sukuna/world_slash_charge.ogg": (1, 3.0, False), "sounds/sukuna/world_slash.ogg": (1, 2.5, False),
    "sounds/sukuna/shrine_activate.ogg": (1, 4.0, False), "sounds/sukuna/shrine_ambient.ogg": (1, 6.0, True),
    "sounds/sukuna/shrine_slash.ogg": (1, 0.3, False), "sounds/sukuna/amplification_on.ogg": (1, 0.7, False),
    "sounds/combat/punch_light.ogg": (1, 0.2, False), "sounds/combat/punch_heavy.ogg": (1, 0.35, False),
    "sounds/combat/combo_finisher.ogg": (1, 0.6, False), "sounds/combat/black_flash.ogg": (1, 1.2, False),
    "sounds/combat/dodge.ogg": (1, 0.3, False), "sounds/combat/block.ogg": (1, 0.3, False),
    "sounds/combat/parry.ogg": (1, 0.6, False), "sounds/combat/counter.ogg": (1, 0.5, False),
    "sounds/combat/double_jump.ogg": (1, 0.35, False), "sounds/combat/slam.ogg": (1, 1.2, False),
    "sounds/combat/finisher.ogg": (1, 1.5, False), "sounds/combat/rct.ogg": (1, 1.0, False),
    "sounds/domain/clash.ogg": (1, 3.0, True), "sounds/domain/shatter.ogg": (1, 2.0, False),
    "sounds/domain/barrier_form.ogg": (1, 1.5, False), "sounds/domain/clash_win.ogg": (1, 1.5, False),
    "sounds/ui/qte_prompt.ogg": (1, 0.4, False), "sounds/ui/qte_success.ogg": (1, 0.6, False),
    "sounds/ui/qte_fail.ogg": (1, 0.6, False), "sounds/ui/select.ogg": (1, 0.5, False),
    "sounds/ui/level_up.ogg": (1, 1.0, False), "sounds/ui/cinematic_hit.ogg": (1, 1.5, False),
    "sounds/music/battle_gojo.ogg": (2, 75.0, True), "sounds/music/battle_sukuna.ogg": (2, 75.0, True),
    "sounds/music/unlimited_void.ogg": (2, 45.0, True), "sounds/music/malevolent_shrine.ogg": (2, 45.0, True),
}
VOICE_GOJO = ["domain", "honored_one", "blue", "red", "purple", "purple_incantation", "nah_id_win", "strongest",
              "intro", "taunt", "victory", "defeat", "select", "infinity", "clash"]
VOICE_SUKUNA = ["domain", "dismantle", "cleave", "fuga", "incantation", "world_slash", "know_your_place",
                "stand_proud", "intro", "taunt", "victory", "defeat", "select", "clash"]
for _k in VOICE_GOJO:
    SOUNDS[f"sounds/voice/gojo/{_k}.ogg"] = (1, None, False)
for _k in VOICE_SUKUNA:
    SOUNDS[f"sounds/voice/sukuna/{_k}.ogg"] = (1, None, False)
