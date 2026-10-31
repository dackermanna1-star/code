package com.jjkshowdown.util;

import net.minecraft.core.particles.ParticleOptions;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.phys.Vec3;

/** Server-side particle and sound helpers. Particles are broadcast with force=true so big effects read at range. */
public final class Fx {
	private Fx() {
	}

	public static void particles(ServerLevel level, ParticleOptions p, Vec3 pos, int count, double spread, double speed) {
		level.sendParticles(p, true, true, pos.x, pos.y, pos.z, count, spread, spread, spread, speed);
	}

	public static void particles(ServerLevel level, ParticleOptions p, Vec3 pos, int count, double sx, double sy, double sz, double speed) {
		level.sendParticles(p, true, true, pos.x, pos.y, pos.z, count, sx, sy, sz, speed);
	}

	/** A single particle with an explicit velocity (count=0 makes the offsets act as velocity). */
	public static void particleVel(ServerLevel level, ParticleOptions p, Vec3 pos, Vec3 vel, double speed) {
		level.sendParticles(p, true, true, pos.x, pos.y, pos.z, 0, vel.x, vel.y, vel.z, speed);
	}

	/** Ring of particles on the XZ plane flying outward. */
	public static void ring(ServerLevel level, ParticleOptions p, Vec3 center, double radius, int points, double outward) {
		for (int i = 0; i < points; i++) {
			double a = i * Mth.TWO_PI / points;
			double cx = Math.cos(a), cz = Math.sin(a);
			Vec3 pos = center.add(cx * radius, 0, cz * radius);
			particleVel(level, p, pos, new Vec3(cx, 0.02, cz), outward);
		}
	}

	/** Particles spread along a line. */
	public static void line(ServerLevel level, ParticleOptions p, Vec3 from, Vec3 to, double step, double jitter) {
		Vec3 d = to.subtract(from);
		double len = d.length();
		if (len < 1.0E-4) return;
		Vec3 n = d.scale(1.0 / len);
		for (double t = 0; t <= len; t += step) {
			Vec3 pos = from.add(n.scale(t));
			level.sendParticles(p, true, true, pos.x, pos.y, pos.z, 1, jitter, jitter, jitter, 0.0);
		}
	}

	/** Sphere shell burst flying outward. */
	public static void burst(ServerLevel level, ParticleOptions p, Vec3 center, int count, double speed) {
		var rnd = level.getRandom();
		for (int i = 0; i < count; i++) {
			double u = rnd.nextDouble() * 2 - 1;
			double t = rnd.nextDouble() * Mth.TWO_PI;
			double s = Math.sqrt(1 - u * u);
			Vec3 dir = new Vec3(s * Math.cos(t), u, s * Math.sin(t));
			particleVel(level, p, center, dir, speed * (0.5 + rnd.nextDouble() * 0.8));
		}
	}

	public static void sound(ServerLevel level, Vec3 pos, SoundEvent sound, float volume, float pitch) {
		level.playSound(null, pos.x, pos.y, pos.z, sound, SoundSource.PLAYERS, volume, pitch);
	}

	public static void sound(Entity at, SoundEvent sound, float volume, float pitch) {
		at.level().playSound(null, at.getX(), at.getY(), at.getZ(), sound, at.getSoundSource(), volume, pitch);
	}
}
