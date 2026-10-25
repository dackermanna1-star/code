package com.godforge.registry;

import com.godforge.Godforge;
import com.godforge.entity.ArtificialSunEntity;
import com.godforge.entity.AsteroidEntity;
import com.godforge.entity.CrackerShellEntity;
import com.godforge.entity.DimensionalRiftEntity;
import com.godforge.entity.FlyingDebrisEntity;
import com.godforge.entity.FractureChunkEntity;
import com.godforge.entity.KineticFistEntity;
import com.godforge.entity.LaserBeamEntity;
import com.godforge.entity.MiniSunEntity;
import com.godforge.entity.OrbitalStrikeEntity;
import com.godforge.entity.PrismOrbEntity;
import com.godforge.entity.RealityCutEntity;
import com.godforge.entity.RiftSlashEntity;
import com.godforge.entity.SingularityEntity;
import com.godforge.entity.SolarBoltEntity;
import com.godforge.entity.StarBoltEntity;
import com.godforge.entity.TargetMarkerEntity;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.MobCategory;

/** Every effect entity is transient ({@code noSave}): attacks never persist through a restart. */
public final class ModEntities {
	public static final EntityType<RiftSlashEntity> RIFT_SLASH = register("rift_slash", EntityType.Builder.of(RiftSlashEntity::new, MobCategory.MISC), 0.6F, 0.6F, 10, 1);
	public static final EntityType<RealityCutEntity> REALITY_CUT = register("reality_cut", EntityType.Builder.of(RealityCutEntity::new, MobCategory.MISC), 1.0F, 1.0F, 20, 20);
	public static final EntityType<LaserBeamEntity> LASER_BEAM = register("laser_beam", EntityType.Builder.of(LaserBeamEntity::new, MobCategory.MISC), 0.4F, 0.4F, 16, 1);
	public static final EntityType<PrismOrbEntity> PRISM_ORB = register("prism_orb", EntityType.Builder.of(PrismOrbEntity::new, MobCategory.MISC), 1.0F, 1.0F, 16, 1);
	public static final EntityType<AsteroidEntity> ASTEROID = register("asteroid", EntityType.Builder.of(AsteroidEntity::new, MobCategory.MISC), 2.0F, 2.0F, 24, 1);
	public static final EntityType<TargetMarkerEntity> TARGET_MARKER = register("target_marker", EntityType.Builder.of(TargetMarkerEntity::new, MobCategory.MISC), 1.0F, 1.0F, 24, 20);
	public static final EntityType<SingularityEntity> SINGULARITY = register("singularity", EntityType.Builder.of(SingularityEntity::new, MobCategory.MISC), 1.0F, 1.0F, 16, 2);
	public static final EntityType<FlyingDebrisEntity> FLYING_DEBRIS = register("flying_debris", EntityType.Builder.of(FlyingDebrisEntity::new, MobCategory.MISC), 0.98F, 0.98F, 8, 2);
	public static final EntityType<FractureChunkEntity> FRACTURE_CHUNK = register("fracture_chunk", EntityType.Builder.of(FractureChunkEntity::new, MobCategory.MISC), 2.4F, 2.4F, 12, 2);
	public static final EntityType<DimensionalRiftEntity> DIMENSIONAL_RIFT = register("dimensional_rift", EntityType.Builder.of(DimensionalRiftEntity::new, MobCategory.MISC), 1.0F, 1.0F, 12, 20);
	public static final EntityType<StarBoltEntity> STAR_BOLT = register("star_bolt", EntityType.Builder.of(StarBoltEntity::new, MobCategory.MISC), 0.5F, 0.5F, 20, 1);
	public static final EntityType<KineticFistEntity> KINETIC_FIST = register("kinetic_fist", EntityType.Builder.of(KineticFistEntity::new, MobCategory.MISC), 1.0F, 1.0F, 12, 1);
	public static final EntityType<SolarBoltEntity> SOLAR_BOLT = register("solar_bolt", EntityType.Builder.of(SolarBoltEntity::new, MobCategory.MISC), 0.5F, 0.5F, 12, 1);
	public static final EntityType<MiniSunEntity> MINI_SUN = register("mini_sun", EntityType.Builder.of(MiniSunEntity::new, MobCategory.MISC), 0.6F, 0.6F, 10, 1);
	public static final EntityType<ArtificialSunEntity> ARTIFICIAL_SUN = register("artificial_sun", EntityType.Builder.of(ArtificialSunEntity::new, MobCategory.MISC), 2.0F, 2.0F, 32, 20);
	public static final EntityType<CrackerShellEntity> CRACKER_SHELL = register("cracker_shell", EntityType.Builder.of(CrackerShellEntity::new, MobCategory.MISC), 0.6F, 0.6F, 16, 1);
	public static final EntityType<OrbitalStrikeEntity> ORBITAL_STRIKE = register("orbital_strike", EntityType.Builder.of(OrbitalStrikeEntity::new, MobCategory.MISC), 1.0F, 1.0F, 32, 20);

	private ModEntities() {
	}

	private static <T extends Entity> EntityType<T> register(String name, EntityType.Builder<T> builder, float width, float height, int trackingChunks, int interval) {
		ResourceKey<EntityType<?>> key = ResourceKey.create(Registries.ENTITY_TYPE, Godforge.id(name));
		EntityType<T> type = builder.noLootTable().noSave().fireImmune().sized(width, height).clientTrackingRange(trackingChunks).updateInterval(interval).build(key);
		return Registry.register(BuiltInRegistries.ENTITY_TYPE, key, type);
	}

	public static void init() {
		ServerLifecycleEvents.SERVER_STARTING.register(server -> {
			FlyingDebrisEntity.resetLiveCount();
			FractureChunkEntity.resetLiveCount();
			SingularityEntity.resetLiveCount();
			ArtificialSunEntity.resetLiveCount();
			OrbitalStrikeEntity.resetLiveCount();
		});
	}
}
