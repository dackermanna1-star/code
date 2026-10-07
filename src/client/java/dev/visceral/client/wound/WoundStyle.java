package dev.visceral.client.wound;

import dev.visceral.blood.BloodType;
import dev.visceral.client.render.Atlas;
import dev.visceral.wound.Wound;
import dev.visceral.wound.WoundType;
import net.minecraft.util.ARGB;
import net.minecraft.util.Mth;

/** How each wound looks: texture cell, size and colour as it ages. */
public final class WoundStyle {
	private WoundStyle() {
	}

	public static boolean isFleshWound(WoundType type) {
		return type == WoundType.CUT || type == WoundType.GASH || type == WoundType.PUNCTURE || type == WoundType.BITE || type == WoundType.CLAW;
	}

	/** Returns -1 when this wound should not be drawn at all. */
	public static int cell(Wound wound, BloodType blood) {
		WoundType type = wound.type();
		boolean variant = (wound.seed() & 1) == 0;
		if (isFleshWound(type) && !blood.bleeds()) {
			return switch (blood.material) {
				case METAL -> Atlas.W_SCRATCH;
				case SPIRIT, NONE -> -1;
				default -> Atlas.W_CRACK;
			};
		}
		return switch (type) {
			case CUT -> variant ? Atlas.W_CUT_A : Atlas.W_CUT_B;
			case GASH -> Atlas.W_GASH;
			case PUNCTURE -> variant ? Atlas.W_PUNCTURE : Atlas.W_PUNCTURE_B;
			case BITE -> Atlas.W_BITE;
			case CLAW -> Atlas.W_CLAW;
			case BRUISE -> blood.material == BloodType.Material.LIQUID ? (variant ? Atlas.W_BRUISE_A : Atlas.W_BRUISE_B) : -1;
			case BURN -> variant ? Atlas.W_BURN_A : Atlas.W_BURN_B;
		};
	}

	/** Half size of the decal in model pixels. */
	public static float halfSize(Wound wound) {
		float s = wound.severity();
		float size = switch (wound.type()) {
			case CUT -> 2.2F + 2.6F * s;
			case GASH -> 2.8F + 3.0F * s;
			case PUNCTURE -> 0.9F + 0.8F * s;
			case BITE -> 2.0F + 1.2F * s;
			case CLAW -> 2.2F + 2.0F * s;
			case BRUISE -> 1.6F + 2.4F * s;
			case BURN -> 2.0F + 3.0F * s;
		};
		return Mth.clamp(size, 0.8F, 9.0F);
	}

	/**
	 * @param ageTicks   ticks since the wound was inflicted
	 * @param healTicks  ticks until it is fully healed
	 */
	public static int color(Wound wound, BloodType blood, float ageTicks, float healTicks, boolean dead) {
		float fade = dead ? 1.0F : 1.0F - Mth.clamp((ageTicks - healTicks * 0.7F) / (healTicks * 0.3F), 0.0F, 1.0F);
		if (fade <= 0.0F) {
			return 0;
		}
		WoundType type = wound.type();
		if (isFleshWound(type) && !blood.bleeds()) {
			int rgb = switch (blood.material) {
				case METAL -> 0xE8E8E8;
				case WOOD -> 0x2B1C0E;
				case SNOW -> 0x8FA6BA;
				case EMBER -> 0x24140A;
				default -> 0x3B342D;
			};
			return ARGB.color(Math.round(230 * fade), rgb);
		}
		return switch (type) {
			case BRUISE -> ARGB.color(Math.round(255 * fade * Mth.clamp(0.45F + wound.severity() * 0.35F, 0.0F, 0.9F)), bruiseColor(ageTicks));
			case BURN -> ARGB.color(Math.round(235 * fade), 0x2A1A12);
			default -> {
				// Fresh wounds are wet and bright, then clot and darken over a few minutes.
				float dryness = Mth.clamp(ageTicks / 3600.0F, 0.0F, 1.0F);
				int rgb = BloodType.lerpRgb(brighten(blood.fresh, 1.25F), blood.dried, dryness * 0.8F);
				yield ARGB.color(Math.round(255 * fade), rgb);
			}
		};
	}

	/** Colour of the blood running from a wound; fades after the wound stops bleeding. */
	public static int trickleColor(Wound wound, BloodType blood, float ageTicks, int bleedTicks, boolean dead) {
		float afterBleeding = ageTicks - bleedTicks - (dead ? 600 : 0);
		float alpha = afterBleeding <= 0 ? 0.92F : 0.92F - afterBleeding / 1800.0F;
		if (alpha <= 0.0F) {
			return 0;
		}
		// Grows in over the first second.
		alpha *= Mth.clamp(ageTicks / 20.0F, 0.0F, 1.0F);
		float dryness = Mth.clamp(ageTicks / 2400.0F, 0.0F, 1.0F);
		return ARGB.color(Math.round(255 * alpha), BloodType.lerpRgb(blood.fresh, blood.dried, dryness));
	}

	/** Bruises go red, purple, blue, then green and yellow as they heal. */
	public static int bruiseColor(float ageTicks) {
		float seconds = ageTicks / 20.0F;
		int red = 0x8A2E3E;
		int purple = 0x4E2552;
		int blue = 0x2E3266;
		int green = 0x5E6A2E;
		int yellow = 0x8C7E3A;
		if (seconds < 20.0F) {
			return BloodType.lerpRgb(red, purple, seconds / 20.0F);
		}
		if (seconds < 120.0F) {
			return BloodType.lerpRgb(purple, blue, (seconds - 20.0F) / 100.0F);
		}
		if (seconds < 300.0F) {
			return BloodType.lerpRgb(blue, green, (seconds - 120.0F) / 180.0F);
		}
		return BloodType.lerpRgb(green, yellow, (seconds - 300.0F) / 240.0F);
	}

	public static int brighten(int rgb, float factor) {
		int r = Math.min(255, Math.round(((rgb >> 16) & 0xFF) * factor));
		int g = Math.min(255, Math.round(((rgb >> 8) & 0xFF) * factor));
		int b = Math.min(255, Math.round((rgb & 0xFF) * factor));
		return (r << 16) | (g << 8) | b;
	}
}
