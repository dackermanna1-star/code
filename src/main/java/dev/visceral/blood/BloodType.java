package dev.visceral.blood;

import java.util.Locale;

/**
 * What comes out of a creature when it gets hurt. Colors are 0xRRGGBB; {@code fresh} is used for new
 * blood, {@code dried} is what stains darken to over time.
 */
public enum BloodType {
	RED(0x8C0A06, 0x3E0A06, Material.LIQUID),
	/** Rotten, congealed blood of the undead. */
	DARK(0x4C1C0E, 0x26120A, Material.LIQUID),
	/** Arthropod hemolymph. */
	GREEN(0x74901E, 0x3B4A12, Material.LIQUID),
	SLIME(0x6FCB52, 0x3F7D2F, Material.GOO),
	MAGMA(0xFF7316, 0x2E160B, Material.MAGMA),
	PURPLE(0x5C1878, 0x2C0C3A, Material.LIQUID),
	/** Copper based blood of cephalopods. */
	BLUE(0x1E3F9C, 0x0F1F4A, Material.LIQUID),
	CYAN(0x22B8B2, 0x0E4C4A, Material.LIQUID),
	SCULK(0x0F4D5A, 0x06262C, Material.LIQUID),
	BLACK(0x1E1414, 0x0E0A0A, Material.LIQUID),
	BONE(0xE6E0CF, 0x9A9486, Material.BONE),
	METAL(0xBDBDBD, 0x5A5A5A, Material.METAL),
	COPPER(0xC27142, 0x4E8E72, Material.METAL),
	WOOD(0x6E4B2C, 0x3A2817, Material.WOOD),
	SNOW(0xF2F7FF, 0xC6D2DE, Material.SNOW),
	EMBER(0xFFB04A, 0x3A2A20, Material.EMBER),
	SPIRIT(0xBDEBFF, 0x80A8C8, Material.SPIRIT),
	NONE(0x000000, 0x000000, Material.NONE);

	public enum Material {
		LIQUID(true, true),
		GOO(true, true),
		MAGMA(true, true),
		BONE(false, false),
		METAL(false, false),
		WOOD(false, false),
		SNOW(false, false),
		EMBER(false, false),
		SPIRIT(false, false),
		NONE(false, false);

		public final boolean bleeds;
		public final boolean stains;

		Material(boolean bleeds, boolean stains) {
			this.bleeds = bleeds;
			this.stains = stains;
		}
	}

	public final int fresh;
	public final int dried;
	public final Material material;

	BloodType(int fresh, int dried, Material material) {
		this.fresh = fresh;
		this.dried = dried;
		this.material = material;
	}

	public boolean bleeds() {
		return this.material.bleeds;
	}

	public boolean stains() {
		return this.material.stains;
	}

	public boolean glows() {
		return this == MAGMA || this == CYAN;
	}

	public String serializedName() {
		return this.name().toLowerCase(Locale.ROOT);
	}

	public static BloodType byName(String name) {
		if (name == null) {
			return null;
		}
		try {
			return BloodType.valueOf(name.trim().toUpperCase(Locale.ROOT));
		} catch (IllegalArgumentException e) {
			return null;
		}
	}

	/** Linear interpolation between the fresh and dried color for {@code dryness} in [0, 1]. */
	public int colorAt(float dryness) {
		return lerpRgb(this.fresh, this.dried, dryness);
	}

	public static int lerpRgb(int a, int b, float t) {
		t = Math.max(0.0F, Math.min(1.0F, t));
		int r = (int) (((a >> 16) & 0xFF) + (((b >> 16) & 0xFF) - ((a >> 16) & 0xFF)) * t);
		int g = (int) (((a >> 8) & 0xFF) + (((b >> 8) & 0xFF) - ((a >> 8) & 0xFF)) * t);
		int bl = (int) ((a & 0xFF) + ((b & 0xFF) - (a & 0xFF)) * t);
		return (r << 16) | (g << 8) | bl;
	}
}
