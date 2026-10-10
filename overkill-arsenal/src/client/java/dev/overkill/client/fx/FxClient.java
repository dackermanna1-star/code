package dev.overkill.client.fx;

import dev.overkill.network.FxKind;
import dev.overkill.network.FxPayload;
import dev.overkill.registry.ModParticles;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.core.particles.ParticleOptions;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.world.phys.Vec3;

import java.util.ArrayList;
import java.util.List;

/** Turns {@link FxPayload}s from the server into particle spectacles. */
public final class FxClient {
	private static final Vec3 UP = new Vec3(0.0, 1.0, 0.0);

	private FxClient() {
	}

	public static void handle(FxPayload fx) {
		ClientLevel level = Minecraft.getInstance().level;
		if (level == null) {
			return;
		}
		RandomSource random = RandomSource.create(fx.seed());
		switch (fx.kind()) {
			case FxKind.SUNLINE_TRACE -> sunlineTrace(level, fx.a(), fx.b(), random);
			case FxKind.SUNLINE_BLAST -> sunlineBlast(level, fx.a(), fx.scale(), random);
			case FxKind.ORB_LAUNCH -> orbLaunch(level, fx.a(), fx.b(), fx.scale(), random);
			case FxKind.ORB_IMPACT -> orbImpact(level, fx.a(), fx.b(), (int) fx.scale(), random);
			case FxKind.CHARGE_STAGE -> chargeStage(level, fx.a(), fx.scale(), random);
			case FxKind.BACKFIRE -> backfire(level, fx.a(), random);
			case FxKind.ARC -> arc(level, fx.a(), fx.b(), fx.scale(), random);
			case FxKind.STORM_SLAM -> stormSlam(level, fx.a(), fx.scale(), random);
			case FxKind.STORM_RING -> stormRing(level, fx.a(), fx.scale(), random);
			case FxKind.THUNDER_STRIKE -> thunderStrike(level, fx.a(), random);
			case FxKind.RIFT_SWALLOW -> riftSwallow(level, fx.a(), fx.b(), fx.scale(), random);
			case FxKind.RIFT_OPEN -> riftOpen(level, fx.a(), fx.scale(), random);
			case FxKind.SINGULARITY_BIRTH -> singularityBirth(level, fx.a(), random);
			case FxKind.SINGULARITY_COLLAPSE -> singularityCollapse(level, fx.a(), fx.scale(), random);
			case FxKind.WHITE_HOLE_BURST -> whiteHoleBurst(level, fx.a(), random);
			case FxKind.MUZZLE_FLASH -> muzzleFlash(level, fx.a(), fx.b(), fx.scale(), fx.seed());
			default -> {
			}
		}
	}

	// ------------------------------------------------------------------------------------------
	// Helpers
	// ------------------------------------------------------------------------------------------

	private static void add(ClientLevel level, ParticleOptions type, Vec3 pos, double vx, double vy, double vz) {
		level.addParticle(type, true, true, pos.x, pos.y, pos.z, vx, vy, vz);
	}

	private static void add(ClientLevel level, ParticleOptions type, Vec3 pos, Vec3 velocity) {
		add(level, type, pos, velocity.x, velocity.y, velocity.z);
	}

	/** Static particles: size multiplier, alpha multiplier, lifetime. */
	private static void glow(ClientLevel level, ParticleOptions type, Vec3 pos, double size, double alpha, int life) {
		add(level, type, pos, size, alpha, life);
	}

	private static Vec3 randomDir(RandomSource random) {
		Vec3 v = new Vec3(random.nextGaussian(), random.nextGaussian(), random.nextGaussian());
		return v.lengthSqr() < 1.0E-6 ? UP : v.normalize();
	}

	private static Vec3 jitter(RandomSource random, double amount) {
		return new Vec3(random.nextGaussian() * amount, random.nextGaussian() * amount, random.nextGaussian() * amount);
	}

	/** Random direction biased upwards (hemisphere-ish). */
	private static Vec3 upward(RandomSource random, double upBias) {
		Vec3 d = randomDir(random);
		return new Vec3(d.x, Math.abs(d.y) + upBias, d.z).normalize();
	}

	private static void burst(ClientLevel level, ParticleOptions type, Vec3 center, int count, double spread, double minSpeed, double maxSpeed,
		double upBias, RandomSource random) {
		for (int i = 0; i < count; i++) {
			Vec3 dir = upBias > 0 ? upward(random, upBias) : randomDir(random);
			double speed = Mth.lerp(random.nextDouble(), minSpeed, maxSpeed);
			add(level, type, center.add(jitter(random, spread)), dir.scale(speed));
		}
	}

