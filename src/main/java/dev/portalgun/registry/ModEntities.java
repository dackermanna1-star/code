package dev.portalgun.registry;

import dev.portalgun.PortalGunMod;
import dev.portalgun.entity.PortalEntity;
import dev.portalgun.entity.PortalShotEntity;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.MobCategory;

public final class ModEntities {
	public static final EntityType<PortalEntity> PORTAL = register("portal",
		EntityType.Builder.<PortalEntity>of(PortalEntity::new, MobCategory.MISC)
			.sized(PortalEntity.WIDTH, PortalEntity.HEIGHT)
			.noLootTable()
			.fireImmune()
			.clientTrackingRange(10)
			.updateInterval(20));
	public static final EntityType<PortalShotEntity> PORTAL_SHOT = register("portal_shot",
		EntityType.Builder.<PortalShotEntity>of(PortalShotEntity::new, MobCategory.MISC)
			.sized(0.3F, 0.3F)
			.noLootTable()
			.clientTrackingRange(8)
			.updateInterval(1));

	private ModEntities() {
	}

	public static <T extends Entity> EntityType<T> register(String name, EntityType.Builder<T> builder) {
		ResourceKey<EntityType<?>> key = ResourceKey.create(Registries.ENTITY_TYPE, PortalGunMod.id(name));
		return Registry.register(BuiltInRegistries.ENTITY_TYPE, key, builder.build(key));
	}

	public static void init() {
	}
}
