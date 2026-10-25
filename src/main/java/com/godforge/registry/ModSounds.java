package com.godforge.registry;

import com.godforge.Godforge;
import net.minecraft.core.Holder;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.sounds.SoundEvent;

public final class ModSounds {
	public static final SoundEvent CHARGE_UP = register("charge_up");
	public static final SoundEvent MODE_SWITCH = register("mode_switch");
	public static final SoundEvent BIG_EXPLOSION = register("big_explosion");
	public static final SoundEvent SHOCKWAVE = register("shockwave");
	public static final SoundEvent DEBRIS_IMPACT = register("debris_impact");

	public static final SoundEvent WORLDCUTTER_SLASH = register("worldcutter_slash");
	public static final SoundEvent WORLDCUTTER_SEVER = register("worldcutter_sever");
	public static final SoundEvent WORLDCUTTER_RUMBLE = register("worldcutter_rumble");

	public static final SoundEvent LASER_LOOP = register("laser_loop");
	public static final SoundEvent LASER_START = register("laser_start");
	public static final SoundEvent LASER_STOP = register("laser_stop");
	public static final SoundEvent LASER_OVERLOAD = register("laser_overload");

	public static final SoundEvent ORB_CHARGE = register("orb_charge");
	public static final SoundEvent ORB_FIRE = register("orb_fire");
	public static final SoundEvent ORB_TRAVEL = register("orb_travel");
	public static final SoundEvent ORB_IMPACT = register("orb_impact");

	public static final SoundEvent ASTEROID_LOCK = register("asteroid_lock");
	public static final SoundEvent ASTEROID_INCOMING = register("asteroid_incoming");
	public static final SoundEvent ASTEROID_IMPACT = register("asteroid_impact");

	public static final SoundEvent BLACKHOLE_LAUNCH = register("blackhole_launch");
	public static final SoundEvent BLACKHOLE_LOOP = register("blackhole_loop");
	public static final SoundEvent BLACKHOLE_COLLAPSE = register("blackhole_collapse");

	public static final SoundEvent REALITY_SHATTER = register("reality_shatter");
	public static final SoundEvent RIFT_LOOP = register("rift_loop");
	public static final SoundEvent REALITY_COLLAPSE = register("reality_collapse");

	public static final SoundEvent STARFALL_SHOOT = register("starfall_shoot");
	public static final SoundEvent STAR_IMPACT = register("star_impact");
	public static final SoundEvent STARFALL_JUDGMENT = register("starfall_judgment");

	public static final SoundEvent GODFIST_PUNCH = register("godfist_punch");
	public static final SoundEvent GODFIST_SHOCKWAVE = register("godfist_shockwave");
	public static final SoundEvent GODFIST_SLAM = register("godfist_slam");

	public static final SoundEvent SUNFORGE_BOLT = register("sunforge_bolt");
	public static final SoundEvent SUN_LOOP = register("sun_loop");
	public static final SoundEvent SOLAR_ERUPTION = register("solar_eruption");

	public static final SoundEvent CRACKER_CHARGE = register("cracker_charge");
	public static final SoundEvent CRACKER_FIRE = register("cracker_fire");
	public static final SoundEvent CRACKER_IMPACT = register("cracker_impact");
	public static final SoundEvent ORBITAL_STRIKE = register("orbital_strike");

	private ModSounds() {
	}

	private static SoundEvent register(String name) {
		return Registry.register(BuiltInRegistries.SOUND_EVENT, Godforge.id(name), SoundEvent.createVariableRangeEvent(Godforge.id(name)));
	}

	public static Holder<SoundEvent> holder(SoundEvent event) {
		return BuiltInRegistries.SOUND_EVENT.wrapAsHolder(event);
	}

	public static void init() {
	}
}
