package dev.overkill.registry;

import dev.overkill.OverkillArsenal;
import dev.overkill.entity.RiftEntity;
import dev.overkill.entity.SingularityEntity;
import dev.overkill.entity.SingularityRoundEntity;
import dev.overkill.entity.WorldbreakerOrbEntity;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.MobCategory;

public final class ModEntities {
	public static final EntityType<WorldbreakerOrbEntity> WORLDBREAKER_ORB = register("worldbreaker_orb",
		EntityType.Builder.<WorldbreakerOrbEntity>of(WorldbreakerOrbEntity::new, MobCategory.MISC)
			.sized(1.0F, 1.0F).clientTrackingRange(16).updateInterval(1).noSave().fireImmune());

	public static final EntityType<RiftEntity> RIFT = register("rift",
		EntityType.Builder.<RiftEntity>of(RiftEntity::new, MobCategory.MISC)
			.sized(0.5F, 0.5F).clientTrackingRange(10).updateInterval(1).noSave().fireImmune());

	public static final EntityType<SingularityRoundEntity> SINGULARITY_ROUND = register("singularity_round",
		EntityType.Builder.<SingularityRoundEntity>of(SingularityRoundEntity::new, MobCategory.MISC)
			.sized(0.4F, 0.4F).clientTrackingRange(8).updateInterval(2).noSave());

	public static final EntityType<SingularityEntity> SINGULARITY = register("singularity",
		EntityType.Builder.<SingularityEntity>of(SingularityEntity::new, MobCategory.MISC)
			.sized(1.0F, 1.0F).clientTrackingRange(16).updateInterval(2).noSave().fireImmune());

	private ModEntities() {
	}

	private static <T extends Entity> EntityType<T> register(String name, EntityType.Builder<T> builder) {
		ResourceKey<EntityType<?>> key = ResourceKey.create(Registries.ENTITY_TYPE, OverkillArsenal.id(name));
		return Registry.register(BuiltInRegistries.ENTITY_TYPE, key, builder.build(key));
	}

	public static void init() {
	}
}
