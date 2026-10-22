package dev.juukulius.client.particle;

import dev.juukulius.particle.JuliusParticleOptions;
import dev.juukulius.registry.JuliusParticles;
import net.fabricmc.fabric.api.client.particle.v1.ParticleFactoryRegistry;
import net.minecraft.core.particles.ParticleType;

/** Binds every Julius particle type to its style and sprite set. */
public final class JuliusParticleProviders {
	private JuliusParticleProviders() {
	}

	public static void init() {
		register(JuliusParticles.GLOW_SPARK, JuliusParticle.Style.GLOW);
		register(JuliusParticles.RAINBOW_SPARK, JuliusParticle.Style.RAINBOW);
		register(JuliusParticles.EMBER, JuliusParticle.Style.EMBER);
		register(JuliusParticles.FLAME, JuliusParticle.Style.FLAME);
		register(JuliusParticles.DROPLET, JuliusParticle.Style.DROPLET);
		register(JuliusParticles.WIND_STREAK, JuliusParticle.Style.STREAK);
		register(JuliusParticles.LEAF, JuliusParticle.Style.LEAF);
		register(JuliusParticles.DUST_PUFF, JuliusParticle.Style.DUST);
		register(JuliusParticles.LIGHT_MOTE, JuliusParticle.Style.MOTE);
		register(JuliusParticles.SHADOW_WISP, JuliusParticle.Style.WISP);
		register(JuliusParticles.IMPACT_FLASH, JuliusParticle.Style.FLASH);
		register(JuliusParticles.RING, JuliusParticle.Style.RING);
		register(JuliusParticles.SLASH_LINE, JuliusParticle.Style.SPARK_LINE);
	}

	private static void register(ParticleType<JuliusParticleOptions> type, JuliusParticle.Style style) {
		ParticleFactoryRegistry.getInstance().register(type, sprites -> (options, level, x, y, z, dx, dy, dz, random) ->
			new JuliusParticle(level, x, y, z, dx, dy, dz, options, style, sprites));
	}
}