	private static void ring(ClientLevel level, ParticleOptions type, Vec3 center, double radius, int count, double outSpeed, double upSpeed,
		RandomSource random) {
		for (int i = 0; i < count; i++) {
			double angle = (i + random.nextDouble() * 0.5) * (Math.PI * 2.0 / count);
			double c = Math.cos(angle);
			double s = Math.sin(angle);
			Vec3 pos = center.add(c * radius, 0.1, s * radius);
			add(level, type, pos, c * outSpeed, upSpeed * (0.6 + random.nextDouble() * 0.8), s * outSpeed);
		}
	}

	// ------------------------------------------------------------------------------------------
	// Sunline Rifle
	// ------------------------------------------------------------------------------------------

	private static void sunlineTrace(ClientLevel level, Vec3 start, Vec3 end, RandomSource random) {
		Vec3 delta = end.subtract(start);
		double length = delta.length();
		if (length < 0.1) {
			return;
		}
		Vec3 dir = delta.scale(1.0 / length);
		// Each part of the beam keeps glowing until the detonation sweep reaches it (fuse 12 + sweep 8).
		for (double d = 0.0; d <= length; d += 0.12) {
			Vec3 p = start.add(dir.scale(d));
			int life = 13 + (int) (8.0 * d / length);
			glow(level, ModParticles.SUN_BEAM, p, 1.0, 1.0, life);
		}
		for (double d = 0.0; d <= length; d += 0.45) {
			Vec3 p = start.add(dir.scale(d));
			int life = 13 + (int) (8.0 * d / length);
			glow(level, ModParticles.SUN_BEAM, p, 3.2, 0.28, life);
		}
		for (double d = 0.5; d <= length; d += 1.4) {
			Vec3 p = start.add(dir.scale(d)).add(jitter(random, 0.08));
			add(level, ModParticles.SUN_SPARK, p, jitter(random, 0.06).add(0.0, 0.05, 0.0));
		}
		glow(level, ModParticles.SUN_BEAM, end, 7.0, 0.85, 14);
		burst(level, ModParticles.SUN_SPARK, end, 28, 0.2, 0.15, 0.45, 0.4, random);
		burst(level, ModParticles.EMBER, end, 12, 0.3, 0.05, 0.2, 0.6, random);
		add(level, ModParticles.HEAVY_SMOKE, end, 0.0, 0.03, 0.0);
	}

	private static void sunlineBlast(ClientLevel level, Vec3 pos, float scale, RandomSource random) {
		int s = Math.max(1, Math.round(scale));
		glow(level, ModParticles.SUN_BEAM, pos, 9.0 * scale, 0.9, 4);
		burst(level, ModParticles.FIRE_BURST, pos, 6 * s, 0.6, 0.06, 0.22, 0.2, random);
		burst(level, ModParticles.EMBER, pos, 16 * s, 0.5, 0.12, 0.42, 0.5, random);
		burst(level, ModParticles.HEAVY_SMOKE, pos, 4 * s, 0.8, 0.02, 0.08, 0.6, random);
		burst(level, ModParticles.MAGMA, pos, 4 * s, 0.3, 0.25, 0.55, 0.9, random);
		burst(level, ModParticles.CHAR_FLAKE, pos, 6 * s, 0.6, 0.1, 0.3, 0.7, random);
		burst(level, ModParticles.BLAST_DUST, pos, 3 * s, 0.6, 0.1, 0.25, 0.1, random);
		burst(level, ModParticles.ASH, pos, 5 * s, 1.0, 0.02, 0.1, 0.8, random);
		if (scale > 1.5F) {
			glow(level, ModParticles.SHOCKWAVE, pos.add(0.0, -0.4, 0.0), 10.0 * scale, 0.7, 12);
		}
	}

	// ------------------------------------------------------------------------------------------
	// Worldbreaker
	// ------------------------------------------------------------------------------------------

