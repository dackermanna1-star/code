package com.godforge.registry;

import com.godforge.Godforge;
import net.fabricmc.fabric.api.particle.v1.FabricParticleTypes;
import net.minecraft.core.Registry;
import net.minecraft.core.particles.ParticleType;
import net.minecraft.core.registries.BuiltInRegistries;

public final class ModParticles {
	/** Soft round glow. */
	public static final ParticleType<FxParticleOptions> GLOW = register("glow");
	/** Four-pointed star flare. */
	public static final ParticleType<FxParticleOptions> STAR = register("star");
	/** Expanding ring (used flat for shockwaves). */
	public static final ParticleType<FxParticleOptions> RING = register("ring");
	/** Crystal shards. */
	public static final ParticleType<FxParticleOptions> SHARD = register("shard");
	/** Thin bright spark streak. */
	public static final ParticleType<FxParticleOptions> SPARK = register("spark");
	/** Billowing smoke / dust (translucent). */
	public static final ParticleType<FxParticleOptions> SMOKE = register("smoke");
	/** Ember / plasma blob. */
	public static final ParticleType<FxParticleOptions> PLASMA = register("plasma");

	private ModParticles() {
	}

	private static ParticleType<FxParticleOptions> register(String name) {
		ParticleType<FxParticleOptions> type = FabricParticleTypes.complex(true, FxParticleOptions::codec, FxParticleOptions::streamCodec);
		return Registry.register(BuiltInRegistries.PARTICLE_TYPE, Godforge.id(name), type);
	}

	public static void init() {
	}
}
