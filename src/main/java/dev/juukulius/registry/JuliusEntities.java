package dev.juukulius.registry;

import dev.juukulius.JuliusMod;
import dev.juukulius.entity.ClaristaWaveEntity;
import dev.juukulius.entity.ClauzeriaVortexEntity;
import dev.juukulius.entity.FirestormEntity;
import dev.juukulius.entity.SpiritBoltEntity;
import dev.juukulius.entity.StoneSpikeEntity;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.MobCategory;

/** Art entities. None of them are saved to disk: they are short-lived effects of an attack. */
public final class JuliusEntities {
	public static final EntityType<SpiritBoltEntity> SPIRIT_BOLT = register("spirit_bolt",
		EntityType.Builder.<SpiritBoltEntity>of(SpiritBoltEntity::new, MobCategory.MISC).sized(0.4F, 0.4F).clientTrackingRange(8).updateInterval(1)
			.noSave().noSummon().fireImmune());
	public static final EntityType<ClaristaWaveEntity> AL_CLARISTA_WAVE = register("al_clarista_wave",
		EntityType.Builder.<ClaristaWaveEntity>of(ClaristaWaveEntity::new, MobCategory.MISC).sized(0.6F, 0.6F).clientTrackingRange(10).updateInterval(1)
			.noSave().noSummon().fireImmune());
	public static final EntityType<ClauzeriaVortexEntity> AL_CLAUZERIA_VORTEX = register("al_clauzeria_vortex",
		EntityType.Builder.<ClauzeriaVortexEntity>of(ClauzeriaVortexEntity::new, MobCategory.MISC).sized(0.8F, 0.8F).clientTrackingRange(10).updateInterval(1)
			.noSave().noSummon().fireImmune());
	public static final EntityType<StoneSpikeEntity> STONE_SPIKE = register("stone_spike",
		EntityType.Builder.<StoneSpikeEntity>of(StoneSpikeEntity::new, MobCategory.MISC).sized(0.8F, 1.6F).clientTrackingRange(8).updateInterval(20)
			.noSave().noSummon().fireImmune());
	public static final EntityType<FirestormEntity> UL_GORA_FIRESTORM = register("ul_gora_firestorm",
		EntityType.Builder.<FirestormEntity>of(FirestormEntity::new, MobCategory.MISC).sized(2.0F, 4.0F).clientTrackingRange(10).updateInterval(2)
			.noSave().noSummon().fireImmune());

	private JuliusEntities() {
	}

	private static <T extends Entity> EntityType<T> register(String name, EntityType.Builder<T> builder) {
		ResourceKey<EntityType<?>> key = ResourceKey.create(Registries.ENTITY_TYPE, JuliusMod.id(name));
		return Registry.register(BuiltInRegistries.ENTITY_TYPE, key, builder.build(key));
	}

	public static void init() {
	}
}
