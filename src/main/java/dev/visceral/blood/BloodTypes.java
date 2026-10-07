package dev.visceral.blood;

import dev.visceral.VisceralConfig;
import java.util.IdentityHashMap;
import java.util.Map;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.tags.EntityTypeTags;
import net.minecraft.world.entity.EntityType;

/** Maps entity types to their blood. Config overrides win over the built-in table. */
public final class BloodTypes {
	private static final Map<EntityType<?>, BloodType> DEFAULTS = new IdentityHashMap<>();

	static {
		put(BloodType.DARK, EntityType.ZOMBIE, EntityType.HUSK, EntityType.DROWNED, EntityType.ZOMBIE_VILLAGER, EntityType.ZOMBIFIED_PIGLIN,
			EntityType.ZOGLIN, EntityType.ZOMBIE_HORSE, EntityType.CAMEL_HUSK, EntityType.PHANTOM, EntityType.GIANT);
		put(BloodType.BONE, EntityType.SKELETON, EntityType.STRAY, EntityType.BOGGED, EntityType.WITHER_SKELETON, EntityType.SKELETON_HORSE,
			EntityType.PARCHED);
		put(BloodType.BLACK, EntityType.WITHER);
		put(BloodType.GREEN, EntityType.SPIDER, EntityType.CAVE_SPIDER, EntityType.SILVERFISH, EntityType.BEE, EntityType.CREEPER);
		put(BloodType.PURPLE, EntityType.ENDERMAN, EntityType.ENDERMITE, EntityType.SHULKER, EntityType.ENDER_DRAGON);
		put(BloodType.SLIME, EntityType.SLIME);
		put(BloodType.MAGMA, EntityType.MAGMA_CUBE, EntityType.STRIDER);
		put(BloodType.BLUE, EntityType.SQUID, EntityType.NAUTILUS);
		put(BloodType.DARK, EntityType.ZOMBIE_NAUTILUS);
		put(BloodType.CYAN, EntityType.GLOW_SQUID);
		put(BloodType.SCULK, EntityType.WARDEN);
		put(BloodType.METAL, EntityType.IRON_GOLEM);
		put(BloodType.COPPER, EntityType.COPPER_GOLEM);
		put(BloodType.SNOW, EntityType.SNOW_GOLEM);
		put(BloodType.WOOD, EntityType.CREAKING);
		put(BloodType.EMBER, EntityType.BLAZE);
		put(BloodType.SPIRIT, EntityType.VEX, EntityType.ALLAY, EntityType.BREEZE);
		put(BloodType.NONE, EntityType.ARMOR_STAND, EntityType.MANNEQUIN);
	}

	private BloodTypes() {
	}

	private static void put(BloodType type, EntityType<?>... types) {
		for (EntityType<?> entityType : types) {
			DEFAULTS.put(entityType, type);
		}
	}

	public static BloodType of(EntityType<?> type) {
		Map<String, String> overrides = VisceralConfig.get().bloodTypeOverrides;
		if (!overrides.isEmpty()) {
			BloodType override = BloodType.byName(overrides.get(BuiltInRegistries.ENTITY_TYPE.getKey(type).toString()));
			if (override != null) {
				return override;
			}
		}
		BloodType known = DEFAULTS.get(type);
		if (known != null) {
			return known;
		}
		// Sensible guesses for modded creatures.
		if (type.is(EntityTypeTags.SKELETONS)) {
			return BloodType.BONE;
		}
		if (type.is(EntityTypeTags.ZOMBIES) || type.is(EntityTypeTags.UNDEAD)) {
			return BloodType.DARK;
		}
		if (type.is(EntityTypeTags.ARTHROPOD)) {
			return BloodType.GREEN;
		}
		return BloodType.RED;
	}
}