	private static void orbLaunch(ClientLevel level, Vec3 muzzle, Vec3 dir, float stage, RandomSource random) {
		Vec3 forward = dir.normalize();
		Vec3 side = forward.cross(UP);
		side = side.lengthSqr() < 1.0E-4 ? new Vec3(1.0, 0.0, 0.0) : side.normalize();
		Vec3 up = side.cross(forward).normalize();
		int count = 24 * (int) stage;
		for (int i = 0; i < count; i++) {
			double angle = i * (Math.PI * 2.0 / count);
			Vec3 radial = side.scale(Math.cos(angle)).add(up.scale(Math.sin(angle)));
			add(level, ModParticles.STATIC_SPARK, muzzle.add(radial.scale(0.3)), radial.scale(0.35 + 0.1 * stage).add(forward.scale(0.15)));
		}
		for (int i = 0; i < 10 * stage; i++) {
			Vec3 v = forward.scale(0.3 + random.nextDouble() * 0.6).add(jitter(random, 0.12));
			add(level, ModParticles.BLAST_DUST, muzzle, v);
		}
		glow(level, ModParticles.ORB_CORE, muzzle, 2.2 * stage, 1.0, 4);
	}

	private static void chargeStage(ClientLevel level, Vec3 muzzle, float stage, RandomSource random) {
		glow(level, ModParticles.ORB_CORE, muzzle, 1.6 * stage, 0.9, 5);
		burst(level, ModParticles.STATIC_SPARK, muzzle, (int) (14 * stage), 0.1, 0.2, 0.45, 0.0, random);
		burst(level, ModParticles.ARC, muzzle, 4, 0.6, 0.0, 0.0, 0.0, random);
	}

	private static void orbImpact(ClientLevel level, Vec3 end, Vec3 entry, int stage, RandomSource random) {
		double size = 1.0 + stage;
		// The blast itself.
		glow(level, ModParticles.ORB_CORE, end, 6.0 + 5.0 * stage, 1.0, 7);
		glow(level, ModParticles.SUN_BEAM, end, 30.0 * stage, 0.6, 5);
		burst(level, ModParticles.FIRE_BURST, end, 30 * stage, size, 0.25, 0.9, 0.0, random);
		burst(level, ModParticles.EMBER, end, 70 * stage, size, 0.25, 1.1, 0.3, random);
		burst(level, ModParticles.MAGMA, end, 28 * stage, size * 0.6, 0.45, 1.2, 0.8, random);
		burst(level, ModParticles.BLAST_DUST, end, 35 * stage, size, 0.4, 1.2, 0.0, random);
		burst(level, ModParticles.CHAR_FLAKE, end, 35 * stage, size, 0.3, 0.9, 0.6, random);
		burst(level, ModParticles.HEAVY_SMOKE, end, 20 * stage, size * 1.5, 0.05, 0.35, 0.5, random);
		burst(level, ModParticles.STATIC_SPARK, end, 40 * stage, size, 0.4, 1.4, 0.0, random);
		glow(level, ModParticles.SHOCKWAVE, end, 14.0 * stage, 0.9, 16);
		glow(level, ModParticles.SHOCKWAVE, end.add(0.0, 1.5, 0.0), 9.0 * stage, 0.6, 12);

		// If the orb burrowed, the surface erupts out of the hole it made.
		Vec3 out = entry.subtract(end);
		if (out.length() > 6.0) {
			Vec3 dir = out.normalize();
			for (int i = 0; i < 60 * stage; i++) {
				double speed = 0.5 + random.nextDouble() * 1.4;
				Vec3 v = dir.scale(speed).add(jitter(random, 0.25));
				ParticleOptions type = switch (random.nextInt(5)) {
					case 0 -> ModParticles.MAGMA;
					case 1, 2 -> ModParticles.FIRE_BURST;
					case 3 -> ModParticles.CHAR_FLAKE;
					default -> ModParticles.EMBER;
				};
				add(level, type, entry.add(jitter(random, 1.5)), v);
			}
			glow(level, ModParticles.SHOCKWAVE, entry, 16.0 * stage, 0.9, 18);
			ring(level, ModParticles.BLAST_DUST, entry, 2.0, 40 * stage, 0.8, 0.15, random);
			glow(level, ModParticles.ORB_CORE, entry, 5.0 * stage, 0.8, 6);
		}

		// Mushroom column of smoke and lingering ash fall over the crater.
		Vec3 top = out.length() > 6.0 ? entry : end;
		for (int i = 0; i < 40 * stage; i++) {
			double h = random.nextDouble();
			Vec3 v = new Vec3(random.nextGaussian() * 0.05, 0.15 + h * 0.5, random.nextGaussian() * 0.05);
			add(level, ModParticles.HEAVY_SMOKE, top.add(jitter(random, 1.5 * stage)), v);
		}
		for (int i = 0; i < 25 * stage; i++) {
			double angle = random.nextDouble() * Math.PI * 2.0;
			Vec3 v = new Vec3(Math.cos(angle) * 0.25, 0.55 + random.nextDouble() * 0.15, Math.sin(angle) * 0.25);
			add(level, ModParticles.HEAVY_SMOKE, top, v);
		}
		for (int i = 0; i < 60 * stage; i++) {
			Vec3 p = top.add(random.nextGaussian() * 8.0 * stage, 6.0 + random.nextDouble() * 10.0, random.nextGaussian() * 8.0 * stage);
			add(level, ModParticles.ASH, p, 0.0, -0.02, 0.0);
		}
	}

