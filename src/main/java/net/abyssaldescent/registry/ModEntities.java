package net.abyssaldescent.registry;

import net.abyssaldescent.AbyssalDescent;
import net.abyssaldescent.entity.boss.HollowWardenEntity;
import net.abyssaldescent.entity.forgotten.BarrowKnightEntity;
import net.abyssaldescent.entity.forgotten.BoneArcherEntity;
import net.abyssaldescent.entity.forgotten.BoneShieldbearerEntity;
import net.abyssaldescent.entity.forgotten.CryptGhoulEntity;
import net.abyssaldescent.entity.forgotten.RisenEntity;
import net.abyssaldescent.entity.forgotten.WailingSkullEntity;
import net.abyssaldescent.entity.fx.TelegraphEntity;
import net.abyssaldescent.entity.merchant.DelverMerchant;
import net.abyssaldescent.entity.projectile.SoulBoltEntity;
import net.fabricmc.fabric.api.object.builder.v1.entity.FabricDefaultAttributeRegistry;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.MobCategory;

public final class ModEntities {
	public static final EntityType<RisenEntity> RISEN = register("risen",
		EntityType.Builder.of(RisenEntity::new, MobCategory.MONSTER).sized(0.6F, 1.95F).eyeHeight(1.74F).clientTrackingRange(8));
	public static final EntityType<BoneArcherEntity> BONE_ARCHER = register("bone_archer",
		EntityType.Builder.of(BoneArcherEntity::new, MobCategory.MONSTER).sized(0.6F, 1.99F).eyeHeight(1.74F).clientTrackingRange(8));
	public static final EntityType<BoneShieldbearerEntity> BONE_SHIELDBEARER = register("bone_shieldbearer",
		EntityType.Builder.of(BoneShieldbearerEntity::new, MobCategory.MONSTER).sized(0.6F, 1.99F).eyeHeight(1.74F).clientTrackingRange(8));
	public static final EntityType<CryptGhoulEntity> CRYPT_GHOUL = register("crypt_ghoul",
		EntityType.Builder.of(CryptGhoulEntity::new, MobCategory.MONSTER).sized(0.8F, 1.4F).eyeHeight(1.15F).clientTrackingRange(8));
	public static final EntityType<WailingSkullEntity> WAILING_SKULL = register("wailing_skull",
		EntityType.Builder.of(WailingSkullEntity::new, MobCategory.MONSTER).sized(0.7F, 0.7F).eyeHeight(0.35F).clientTrackingRange(8));
	public static final EntityType<BarrowKnightEntity> BARROW_KNIGHT = register("barrow_knight",
		EntityType.Builder.of(BarrowKnightEntity::new, MobCategory.MONSTER).sized(0.85F, 2.3F).eyeHeight(2.0F).clientTrackingRange(10));
	public static final EntityType<HollowWardenEntity> HOLLOW_WARDEN = register("hollow_warden",
		EntityType.Builder.of(HollowWardenEntity::new, MobCategory.MONSTER).sized(1.3F, 3.3F).eyeHeight(2.9F).clientTrackingRange(16).fireImmune());
	public static final EntityType<DelverMerchant> DELVER_MERCHANT = register("delver_merchant",
		EntityType.Builder.of(DelverMerchant::new, MobCategory.MISC).sized(0.6F, 1.95F).eyeHeight(1.62F).clientTrackingRange(10));
	public static final EntityType<SoulBoltEntity> SOUL_BOLT = register("soul_bolt",
		EntityType.Builder.<SoulBoltEntity>of(SoulBoltEntity::new, MobCategory.MISC).noLootTable().sized(0.35F, 0.35F).clientTrackingRange(6)
			.updateInterval(2));
	public static final EntityType<TelegraphEntity> TELEGRAPH = register("telegraph",
		EntityType.Builder.<TelegraphEntity>of(TelegraphEntity::new, MobCategory.MISC).noLootTable().noSave().sized(0.5F, 0.1F).clientTrackingRange(8)
			.updateInterval(20));

	private ModEntities() {
	}

	private static <T extends Entity> EntityType<T> register(String name, EntityType.Builder<T> builder) {
		ResourceKey<EntityType<?>> key = ResourceKey.create(Registries.ENTITY_TYPE, AbyssalDescent.id(name));
		return Registry.register(BuiltInRegistries.ENTITY_TYPE, key, builder.build(key));
	}

	/** The boss guarding a given boss floor. */
	public static EntityType<? extends Mob> bossFor(int floor) {
		return HOLLOW_WARDEN;
	}

	public static void init() {
		FabricDefaultAttributeRegistry.register(RISEN, RisenEntity.createAttributes());
		FabricDefaultAttributeRegistry.register(BONE_ARCHER, BoneArcherEntity.createAttributes());
		FabricDefaultAttributeRegistry.register(BONE_SHIELDBEARER, BoneShieldbearerEntity.createAttributes());
		FabricDefaultAttributeRegistry.register(CRYPT_GHOUL, CryptGhoulEntity.createAttributes());
		FabricDefaultAttributeRegistry.register(WAILING_SKULL, WailingSkullEntity.createAttributes());
		FabricDefaultAttributeRegistry.register(BARROW_KNIGHT, BarrowKnightEntity.createAttributes());
		FabricDefaultAttributeRegistry.register(HOLLOW_WARDEN, HollowWardenEntity.createAttributes());
		FabricDefaultAttributeRegistry.register(DELVER_MERCHANT, DelverMerchant.createAttributes());
	}
}
