package com.extremesports.trick;

public enum LandingQuality {
	PERFECT(1.25F, 0x5CFF7A),
	CLEAN(1.0F, 0xFFFFFF),
	SKETCHY(0.6F, 0xFFD24A),
	BAIL(0.0F, 0xFF4A4A);

	public final float multiplier;
	public final int color;

	LandingQuality(float multiplier, int color) {
		this.multiplier = multiplier;
		this.color = color;
	}

	public String translationKey() {
		return "landing.extremesports." + name().toLowerCase(java.util.Locale.ROOT);
	}

	public static LandingQuality byOrdinal(int ordinal) {
		LandingQuality[] values = values();
		return ordinal >= 0 && ordinal < values.length ? values[ordinal] : CLEAN;
	}
}
