package com.chaosunleashed.registry;

import com.chaosunleashed.ChaosUnleashed;
import net.fabricmc.fabric.api.particle.v1.FabricParticleTypes;
import net.minecraft.particle.SimpleParticleType;
import net.minecraft.registry.Registries;
import net.minecraft.registry.Registry;

/** Custom particles. PLACEHOLDER textures live in assets/chaosunleashed/textures/particle/. */
public final class ModParticles {
	/** Solar Flare: glowing embers drifting down. */
	public static final SimpleParticleType EMBER = register("ember");
	/** Blood Moon: red mist. */
	public static final SimpleParticleType BLOOD_MIST = register("blood_mist");
	/** Dimension Rift: bright sparks falling from the crack. */
	public static final SimpleParticleType RIFT_SPARK = register("rift_spark");
	/** Black Hole: swirling accretion disk matter. */
	public static final SimpleParticleType VOID_SWIRL = register("void_swirl");
	/** Herd Stampede: big brown dust puffs. */
	public static final SimpleParticleType DUST_CLOUD = register("dust_cloud");
	/** Alien Invasion: green plasma. */
	public static final SimpleParticleType PLASMA = register("plasma");
	/** Eclipse: dark wisps. */
	public static final SimpleParticleType SHADOW_WISP = register("shadow_wisp");
	/** Gravity Flip: rising motes. */
	public static final SimpleParticleType GRAVITY_MOTE = register("gravity_mote");
	/** Kaiju: breath beam sparks. */
	public static final SimpleParticleType BEAM_SPARK = register("beam_spark");

	private ModParticles() {
	}

	private static SimpleParticleType register(String name) {
		return Registry.register(Registries.PARTICLE_TYPE, ChaosUnleashed.id(name), FabricParticleTypes.simple(true));
	}

	public static void init() {
	}
}
