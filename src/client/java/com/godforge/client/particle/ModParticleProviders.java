package com.godforge.client.particle;

import com.godforge.registry.FxParticleOptions;
import com.godforge.registry.ModParticles;
import net.fabricmc.fabric.api.client.particle.v1.ParticleFactoryRegistry;
import net.minecraft.core.particles.ParticleType;

public final class ModParticleProviders {
	private ModParticleProviders() {
	}

	public static void init() {
		register(ModParticles.GLOW, false);
		register(ModParticles.STAR, false);
		register(ModParticles.RING, false);
		register(ModParticles.SHARD, false);
		register(ModParticles.SPARK, false);
		register(ModParticles.SMOKE, true);
		register(ModParticles.PLASMA, true);
	}

	private static void register(ParticleType<FxParticleOptions> type, boolean animated) {
		ParticleFactoryRegistry.getInstance().register(type, sprites -> (options, level, x, y, z, dx, dy, dz, random) ->
			new FxParticle(level, x, y, z, dx, dy, dz, options, sprites, animated)
		);
	}
}
