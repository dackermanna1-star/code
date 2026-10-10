package com.blademode.client.gore;

import java.util.Set;
import net.minecraft.tags.EntityTypeTags;
import net.minecraft.world.entity.EntityType;
import org.jspecify.annotations.Nullable;

/**
 * What a creature is made of: the color that comes out when it is cut, the color of the cut faces,
 * and (with Visceral installed) Visceral's own blood type for it.
 *
 * @param blood    0xRRGGBB of what sprays out
 * @param flesh    0xRRGGBB tint of the cut faces
 * @param visceral Visceral's {@code BloodType}, or null without Visceral
 */
record BloodStyle(int blood, int flesh, Kind kind, @Nullable Object visceral) {
	enum Kind {
		LIQUID, SLIME, BONE, METAL, WOOD, SNOW, EMBER, SPIRIT, NONE;

		boolean bleeds() {
			return this == LIQUID || this == SLIME;
		}
	}

	private static final Set<EntityType<?>> PURPLE = Set.of(EntityType.ENDERMAN, EntityType.ENDERMITE, EntityType.SHULKER, EntityType.ENDER_DRAGON);

	static BloodStyle of(EntityType<?> type) {
		Object visceral = VisceralBridge.bloodType(type);
		if (visceral != null) {
			Kind kind = switch (VisceralBridge.material(visceral)) {
				case "GOO" -> Kind.SLIME;
				case "BONE" -> Kind.BONE;
				case "METAL" -> Kind.METAL;
				case "WOOD" -> Kind.WOOD;
				case "SNOW" -> Kind.SNOW;
				case "EMBER" -> Kind.EMBER;
				case "SPIRIT" -> Kind.SPIRIT;
				case "NONE" -> Kind.NONE;
				default -> Kind.LIQUID;
			};
			int color = VisceralBridge.freshColor(visceral);
			return new BloodStyle(color, fleshFor(color, kind), kind, visceral);
		}
		return builtIn(type);
	}

	/** Without Visceral: a small table in the same spirit. */
	private static BloodStyle builtIn(EntityType<?> type) {
		if (type == EntityType.ARMOR_STAND) {
			return of(0x6E4B2C, Kind.NONE);
		}
		if (type.is(EntityTypeTags.SKELETONS) || type == EntityType.SKELETON_HORSE) {
			return of(0xE6E0CF, Kind.BONE);
		}
		if (type == EntityType.IRON_GOLEM) {
			return of(0xBDBDBD, Kind.METAL);
		}
		if (type == EntityType.COPPER_GOLEM) {
			return of(0xC27142, Kind.METAL);
		}
		if (type == EntityType.SNOW_GOLEM) {
			return of(0xF2F7FF, Kind.SNOW);
		}
		if (type == EntityType.CREAKING) {
			return of(0x6E4B2C, Kind.WOOD);
		}
		if (type == EntityType.BLAZE) {
			return of(0xFFB04A, Kind.EMBER);
		}
		if (type == EntityType.VEX || type == EntityType.ALLAY || type == EntityType.BREEZE) {
			return of(0xBDEBFF, Kind.SPIRIT);
		}
		if (type == EntityType.SLIME) {
			return of(0x6FCB52, Kind.SLIME);
		}
		if (type == EntityType.MAGMA_CUBE || type == EntityType.STRIDER) {
			return of(0xFF7316, Kind.LIQUID);
		}
		if (type == EntityType.SQUID) {
			return of(0x1E3F9C, Kind.LIQUID);
		}
		if (type == EntityType.GLOW_SQUID) {
			return of(0x22B8B2, Kind.LIQUID);
		}
		if (PURPLE.contains(type)) {
			return of(0x5C1878, Kind.LIQUID);
		}
		if (type.is(EntityTypeTags.ARTHROPOD) || type == EntityType.CREEPER) {
			return of(0x74901E, Kind.LIQUID);
		}
		if (type.is(EntityTypeTags.ZOMBIES) || type.is(EntityTypeTags.UNDEAD)) {
			return of(0x4C1C0E, Kind.LIQUID);
		}
		return of(0x8C0A06, Kind.LIQUID);
	}

	private static BloodStyle of(int color, Kind kind) {
		return new BloodStyle(color, fleshFor(color, kind), kind, null);
	}

	/** Cut faces: meat is paler than the blood it holds; bone, metal and wood show their own color. */
	private static int fleshFor(int blood, Kind kind) {
		return kind.bleeds() ? lerp(blood, 0xE8A090, 0.35F) : blood;
	}

	static int lerp(int a, int b, float t) {
		int r = (int) (((a >> 16) & 0xFF) + (((b >> 16) & 0xFF) - ((a >> 16) & 0xFF)) * t);
		int g = (int) (((a >> 8) & 0xFF) + (((b >> 8) & 0xFF) - ((a >> 8) & 0xFF)) * t);
		int bl = (int) ((a & 0xFF) + ((b & 0xFF) - (a & 0xFF)) * t);
		return (r << 16) | (g << 8) | bl;
	}
}