	private static void backfire(ClientLevel level, Vec3 pos, RandomSource random) {
		glow(level, ModParticles.ORB_CORE, pos, 5.0, 1.0, 5);
		burst(level, ModParticles.FIRE_BURST, pos, 40, 0.8, 0.15, 0.6, 0.1, random);
		burst(level, ModParticles.EMBER, pos, 60, 0.6, 0.2, 0.8, 0.3, random);
		burst(level, ModParticles.HEAVY_SMOKE, pos, 20, 1.0, 0.03, 0.15, 0.5, random);
		burst(level, ModParticles.STATIC_SPARK, pos, 50, 0.3, 0.3, 1.0, 0.0, random);
		glow(level, ModParticles.SHOCKWAVE, pos, 10.0, 0.8, 12);
	}

	// ------------------------------------------------------------------------------------------
	// Stormcaller
	// ------------------------------------------------------------------------------------------

	/** Jagged lightning arc built with midpoint displacement, with a couple of forks. */
	private static void arc(ClientLevel level, Vec3 from, Vec3 to, float thickness, RandomSource random) {
		List<Vec3> points = new ArrayList<>();
		points.add(from);
		points.add(to);
		double length = from.distanceTo(to);
		double offset = Math.max(0.3, length * 0.18);
		for (int pass = 0; pass < 5; pass++) {
			List<Vec3> refined = new ArrayList<>();
			for (int i = 0; i < points.size() - 1; i++) {
				Vec3 a = points.get(i);
				Vec3 b = points.get(i + 1);
				refined.add(a);
				refined.add(a.add(b).scale(0.5).add(jitter(random, offset)));
			}
			refined.add(points.getLast());
			points = refined;
			offset *= 0.5;
		}
		drawPolyline(level, points, thickness);
		for (int f = 0; f < 2 && points.size() > 6; f++) {
			Vec3 forkStart = points.get(points.size() / 4 + random.nextInt(points.size() / 2));
			Vec3 forkEnd = forkStart.add(randomDir(random).scale(length * 0.25 + 0.5));
			drawPolyline(level, List.of(forkStart, forkStart.add(forkEnd).scale(0.5).add(jitter(random, 0.2)), forkEnd), thickness * 0.6F);
		}
		burst(level, ModParticles.STATIC_SPARK, to, 8, 0.15, 0.1, 0.35, 0.0, random);
	}

	private static void drawPolyline(ClientLevel level, List<Vec3> points, float thickness) {
		for (int i = 0; i < points.size() - 1; i++) {
			Vec3 a = points.get(i);
			Vec3 b = points.get(i + 1);
			double segment = a.distanceTo(b);
			int steps = Math.max(1, (int) Math.ceil(segment / 0.1));
			for (int s = 0; s < steps; s++) {
				Vec3 p = a.add(b.subtract(a).scale((double) s / steps));
				glow(level, ModParticles.ARC, p, 0.9 * thickness, 1.0, 4);
				if (s % 3 == 0) {
					glow(level, ModParticles.ARC, p, 3.0 * thickness, 0.22, 3);
				}
			}
		}
	}

	private static void stormSlam(ClientLevel level, Vec3 center, float radius, RandomSource random) {
		glow(level, ModParticles.ORB_CORE, center.add(0.0, 0.5, 0.0), 7.0, 1.0, 6);
		glow(level, ModParticles.SHOCKWAVE, center.add(0.0, 0.1, 0.0), radius * 2.2, 1.0, 16);
		ring(level, ModParticles.BLAST_DUST, center, 1.0, 48, 0.9, 0.12, random);
		burst(level, ModParticles.STATIC_SPARK, center.add(0.0, 0.5, 0.0), 80, 0.5, 0.4, 1.2, 0.3, random);
		burst(level, ModParticles.CHAR_FLAKE, center, 20, 0.6, 0.2, 0.6, 0.8, random);
		for (int i = 0; i < 3; i++) {
			arc(level, center.add(0.0, 9.0, 0.0).add(jitter(random, 1.0)), center.add(jitter(random, 0.5)), 1.6F, random);
		}
	}

