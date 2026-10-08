package dev.portalgun.registry;

import dev.portalgun.PortalGunMod;
import dev.portalgun.content.ContentSpec;
import dev.portalgun.creature.CreatureOrb;
import dev.portalgun.creature.SpecCreature;
import dev.portalgun.creature.SpecMonster;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import net.fabricmc.fabric.api.object.builder.v1.entity.FabricDefaultAttributeRegistry;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.tags.FluidTags;
import net.minecraft.util.RandomSource;
import net.minecraft.world.Difficulty;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.MobCategory;
import net.minecraft.world.entity.SpawnPlacementTypes;
import net.minecraft.world.entity.SpawnPlacements;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.monster.Monster;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.SpawnEggItem;
import net.minecraft.world.level.ServerLevelAccessor;
import net.minecraft.world.level.levelgen.Heightmap;
import org.jspecify.annotations.Nullable;

/** Registers the creatures described in the content spec: entity types, attributes, spawn rules and spawn eggs. */
public final class ModCreatures {
	public static final List<Item> SPAWN_EGGS = new ArrayList<>();
	/** Spec creature types in spec order (id -> type). */
	public static final Map<String, EntityType<SpecCreature>> TYPES = new LinkedHashMap<>();
	private static final Map<EntityType<?>, ContentSpec.CreatureSpec> SPECS = new HashMap<>();
	/** Read from the server thread and the client render thread at once in single-player. */
	private static final Map<String, SoundEvent> SOUND_CACHE = new java.util.concurrent.ConcurrentHashMap<>();

	public static final EntityType<CreatureOrb> ORB = ModEntities.register("creature_orb",
		EntityType.Builder.<CreatureOrb>of(CreatureOrb::new, MobCategory.MISC)
			.sized(0.4F, 0.4F)
			.noLootTable()
			.clientTrackingRange(6)
			.updateInterval(2));

	private ModCreatures() {
	}

	public static ContentSpec.CreatureSpec spec(EntityType<?> type) {
		ContentSpec.CreatureSpec s = SPECS.get(type);
		if (s == null) {
			throw new IllegalStateException("No creature spec for " + BuiltInRegistries.ENTITY_TYPE.getKey(type));
		}
		return s;
	}

	public static ContentSpec.@Nullable CreatureSpec specOrNull(EntityType<?> type) {
		return SPECS.get(type);
	}

	public static @Nullable SoundEvent sound(@Nullable String id) {
		if (id == null || id.isEmpty()) {
			return null;
		}
		return SOUND_CACHE.computeIfAbsent(id, k -> {
			Identifier rl = Identifier.tryParse(k);
			return rl == null ? null : BuiltInRegistries.SOUND_EVENT.getValue(rl);
		});
	}

	public static void init() {
		for (ContentSpec.CreatureSpec spec : ContentSpec.get().creatures) {
			try {
				register(spec);
			} catch (Exception e) {
				PortalGunMod.LOGGER.error("Failed to register creature {}", spec.id, e);
			}
		}
	}

	private static MobCategory category(String name) {
		try {
			return MobCategory.valueOf(name.toUpperCase(Locale.ROOT));
		} catch (IllegalArgumentException e) {
			return MobCategory.CREATURE;
		}
	}

	private static void register(ContentSpec.CreatureSpec spec) {
		boolean hostile = "hostile".equals(spec.behavior);
		MobCategory cat = category(spec.category);
		EntityType.Builder<SpecCreature> b = EntityType.Builder.<SpecCreature>of(hostile ? SpecMonster::new : SpecCreature::new, cat)
			.sized(Math.max(0.2F, spec.width), Math.max(0.2F, spec.height))
			.clientTrackingRange(Math.max(4, spec.trackingRange));
		if (spec.eyeHeight > 0) {
			b.eyeHeight(Math.min(spec.eyeHeight, spec.height));
		}
		if (spec.fireImmune) {
			b.fireImmune();
		}
		if (hostile) {
			b.notInPeaceful();
		}
		EntityType<SpecCreature> type = ModEntities.register(spec.id, b);
		SPECS.put(type, spec);
		TYPES.put(spec.id, type);

		AttributeSupplier.Builder attrs = Mob.createMobAttributes()
			.add(Attributes.MAX_HEALTH, spec.health)
			.add(Attributes.MOVEMENT_SPEED, spec.speed)
			.add(Attributes.FLYING_SPEED, spec.flySpeed)
			.add(Attributes.ATTACK_DAMAGE, spec.damage)
			.add(Attributes.ARMOR, spec.armor)
			.add(Attributes.FOLLOW_RANGE, spec.follow)
			.add(Attributes.KNOCKBACK_RESISTANCE, spec.knockbackResist)
			.add(Attributes.STEP_HEIGHT, spec.height > 1.6 ? 1.0 : 0.6)
			.add(Attributes.TEMPT_RANGE, 10.0);
		FabricDefaultAttributeRegistry.register(type, attrs);

		registerSpawn(type, spec);

		Item egg = ModItems.register(spec.id + "_spawn_egg", SpawnEggItem::new, new Item.Properties().spawnEgg(type));
		SPAWN_EGGS.add(egg);
	}

	private static void registerSpawn(EntityType<SpecCreature> type, ContentSpec.CreatureSpec spec) {
		boolean monster = "monster".equals(spec.category);
		boolean dark = "dark".equals(spec.spawnLight);
		switch (spec.placement) {
			case "water" -> SpawnPlacements.register(type, SpawnPlacementTypes.IN_WATER, Heightmap.Types.MOTION_BLOCKING_NO_LEAVES,
				(t, level, reason, pos, random) -> level.getFluidState(pos).is(FluidTags.WATER)
					&& level.getFluidState(pos.below()).is(FluidTags.WATER)
					&& lightOk(level, pos, random, reason, dark, monster));
			case "air" -> SpawnPlacements.register(type, SpawnPlacementTypes.NO_RESTRICTIONS, Heightmap.Types.MOTION_BLOCKING_NO_LEAVES,
				(t, level, reason, pos, random) -> level.isEmptyBlock(pos) && level.isEmptyBlock(pos.above())
					&& lightOk(level, pos, random, reason, dark, monster));
			default -> SpawnPlacements.register(type, SpawnPlacementTypes.ON_GROUND, Heightmap.Types.MOTION_BLOCKING_NO_LEAVES,
				(t, level, reason, pos, random) -> Mob.checkMobSpawnRules(t, level, reason, pos, random)
					&& lightOk(level, pos, random, reason, dark, monster));
		}
	}

	private static boolean lightOk(ServerLevelAccessor level, BlockPos pos, RandomSource random, EntitySpawnReason reason, boolean dark, boolean monster) {
		if (monster && level.getDifficulty() == Difficulty.PEACEFUL) {
			return false;
		}
		if (!dark || EntitySpawnReason.ignoresLightRequirements(reason)) {
			return true;
		}
		return Monster.isDarkEnoughToSpawn(level, pos, random);
	}
}
