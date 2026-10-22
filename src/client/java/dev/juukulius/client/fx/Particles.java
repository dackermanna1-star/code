package dev.juukulius.client.fx;

import dev.juukulius.particle.ParticleDensity;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.core.particles.ParticleOptions;
import net.minecraft.util.RandomSource;
import net.minecraft.world.phys.Vec3;

/** Particle emitters that respect the client's particle budget. */
public final class Particles {
	private Particles() {
	}

	/** Spherical burst around {@code center}. */
	public static void burst(ClientLevel level, ParticleOptions options, Vec3 center, int count, double speed, double spread) {
		RandomSource random = level.getRandom();
		int scaled = ParticleDensity.scale(count, random);
		for (int i = 0; i < scaled; i++) {
			Vec3 direction = new Vec3(random.nextGaussian(), random.nextGaussian(), random.nextGaussian()).normalize();
			Vec3 position = center.add(direction.scale(random.nextDouble() * spread));
			Vec3 velocity = direction.scale(speed * (0.4 + random.nextDouble() * 0.6));
			level.addParticle(options, position.x, position.y, position.z, velocity.x, velocity.y, velocity.z);
		}
	}

	/** Burst concentrated along {@code direction} with an opening angle given by {@code cone} (0 = straight). */
	public static void cone(ClientLevel level, ParticleOptions options, Vec3 origin, Vec3 direction, int count, double speed, double cone) {
		RandomSource random = level.getRandom();
		Vec3 dir = direction.normalize();
		int scaled = ParticleDensity.scale(count, random);
		for (int i = 0; i < scaled; i++) {
			Vec3 jitter = new Vec3(random.nextGaussian(), random.nextGaussian(), random.nextGaussian()).scale(cone);
			Vec3 velocity = dir.add(jitter).normalize().scale(speed * (0.5 + random.nextDouble() * 0.5));
			level.addParticle(options, origin.x, origin.y, origin.z, velocity.x, velocity.y, velocity.z);
		}
	}

	/** Particles spread on a horizontal ring, moving outward. */
	public static void ring(ClientLevel level, ParticleOptions options, Vec3 center, double radius, int count, double outward, double upward) {
		RandomSource random = level.getRandom();
		int scaled = ParticleDensity.scale(count, random);
		for (int i = 0; i < scaled; i++) {
			double angle = random.nextDouble() * Math.PI * 2.0;
			double cos = Math.cos(angle);
			double sin = Math.sin(angle);
			level.addParticle(options, center.x + cos * radius, center.y, center.z + sin * radius, cos * outward, upward * (0.5 + random.nextDouble()),
				sin * outward);
		}
	}

	/** Rising spiral around an axis (transformation, empowerment). */
	public static void spiral(ClientLevel level, ParticleOptions options, Vec3 base, double radius, double height, int count, double speed) {
		RandomSource random = level.getRandom();
		int scaled = ParticleDensity.scale(count, random);
		for (int i = 0; i < scaled; i++) {
			double t = random.nextDouble();
			double angle = t * Math.PI * 6.0 + random.nextDouble() * 0.5;
			double r = radius * (1.0 - t * 0.4);
			double x = base.x + Math.cos(angle) * r;
			double z = base.z + Math.sin(angle) * r;
			level.addParticle(options, x, base.y + t * height * 0.3, z, -Math.sin(angle) * speed, speed * 1.5, Math.cos(angle) * speed);
		}
	}

	/** Particles along a line segment. */
	public static void line(ClientLevel level, ParticleOptions options, Vec3 from, Vec3 to, int count, Vec3 velocity) {
		RandomSource random = level.getRandom();
		int scaled = ParticleDensity.scale(count, random);
		for (int i = 0; i < scaled; i++) {
			Vec3 p = from.lerp(to, random.nextDouble());
			level.addParticle(options, p.x, p.y, p.z, velocity.x + random.nextGaussian() * 0.02, velocity.y + random.nextGaussian() * 0.02,
				velocity.z + random.nextGaussian() * 0.02);
		}
	}
}
