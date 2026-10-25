package com.godforge.weapon;

import net.minecraft.util.Mth;

/** Palette for the configurable Laser Beam colour (index {@link #RAINBOW} cycles through every hue). */
public final class BeamColors {
	public static final int[] COLORS = {
		0xFF2A2A, // crimson
		0xFF7A1A, // solar orange
		0xFFD21F, // gold
		0x7CFF3A, // toxic green
		0x22FFC8, // aqua
		0x2AB8FF, // azure
		0x3A5BFF, // cobalt
		0x9B4DFF, // violet
		0xFF3DE0, // magenta
		0xFFFFFF, // white
	};
	public static final String[] NAMES = {"crimson", "solar", "gold", "toxic", "aqua", "azure", "cobalt", "violet", "magenta", "white", "rainbow"};
	public static final int RAINBOW = COLORS.length;
	public static final int COUNT = COLORS.length + 1;

	private BeamColors() {
	}

	/** Resolves a palette index to RGB, animating the rainbow entry with {@code time} (ticks). */
	public static int rgb(int index, float time) {
		if (index >= 0 && index < COLORS.length) {
			return COLORS[index];
		}
		return Mth.hsvToRgb((time * 0.01F) % 1.0F, 0.85F, 1.0F);
	}
}