	private static void stormRing(ClientLevel level, Vec3 center, float radius, RandomSource random) {
		int count = Math.max(12, (int) (radius * 7.0));
		ring(level, ModParticles.STATIC_SPARK, center, radius, count, 0.12, 0.35, random);
		ring(level, ModParticles.BLAST_DUST, center, radius, count / 3, 0.25, 0.05, random);
		for (int i = 0; i < count / 2; i++) {
			double angle = random.nextDouble() * Math.PI * 2.0;
			Vec3 p = center.add(Math.cos(angle) * radius, 0.15 + random.nextDouble() * 0.8, Math.sin(angle) * radius);
			glow(level, ModParticles.ARC, p, 1.4, 0.9, 3);
		}
	}

	private static void thunderStrike(ClientLevel level, Vec3 pos, RandomSource random) {
		glow(level, ModParticles.ORB_CORE, pos.add(0.0, 0.3, 0.0), 3.5, 1.0, 4);
		glow(level, ModParticles.SHOCKWAVE, pos.add(0.0, 0.1, 0.0), 6.0, 0.9, 9);
		burst(level, ModParticles.STATIC_SPARK, pos, 36, 0.3, 0.2, 0.7, 0.6, random);
		ring(level, ModParticles.BLAST_DUST, pos, 0.5, 14, 0.35, 0.08, random);
		burst(level, ModParticles.EMBER, pos, 10, 0.3, 0.1, 0.3, 0.6, random);
	}

	// ------------------------------------------------------------------------------------------
	// Riftfang
	// ------------------------------------------------------------------------------------------

	private static void implode(ClientLevel level, Vec3 center, double radius, int count, RandomSource random) {
		for (int i = 0; i < count; i++) {
			Vec3 offset = randomDir(random).scale(radius * (0.6 + random.nextDouble() * 0.4));
			add(level, ModParticles.VOID_MOTE, center.add(offset), offset.scale(-0.12));
		}
	}

	private static void riftSwallow(ClientLevel level, Vec3 from, Vec3 to, float width, RandomSource random) {
		double r = Math.max(1.0, width * 1.5);
		implode(level, from, r, 30, random);
		glow(level, ModParticles.RIFT_GLOW, from, 6.0 * r, 0.8, 5);
		burst(level, ModParticles.VOID_MOTE, to, 30, r * 0.4, 0.1, 0.35, 0.0, random);
		burst(level, ModParticles.RIFT_SPARK, to, 24, r * 0.3, 0.15, 0.5, 0.0, random);
		glow(level, ModParticles.RIFT_GLOW, to, 6.0 * r, 0.8, 6);
		for (int i = 0; i < 12; i++) {
			add(level, ParticleTypes.REVERSE_PORTAL, to.add(jitter(random, r * 0.5)), jitter(random, 0.15));
		}
	}

	private static void riftOpen(ClientLevel level, Vec3 center, float size, RandomSource random) {
		glow(level, ModParticles.RIFT_GLOW, center, 4.0 * size, 0.7, 5);
		burst(level, ModParticles.RIFT_SPARK, center, (int) (10 * size), size * 0.2, 0.08, 0.3, 0.0, random);
		burst(level, ModParticles.VOID_MOTE, center, (int) (8 * size), size * 0.3, 0.02, 0.12, 0.0, random);
		if (size >= 5.0F) {
			glow(level, ModParticles.SHOCKWAVE, center.add(0.0, -0.9, 0.0), size * 6.0, 0.9, 16);
			ring(level, ModParticles.RIFT_SPARK, center.add(0.0, -0.9, 0.0), 1.0, 90, 0.9, 0.05, random);
		}
	}

	// ------------------------------------------------------------------------------------------
	// Gravemaker
	// ------------------------------------------------------------------------------------------

	private static void singularityBirth(ClientLevel level, Vec3 center, RandomSource random) {
		implode(level, center, 6.0, 80, random);
		glow(level, ModParticles.SINGULARITY, center, 4.0, 1.0, 6);
		glow(level, ModParticles.SHOCKWAVE, center.add(0.0, -0.6, 0.0), 9.0, 0.6, 12);
		burst(level, ModParticles.RIFT_SPARK, center, 40, 0.5, 0.2, 0.6, 0.0, random);
	}

