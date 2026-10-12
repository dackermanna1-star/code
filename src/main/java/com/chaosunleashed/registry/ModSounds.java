package com.chaosunleashed.registry;

import com.chaosunleashed.ChaosUnleashed;
import net.minecraft.registry.Registries;
import net.minecraft.registry.Registry;
import net.minecraft.sound.SoundEvent;
import net.minecraft.util.Identifier;

/**
 * All mod sounds. PLACEHOLDER: every entry in assets/chaosunleashed/sounds.json currently points at (pitched)
 * vanilla sound files. Drop real .ogg files into assets/chaosunleashed/sounds/ and update sounds.json to replace
 * them; the sound event ids stay the same.
 */
public final class ModSounds {
	public static final SoundEvent ALIEN_WARNING = register("event.alien_invasion.warning");
	public static final SoundEvent UFO_HUM = register("entity.ufo.hum");
	public static final SoundEvent UFO_BEAM = register("entity.ufo.beam");
	public static final SoundEvent UFO_CRASH = register("entity.ufo.crash");
	public static final SoundEvent PLASMA_SHOOT = register("entity.plasma.shoot");
	public static final SoundEvent PLASMA_HIT = register("entity.plasma.hit");
	public static final SoundEvent ALIEN_AMBIENT = register("entity.alien_soldier.ambient");
	public static final SoundEvent ALIEN_HURT = register("entity.alien_soldier.hurt");
	public static final SoundEvent ALIEN_DEATH = register("entity.alien_soldier.death");

	public static final SoundEvent BLOOD_MOON_WARNING = register("event.blood_moon.warning");
	public static final SoundEvent ZOMBIE_SCREAM = register("entity.zombie.scream");
	public static final SoundEvent BLOOD_MOON_DAWN = register("event.blood_moon.dawn");

	public static final SoundEvent KAIJU_WARNING = register("event.kaiju_attack.warning");
	public static final SoundEvent KAIJU_STEP = register("entity.kaiju.step");
	public static final SoundEvent KAIJU_ROAR = register("entity.kaiju.roar");
	public static final SoundEvent KAIJU_BEAM = register("entity.kaiju.beam");
	public static final SoundEvent KAIJU_HURT = register("entity.kaiju.hurt");
	public static final SoundEvent KAIJU_DEATH = register("entity.kaiju.death");

	public static final SoundEvent BLACK_HOLE_WARNING = register("event.black_hole.warning");
	public static final SoundEvent BLACK_HOLE_HUM = register("entity.black_hole.hum");
	public static final SoundEvent BLACK_HOLE_COLLAPSE = register("entity.black_hole.collapse");
	public static final SoundEvent BLACK_HOLE_STABILIZE = register("entity.black_hole.stabilize");

	public static final SoundEvent SOLAR_FLARE_WARNING = register("event.solar_flare.warning");
	public static final SoundEvent SOLAR_FLARE_BURN = register("event.solar_flare.burn");

	public static final SoundEvent GRAVITY_FLIP_WARNING = register("event.gravity_flip.warning");
	public static final SoundEvent GRAVITY_FLIP_START = register("event.gravity_flip.start");
	public static final SoundEvent GRAVITY_FLIP_END = register("event.gravity_flip.end");

	public static final SoundEvent ECLIPSE_WARNING = register("event.eclipse.warning");
	public static final SoundEvent ECLIPSE_TOTALITY = register("event.eclipse.totality");
	public static final SoundEvent SHADE_STALKER_AMBIENT = register("entity.shade_stalker.ambient");
	public static final SoundEvent SHADE_STALKER_HURT = register("entity.shade_stalker.hurt");
	public static final SoundEvent SHADE_STALKER_DEATH = register("entity.shade_stalker.death");

	public static final SoundEvent RIFT_WARNING = register("event.dimension_rift.warning");
	public static final SoundEvent RIFT_TEAR = register("entity.rift.tear");
	public static final SoundEvent RIFT_CLOSE = register("entity.rift.close");

	public static final SoundEvent STAMPEDE_WARNING = register("event.herd_stampede.warning");
	public static final SoundEvent STAMPEDE_RUMBLE = register("event.herd_stampede.rumble");
	public static final SoundEvent BISON_AMBIENT = register("entity.bison.ambient");
	public static final SoundEvent BISON_HURT = register("entity.bison.hurt");
	public static final SoundEvent BISON_DEATH = register("entity.bison.death");

	public static final SoundEvent EVENT_END = register("event.end");
	public static final SoundEvent PANEL_CLICK = register("block.chaos_control_panel.click");

	private ModSounds() {
	}

	private static SoundEvent register(String name) {
		Identifier id = ChaosUnleashed.id(name);
		return Registry.register(Registries.SOUND_EVENT, id, SoundEvent.of(id));
	}

	public static void init() {
	}
}
