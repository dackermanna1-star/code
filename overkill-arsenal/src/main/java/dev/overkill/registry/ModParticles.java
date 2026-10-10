package dev.overkill.registry;

import dev.overkill.OverkillArsenal;
import net.fabricmc.fabric.api.particle.v1.FabricParticleTypes;
import net.minecraft.core.Registry;
import net.minecraft.core.particles.SimpleParticleType;
import net.minecraft.core.registries.BuiltInRegistries;

/**
 * Every custom particle in the mod. Behaviour (colour, motion, glow) lives in the client-side
 * particle styles; most of these are spawned by client FX code so they render at long range.
 * <p>
 * "Static" particles (beam, arc, glows, rings, cores) reinterpret the X velocity argument as a size
 * multiplier and do not move.
 */
public final class ModParticles {
	// Aftermath / fire
	public static final SimpleParticleType EMBER = register("ember");
	public static final SimpleParticleType ASH = register("ash");
	public static final SimpleParticleType CHAR_FLAKE = register("char_flake");
	public static final SimpleParticleType HEAVY_SMOKE = register("heavy_smoke");
	public static final SimpleParticleType MAGMA = register("magma");
	public static final SimpleParticleType BLAST_DUST = register("blast_dust");
	public static final SimpleParticleType FIRE_BURST = register("fire_burst");

	// Sunline Rifle
	public static final SimpleParticleType SUN_BEAM = register("sun_beam");
	public static final SimpleParticleType SUN_SPARK = register("sun_spark");

	// Riftfang Scythe / Gravemaker
	public static final SimpleParticleType VOID_MOTE = register("void_mote");
	public static final SimpleParticleType RIFT_GLOW = register("rift_glow");
	public static final SimpleParticleType RIFT_SPARK = register("rift_spark");
	public static final SimpleParticleType RIFT_RING = register("rift_ring");
	public static final SimpleParticleType SINGULARITY = register("singularity");
	public static final SimpleParticleType WHITE_FLARE = register("white_flare");

	// Stormcaller Gauntlet
	public static final SimpleParticleType STATIC_SPARK = register("static_spark");
	public static final SimpleParticleType ARC = register("arc");

	// Worldbreaker + shared
	public static final SimpleParticleType ORB_CORE = register("orb_core");
	public static final SimpleParticleType SHOCKWAVE = register("shockwave");

	private ModParticles() {
	}

	private static SimpleParticleType register(String name) {
		return Registry.register(BuiltInRegistries.PARTICLE_TYPE, OverkillArsenal.id(name), FabricParticleTypes.simple(false));
	}

	public static void init() {
	}
}
