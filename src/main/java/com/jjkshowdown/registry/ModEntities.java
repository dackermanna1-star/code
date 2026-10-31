package com.jjkshowdown.registry;

import com.jjkshowdown.JjkShowdown;
import com.jjkshowdown.domain.DomainEntity;
import com.jjkshowdown.entity.FlyingDebrisEntity;
import com.jjkshowdown.entity.boss.GojoBoss;
import com.jjkshowdown.entity.boss.SorcererBoss;
import com.jjkshowdown.entity.boss.SukunaBoss;
import com.jjkshowdown.entity.projectile.BlueEntity;
import com.jjkshowdown.entity.projectile.DismantleEntity;
import com.jjkshowdown.entity.projectile.FugaEntity;
import com.jjkshowdown.entity.projectile.HollowPurpleEntity;
import com.jjkshowdown.entity.projectile.RedEntity;
import com.jjkshowdown.entity.projectile.WorldSlashEntity;
import net.fabricmc.fabric.api.object.builder.v1.entity.FabricDefaultAttributeRegistry;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.MobCategory;

public final class ModEntities {
	public static final EntityType<BlueEntity> BLUE = reg("blue",
			EntityType.Builder.<BlueEntity>of(BlueEntity::new, MobCategory.MISC).sized(0.5f, 0.5f).clientTrackingRange(10).updateInterval(1).noSummon());
	public static final EntityType<RedEntity> RED = reg("red",
			EntityType.Builder.<RedEntity>of(RedEntity::new, MobCategory.MISC).sized(0.6f, 0.6f).clientTrackingRange(10).updateInterval(1).noSummon());
	public static final EntityType<HollowPurpleEntity> HOLLOW_PURPLE = reg("hollow_purple",
			EntityType.Builder.<HollowPurpleEntity>of(HollowPurpleEntity::new, MobCategory.MISC).sized(1.0f, 1.0f).clientTrackingRange(16).updateInterval(1).noSummon());
	public static final EntityType<DismantleEntity> DISMANTLE = reg("dismantle",
			EntityType.Builder.<DismantleEntity>of(DismantleEntity::new, MobCategory.MISC).sized(0.4f, 0.4f).clientTrackingRange(8).updateInterval(1).noSummon());
	public static final EntityType<FugaEntity> FUGA = reg("fuga",
			EntityType.Builder.<FugaEntity>of(FugaEntity::new, MobCategory.MISC).sized(0.5f, 0.5f).clientTrackingRange(10).updateInterval(1).noSummon());
	public static final EntityType<WorldSlashEntity> WORLD_SLASH = reg("world_slash",
			EntityType.Builder.<WorldSlashEntity>of(WorldSlashEntity::new, MobCategory.MISC).sized(0.5f, 0.5f).clientTrackingRange(16).updateInterval(5).noSummon());
	public static final EntityType<FlyingDebrisEntity> DEBRIS = reg("debris",
			EntityType.Builder.<FlyingDebrisEntity>of(FlyingDebrisEntity::new, MobCategory.MISC).sized(0.8f, 0.8f).clientTrackingRange(6).updateInterval(2).noSummon());
	public static final EntityType<DomainEntity> DOMAIN = reg("domain",
			EntityType.Builder.<DomainEntity>of(DomainEntity::new, MobCategory.MISC).sized(1f, 1f).clientTrackingRange(16).updateInterval(10).noSummon());

	public static final EntityType<GojoBoss> GOJO = reg("gojo",
			EntityType.Builder.<GojoBoss>of(GojoBoss::new, MobCategory.MONSTER).sized(0.6f, 1.95f).eyeHeight(1.7f).clientTrackingRange(12).fireImmune());
	public static final EntityType<SukunaBoss> SUKUNA = reg("sukuna",
			EntityType.Builder.<SukunaBoss>of(SukunaBoss::new, MobCategory.MONSTER).sized(0.6f, 1.95f).eyeHeight(1.7f).clientTrackingRange(12).fireImmune());

	private ModEntities() {
	}

	private static <T extends Entity> EntityType<T> reg(String name, EntityType.Builder<T> builder) {
		ResourceKey<EntityType<?>> key = ResourceKey.create(Registries.ENTITY_TYPE, JjkShowdown.id(name));
		return Registry.register(BuiltInRegistries.ENTITY_TYPE, key, builder.build(key));
	}

	public static void init() {
		FabricDefaultAttributeRegistry.register(GOJO, SorcererBoss.createAttributes(380));
		FabricDefaultAttributeRegistry.register(SUKUNA, SorcererBoss.createAttributes(440));
	}
}
