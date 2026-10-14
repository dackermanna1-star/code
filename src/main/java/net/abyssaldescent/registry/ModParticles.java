package net.abyssaldescent.registry;

import net.abyssaldescent.AbyssalDescent;
import net.fabricmc.fabric.api.particle.v1.FabricParticleTypes;
import net.minecraft.core.Registry;
import net.minecraft.core.particles.SimpleParticleType;
import net.minecraft.core.registries.BuiltInRegistries;

public final class ModParticles {
	/** Floating glowing rune glyph (rune stones, seals, shrines). */
	public static final SimpleParticleType RUNE_GLYPH = register("rune_glyph", false);
	/** Slow drifting dust specks that catch the light (zone ambience). */
	public static final SimpleParticleType DUST_MOTE = register("dust_mote", false);
	/** Rising violet mote from rifts, gates and waystones. */
	public static final SimpleParticleType RIFT_MOTE = register("rift_mote", true);
	/** Golden twinkle over unopened reliquaries and loot. */
	public static final SimpleParticleType LOOT_GLINT = register("loot_glint", true);
	public static final SimpleParticleType BLOOD_MOTE = register("blood_mote", false);
	public static final SimpleParticleType CURSE_MOTE = register("curse_mote", false);
	/** Cold blue ember used by soul attacks, weapons and wisps. */
	public static final SimpleParticleType SOUL_EMBER = register("soul_ember", true);
	public static final SimpleParticleType BONE_SHARD = register("bone_shard", false);
	/** Branching spark used by chain lightning. */
	public static final SimpleParticleType ARC_SPARK = register("arc_spark", true);
	/** Ring burst used by impacts and shockwaves (spawned flat on the ground). */
	public static final SimpleParticleType SHOCK_RING = register("shock_ring", true);
	/** Summoning circle swirl shown before an enemy materialises. */
	public static final SimpleParticleType SUMMON_SWIRL = register("summon_swirl", true);
	public static final SimpleParticleType BLEED_DRIP = register("bleed_drip", false);
	/** Rarity sparkles that rise from dropped gear. */
	public static final SimpleParticleType SPARK_UNCOMMON = register("spark_uncommon", true);
	public static final SimpleParticleType SPARK_RARE = register("spark_rare", true);
	public static final SimpleParticleType SPARK_EPIC = register("spark_epic", true);
	public static final SimpleParticleType SPARK_LEGENDARY = register("spark_legendary", true);

	private ModParticles() {
	}

	private static SimpleParticleType register(String name, boolean alwaysShow) {
		return Registry.register(BuiltInRegistries.PARTICLE_TYPE, AbyssalDescent.id(name), FabricParticleTypes.simple(alwaysShow));
	}

	public static void init() {
	}
}