	private static void singularityCollapse(ClientLevel level, Vec3 center, float scale, RandomSource random) {
		if (scale < 0.0F) {
			implode(level, center, 9.0, 160, random);
			for (int i = 0; i < 60; i++) {
				Vec3 offset = randomDir(random).scale(4.0 + random.nextDouble() * 4.0);
				add(level, ModParticles.RIFT_SPARK, center.add(offset), offset.scale(-0.1));
			}
			return;
		}
		glow(level, ModParticles.ORB_CORE, center, 12.0, 1.0, 6);
		glow(level, ModParticles.SINGULARITY, center, 6.0, 1.0, 4);
		glow(level, ModParticles.SHOCKWAVE, center.add(0.0, -0.5, 0.0), scale * 2.6, 1.0, 18);
		glow(level, ModParticles.SHOCKWAVE, center.add(0.0, 1.0, 0.0), scale * 1.6, 0.6, 14);
		burst(level, ModParticles.RIFT_SPARK, center, 140, 0.8, 0.5, 1.5, 0.0, random);
		burst(level, ModParticles.VOID_MOTE, center, 100, 1.0, 0.3, 1.0, 0.0, random);
		burst(level, ModParticles.BLAST_DUST, center, 60, 1.5, 0.4, 1.1, 0.1, random);
		burst(level, ModParticles.HEAVY_SMOKE, center, 30, 2.0, 0.05, 0.3, 0.4, random);
		burst(level, ModParticles.EMBER, center, 40, 1.0, 0.3, 0.9, 0.3, random);
	}

	private static void whiteHoleBurst(ClientLevel level, Vec3 center, RandomSource random) {
		glow(level, ModParticles.ORB_CORE, center, 7.0, 1.0, 6);
		glow(level, ModParticles.SHOCKWAVE, center.add(0.0, -0.5, 0.0), 16.0, 1.0, 14);
		burst(level, ModParticles.WHITE_FLARE, center, 140, 0.5, 0.5, 1.4, 0.0, random);
		burst(level, ModParticles.BLAST_DUST, center, 36, 1.0, 0.5, 1.0, 0.1, random);
	}

	// ------------------------------------------------------------------------------------------
	// Muzzle flashes
	// ------------------------------------------------------------------------------------------

	private static void muzzleFlash(ClientLevel level, Vec3 muzzle, Vec3 dir, float scale, int weapon) {
		RandomSource random = RandomSource.create();
		Vec3 forward = dir.normalize();
		switch (weapon) {
			case FxKind.WEAPON_SUNLINE -> {
				glow(level, ModParticles.SUN_BEAM, muzzle, 6.0, 1.0, 3);
				for (int i = 0; i < 14; i++) {
					add(level, ModParticles.SUN_SPARK, muzzle, forward.scale(0.2 + random.nextDouble() * 0.4).add(jitter(random, 0.12)));
				}
			}
			case FxKind.WEAPON_WORLDBREAKER -> {
				glow(level, ModParticles.ORB_CORE, muzzle, 2.0 * scale, 1.0, 3);
				for (int i = 0; i < 12 * scale; i++) {
					add(level, ModParticles.STATIC_SPARK, muzzle, forward.scale(0.3 + random.nextDouble() * 0.5).add(jitter(random, 0.18)));
				}
				for (int i = 0; i < 4 * scale; i++) {
					add(level, ModParticles.HEAVY_SMOKE, muzzle, forward.scale(0.05).add(jitter(random, 0.03)));
				}
			}
			case FxKind.WEAPON_GRAVEMAKER -> {
				glow(level, ModParticles.RIFT_GLOW, muzzle, 5.0, 0.9, 4);
				for (int i = 0; i < 16; i++) {
					add(level, ModParticles.VOID_MOTE, muzzle, forward.scale(0.15 + random.nextDouble() * 0.3).add(jitter(random, 0.1)));
				}
			}
			default -> {
				glow(level, ModParticles.ORB_CORE, muzzle, 2.0, 1.0, 3);
				for (int i = 0; i < 16; i++) {
					add(level, ModParticles.WHITE_FLARE, muzzle, forward.scale(0.2 + random.nextDouble() * 0.4).add(jitter(random, 0.12)));
				}
			}
		}
	}
}
