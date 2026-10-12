package com.extremesports.registry;

import com.extremesports.ExtremeSports;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.sounds.SoundEvent;

public final class ModSounds {
	public static final SoundEvent ROLL_CONCRETE = register("skate.roll_concrete");
	public static final SoundEvent ROLL_WOOD = register("skate.roll_wood");
	public static final SoundEvent ROLL_ROUGH = register("skate.roll_rough");
	public static final SoundEvent PUSH = register("skate.push");
	public static final SoundEvent POP = register("skate.pop");
	public static final SoundEvent FLIP = register("skate.flip");
	public static final SoundEvent LAND = register("skate.land");
	public static final SoundEvent LAND_HARD = register("skate.land_hard");
	public static final SoundEvent BRAKE = register("skate.brake");
	public static final SoundEvent GRIND_METAL = register("grind.metal");
	public static final SoundEvent GRIND_CONCRETE = register("grind.concrete");
	public static final SoundEvent BAIL = register("bail");
	public static final SoundEvent BMX_FREEWHEEL = register("bmx.freewheel");
	public static final SoundEvent BMX_PEDAL = register("bmx.pedal");
	public static final SoundEvent BMX_LAND = register("bmx.land");
	public static final SoundEvent BMX_BRAKE = register("bmx.brake");
	public static final SoundEvent BMX_SPIN = register("bmx.spin");
	public static final SoundEvent SCOOTER_KICK = register("scooter.kick");
	public static final SoundEvent SCOOTER_LAND = register("scooter.land");
	public static final SoundEvent SKATES_STRIDE = register("skates.stride");
	public static final SoundEvent SKATES_LAND = register("skates.land");
	public static final SoundEvent WIND = register("wind");
	public static final SoundEvent UI_TRICK = register("ui.trick");
	public static final SoundEvent UI_PERFECT = register("ui.perfect");
	public static final SoundEvent UI_FAIL = register("ui.fail");
	public static final SoundEvent UI_CHECKPOINT = register("ui.checkpoint");
	public static final SoundEvent UI_COUNTDOWN = register("ui.countdown");
	public static final SoundEvent UI_GO = register("ui.go");
	public static final SoundEvent UI_FINISH = register("ui.finish");
	public static final SoundEvent UI_CLICK = register("ui.click");
	public static final SoundEvent UI_UNLOCK = register("ui.unlock");

	private static SoundEvent register(String name) {
		Identifier id = ExtremeSports.id(name);
		return Registry.register(BuiltInRegistries.SOUND_EVENT, id, SoundEvent.createVariableRangeEvent(id));
	}

	private ModSounds() {
	}

	public static void init() {
	}
}
