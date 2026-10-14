package net.abyssaldescent.client.particle;

import net.abyssaldescent.registry.ModParticles;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.particle.NoRenderParticle;
import net.minecraft.core.particles.ParticleTypes;

/** Emits an expanding ring of dust and soul embers along the ground over a few ticks (impacts, shockwaves). */
public class ShockRingEmitter extends NoRenderParticle {
	private static final int POINTS = 22;

	public ShockRingEmitter(ClientLevel level, double x, double y, double z) {
		super(level, x, y, z);
		this.lifetime = 5;
	}

	@Override
	public void tick() {
		double radius = 0.6 + age * 0.9;
		for (int i = 0; i < POINTS; i++) {
			double angle = i / (double) POINTS * Math.PI * 2 + age * 0.13;
			double dx = Math.cos(angle);
			double dz = Math.sin(angle);
			level.addParticle(ParticleTypes.POOF, x + dx * radius, y + 0.1, z + dz * radius, dx * 0.08, 0.01, dz * 0.08);
			if (i % 2 == 0) {
				level.addParticle(ModParticles.SOUL_EMBER, x + dx * radius, y + 0.15, z + dz * radius, dx * 0.05, 0.03, dz * 0.05);
			}
		}
		if (++age >= lifetime) {
			remove();
		}
	}
}
