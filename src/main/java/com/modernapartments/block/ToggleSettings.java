package com.modernapartments.block;

import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundEvents;
import org.jspecify.annotations.Nullable;

/**
 * Behaviour of a switchable fixture or appliance.
 *
 * @param light        light level emitted while on
 * @param autoOffTicks if positive, the appliance finishes its cycle and switches off after this many ticks
 * @param toggleSound  played when switched
 * @param doneSound    played when an automatic cycle finishes
 * @param effect       client-side particles/ambient sound while on
 * @param waterSource  while on, empty bottles and buckets can be filled here
 */
public record ToggleSettings(int light, int autoOffTicks, SoundEvent toggleSound, @Nullable SoundEvent doneSound,
		Effect effect, boolean waterSource, boolean wallMounted) {

	public enum Effect {
		NONE, SINK, SHOWER, SPRAYER, WASHER, DRYER, DISHWASHER, FIREPLACE, GRILL, HEATER
	}

	public static ToggleSettings screen(int light) {
		return new ToggleSettings(light, 0, SoundEvents.STONE_BUTTON_CLICK_ON, null, Effect.NONE, false, false);
	}

	public static ToggleSettings appliance(int cycleTicks, Effect effect) {
		return new ToggleSettings(0, cycleTicks, SoundEvents.STONE_BUTTON_CLICK_ON, SoundEvents.NOTE_BLOCK_CHIME.value(), effect,
			false, false);
	}

	public static ToggleSettings water(Effect effect, boolean wallMounted) {
		return new ToggleSettings(0, 0, SoundEvents.LEVER_CLICK, null, effect, true, wallMounted);
	}

	public static ToggleSettings heat(int light, Effect effect, boolean wallMounted) {
		return new ToggleSettings(light, 0, SoundEvents.FLINTANDSTEEL_USE, null, effect, false, wallMounted);
	}

	public boolean hasEffects() {
		return effect != Effect.NONE;
	}
}
