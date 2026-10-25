package com.godforge.client.fx;

import com.godforge.client.ClientConfig;
import com.godforge.network.FxPayload;
import com.godforge.network.FxType;
import com.godforge.registry.FxParticleOptions;
import com.godforge.registry.ModParticles;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.core.particles.ParticleType;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.world.phys.Vec3;

/** Turns compact server effect packets into rich client-side visuals. */
public final class ClientFx {
	private static final int ADD = FxParticleOptions.F_ADDITIVE;
	private static final int SHRINK = FxParticleOptions.F_SHRINK;
	private static final int NOPHYS = FxParticleOptions.F_NO_PHYSICS;

	private ClientFx() {
	}

	public static void handle(FxPayload p) {
		Minecraft mc = Minecraft.getInstance();
		ClientLevel level = mc.level;
		if (level == null || mc.player == null) {
			return;
		}
		RandomSource random = RandomSource.create(p.seed());
		Vec3 pos = new Vec3(p.x(), p.y(), p.z());
		Vec3 vec = new Vec3(p.vx(), p.vy(), p.vz());
		double dist = mc.player.position().distanceTo(pos);
		switch (p.fx()) {
			case FLASH -> ScreenEffects.flash(p.color(), p.a() * falloff(dist, p.vx()), (int) p.b());
			case SHAKE -> ScreenEffects.shake(p.a() * falloff(dist, p.vx()), (int) p.b());
			case DISTORT -> ScreenEffects.distort(p.a() * falloff(dist, p.vx()), (int) p.b());
			case SKY_FLASH -> {
				if (dist < p.vx()) {
					level.setSkyFlashTime((int) p.b());
				}
			}
			case SHOCKWAVE -> shockwave(level, random, pos, p.a(), (int) p.b(), p.color());
			case EXPLOSION -> explosion(level, random, pos, p.a(), p.color(), p.b() > 0);
			case DUST_LINE -> dustLine(level, random, pos, vec, p.a(), p.color());
			case SLASH -> slash(level, random, pos, vec, p.a(), p.color());
			case SEVER -> sever(level, random, pos, vec, p.a(), p.color());
			case CHARGE -> charge(level, random, pos, p.color());
			case IMPLOSION -> implosion(level, random, pos, p.a(), Math.max(6, (int) p.b()), p.color());
			case NOVA -> nova(level, random, pos, p.a(), p.b() > 0);
			case STAR_BURST -> starBurst(level, random, pos, p.a(), p.b() > 0, p.color());
			case KINETIC -> kinetic(level, random, pos, vec, p.a(), p.b() > 0, p.color());
			case SOLAR -> solar(level, random, pos, p.a(), p.b() > 0, p.color());
			case ORBITAL -> orbital(level, random, pos, p.a(), Math.max(8, (int) p.b()), p.color());
			case SHATTER -> shatter(level, random, pos, p.a(), p.b(), p.color(), dist);
			case MUZZLE -> muzzle(level, random, pos, vec, p.a(), p.b() > 0, p.color());
			case LOCK_ON -> WorldFx.add(new WorldFx.LockOn(pos, p.a(), Math.max(20, (int) p.b()), p.color()));
			case HEAT_HAZE -> heatHaze(level, random, pos, p.a(), p.color());
			case DEBRIS_RING -> debrisRing(level, random, pos, p.a(), p.color());
		}
	}

	private static float falloff(double dist, float range) {
		if (range <= 0.0F) {
			return 1.0F;
		}
		return (float) Mth.clamp(1.0 - dist / range, 0.0, 1.0);
	}

	private static void spawn(ClientLevel level, ParticleType<FxParticleOptions> type, int color, int fade, float size, int life, float gravity, int flags,
		double x, double y, double z, double dx, double dy, double dz) {
		level.addParticle(FxParticleOptions.of(type, color, fade, size, life, gravity, flags), x, y, z, dx, dy, dz);
	}

	private static Vec3 randomDir(RandomSource random) {
		Vec3 v = new Vec3(random.nextGaussian(), random.nextGaussian(), random.nextGaussian());
		return v.lengthSqr() < 1.0E-6 ? new Vec3(0, 1, 0) : v.normalize();
	}

	// ------------------------------------------------------------------ presets

	static void shockwave(ClientLevel level, RandomSource random, Vec3 pos, float radius, int duration, int color) {
		WorldFx.add(new WorldFx.Shockwave(pos, radius, Math.max(8, duration), color));
		int dust = ClientConfig.count((int) Math.min(160, radius * 4));
		for (int i = 0; i < dust; i++) {
			double angle = random.nextDouble() * Math.PI * 2;
			double r = radius * (0.15 + random.nextDouble() * 0.25);
			double speed = radius / Math.max(8, duration) * 1.4;
			spawn(level, ModParticles.SMOKE, 0x8C7B6B, 0x5A5048, 1.0F + random.nextFloat() * 1.5F, 30 + random.nextInt(30), 0.0F, FxParticleOptions.F_GROW,
				pos.x + Math.cos(angle) * r, pos.y + 0.3, pos.z + Math.sin(angle) * r, Math.cos(angle) * speed, 0.03, Math.sin(angle) * speed);
		}
	}

	static void explosion(ClientLevel level, RandomSource random, Vec3 pos, float radius, int color, boolean dark) {
		WorldFx.add(new WorldFx.Glow(pos, radius * 1.4F, 10 + (int) radius, dark ? 0xC9A0FF : color));
		WorldFx.add(new WorldFx.Shell(pos, radius * 0.3F, radius * 1.3F, 12 + (int) (radius * 0.6F), color, false));
		int sparks = ClientConfig.count((int) Math.min(220, 30 + radius * 10));
		for (int i = 0; i < sparks; i++) {
			Vec3 d = randomDir(random);
			double speed = (0.3 + random.nextDouble()) * (0.4 + radius * 0.12);
			spawn(level, i % 3 == 0 ? ModParticles.SPARK : ModParticles.PLASMA, i % 4 == 0 ? 0xFFFFFF : color, 0x3A1A0A, 0.25F + random.nextFloat() * 0.35F + radius * 0.03F,
				18 + random.nextInt(18), 0.4F, ADD | SHRINK, pos.x, pos.y, pos.z, d.x * speed, Math.abs(d.y) * speed + 0.1, d.z * speed);
		}
		int smoke = ClientConfig.count((int) Math.min(80, 10 + radius * 3));
		for (int i = 0; i < smoke; i++) {
			Vec3 d = randomDir(random);
			double speed = 0.1 + random.nextDouble() * radius * 0.05;
			spawn(level, ModParticles.SMOKE, 0x3A3430, 0x1A1816, 1.5F + random.nextFloat() * radius * 0.25F, 60 + random.nextInt(60), -0.03F, FxParticleOptions.F_GROW,
				pos.x + d.x * radius * 0.4, pos.y + Math.abs(d.y) * radius * 0.3, pos.z + d.z * radius * 0.4, d.x * speed, 0.05 + Math.abs(d.y) * speed, d.z * speed);
		}
		spawn(level, ModParticles.RING, color, color, radius * 0.4F, 16, 0.0F, ADD | NOPHYS | FxParticleOptions.F_FLAT | FxParticleOptions.F_GROW, pos.x, pos.y + 0.2, pos.z, 0, 0, 0);
	}

	static void dustLine(ClientLevel level, RandomSource random, Vec3 from, Vec3 vec, float width, int color) {
		int count = ClientConfig.count((int) Math.min(120, vec.length() * 0.8));
		for (int i = 0; i < count; i++) {
			Vec3 p = from.add(vec.scale(random.nextDouble()));
			spawn(level, ModParticles.SMOKE, color, 0x4A4038, 0.8F + random.nextFloat() * 1.2F, 40 + random.nextInt(40), 0.02F, FxParticleOptions.F_GROW,
				p.x + (random.nextDouble() - 0.5) * width, p.y + random.nextDouble() * 6.0 - 2.0, p.z + (random.nextDouble() - 0.5) * width, 0, -0.02, 0);
		}
	}

	static void slash(ClientLevel level, RandomSource random, Vec3 pos, Vec3 vec, float width, int color) {
		Vec3 dir = vec.lengthSqr() > 1.0E-6 ? vec.normalize() : new Vec3(0, 0, 1);
		Vec3 right = new Vec3(-dir.z, 0, dir.x);
		int count = ClientConfig.count(40);
		for (int i = 0; i < count; i++) {
			double s = (random.nextDouble() - 0.5) * width;
			double bend = (1.0 - Math.abs(s) / (width * 0.5)) * 1.5;
			Vec3 p = pos.add(right.scale(s)).add(dir.scale(bend));
			spawn(level, ModParticles.SPARK, i % 2 == 0 ? 0xFFFFFF : color, 0x5A2AFF, 0.2F, 10 + random.nextInt(6), 0.0F, ADD | SHRINK | NOPHYS,
				p.x, p.y, p.z, dir.x * 0.8, dir.y * 0.8, dir.z * 0.8);
		}
		WorldFx.add(new WorldFx.Glow(pos.add(dir.scale(1.5)), width * 0.5F, 6, color));
	}

	static void sever(ClientLevel level, RandomSource random, Vec3 origin, Vec3 vec, float height, int color) {
		WorldFx.add(new WorldFx.Sever(origin, vec, height, color));
		double len = vec.length();
		Vec3 dir = len > 1.0E-6 ? vec.scale(1.0 / len) : new Vec3(0, 0, 1);
		int count = ClientConfig.count((int) Math.min(600, len * 4));
		for (int i = 0; i < count; i++) {
			double t = random.nextDouble() * len;
			Vec3 p = origin.add(dir.scale(t)).add(0, (random.nextDouble() - 0.4) * height * 0.8, 0);
			Vec3 out = new Vec3(-dir.z, 0, dir.x).scale(random.nextBoolean() ? 1 : -1);
			double speed = 0.1 + random.nextDouble() * 0.5;
			spawn(level, i % 3 == 0 ? ModParticles.SHARD : ModParticles.GLOW, i % 2 == 0 ? 0xFFFFFF : color, 0x3A1AFF, 0.2F + random.nextFloat() * 0.5F,
				20 + random.nextInt(30), 0.0F, ADD | SHRINK | NOPHYS | FxParticleOptions.F_SPIN, p.x, p.y, p.z, out.x * speed, (random.nextDouble() - 0.5) * 0.1, out.z * speed);
		}
	}

	static void charge(ClientLevel level, RandomSource random, Vec3 pos, int color) {
		WorldFx.add(new WorldFx.Glow(pos, 0.9F, 8, color));
		int count = ClientConfig.count(30);
		for (int i = 0; i < count; i++) {
			Vec3 d = randomDir(random);
			spawn(level, ModParticles.STAR, color, 0xFFFFFF, 0.12F, 12, 0.0F, ADD | SHRINK | NOPHYS, pos.x, pos.y, pos.z, d.x * 0.25, d.y * 0.25, d.z * 0.25);
		}
	}

	static void implosion(ClientLevel level, RandomSource random, Vec3 pos, float radius, int duration, int color) {
		WorldFx.add(new WorldFx.Shell(pos, radius * 2.5F, 0.2F, duration, color, false));
		int count = ClientConfig.count((int) Math.min(400, 60 + radius * 20));
		for (int i = 0; i < count; i++) {
			Vec3 d = randomDir(random);
			Vec3 p = pos.add(d.scale(radius * (1.5 + random.nextDouble() * 2.5)));
			spawn(level, ModParticles.GLOW, i % 2 == 0 ? color : 0xFFFFFF, 0x1A0033, 0.2F + random.nextFloat() * 0.3F, duration + 10, 0.0F,
				ADD | NOPHYS | FxParticleOptions.F_ATTRACT | FxParticleOptions.F_SPIN, p.x, p.y, p.z, pos.x, pos.y, pos.z);
		}
	}

	static void nova(ClientLevel level, RandomSource random, Vec3 pos, float radius, boolean ultimate) {
		WorldFx.add(new WorldFx.Shell(pos, radius * 0.2F, radius * (ultimate ? 2.4F : 1.6F), ultimate ? 40 : 22, 0xFFFFFF, true));
		WorldFx.add(new WorldFx.Glow(pos, radius * 1.5F, ultimate ? 30 : 14, 0xFFFFFF));
		for (int k = 0; k < (ultimate ? 3 : 1); k++) {
			WorldFx.add(new WorldFx.Shockwave(pos, radius * (3.0F + k * 1.5F), 20 + k * 8, Mth.hsvToRgb(random.nextFloat(), 0.8F, 1.0F)));
		}
		int count = ClientConfig.count((int) Math.min(700, 120 + radius * 30));
		for (int i = 0; i < count; i++) {
			Vec3 d = randomDir(random);
			double speed = (0.4 + random.nextDouble()) * (0.5 + radius * 0.15);
			spawn(level, i % 5 == 0 ? ModParticles.STAR : ModParticles.GLOW, 0xFFFFFF, 0xFFFFFF, 0.3F + random.nextFloat() * 0.5F, 25 + random.nextInt(30), 0.0F,
				ADD | SHRINK | NOPHYS | FxParticleOptions.F_RAINBOW, pos.x, pos.y, pos.z, d.x * speed, d.y * speed, d.z * speed);
		}
	}

	static void starBurst(ClientLevel level, RandomSource random, Vec3 pos, float radius, boolean judgment, int color) {
		WorldFx.add(new WorldFx.Glow(pos, radius * (judgment ? 2.0F : 1.2F), judgment ? 40 : 10, 0xFFF6D0));
		WorldFx.add(new WorldFx.Shell(pos, radius * 0.2F, radius * (judgment ? 2.2F : 1.4F), judgment ? 45 : 14, color, false));
		if (judgment) {
			WorldFx.add(new WorldFx.Beam(pos.add(0, 200, 0), pos, radius * 0.5F, 30, 0xFFF2B0));
			for (int k = 0; k < 4; k++) {
				WorldFx.add(new WorldFx.Shockwave(pos, radius * (2.0F + k * 1.2F), 26 + k * 10, k % 2 == 0 ? 0xFFF2B0 : 0x8FD0FF));
			}
		}
		int count = ClientConfig.count((int) Math.min(judgment ? 900 : 120, 40 + radius * 25));
		for (int i = 0; i < count; i++) {
			Vec3 d = randomDir(random);
			double speed = (0.3 + random.nextDouble()) * (0.4 + radius * 0.1);
			int c = random.nextInt(3) == 0 ? 0x8FD0FF : (random.nextBoolean() ? 0xFFFFFF : color);
			spawn(level, i % 3 == 0 ? ModParticles.STAR : ModParticles.SPARK, c, 0x3A5BFF, 0.25F + random.nextFloat() * (judgment ? 0.9F : 0.3F), 20 + random.nextInt(25),
				0.15F, ADD | SHRINK, pos.x, pos.y + 0.5, pos.z, d.x * speed, Math.abs(d.y) * speed + 0.1, d.z * speed);
		}
	}

	static void kinetic(ClientLevel level, RandomSource random, Vec3 pos, Vec3 dir, float radius, boolean ultimate, int color) {
		WorldFx.add(new WorldFx.Glow(pos, radius * 0.8F, 8, color));
		WorldFx.add(new WorldFx.Shockwave(pos.add(0, -0.5, 0), radius * (ultimate ? 2.5F : 1.6F), ultimate ? 30 : 12, color));
		if (ultimate) {
			WorldFx.add(new WorldFx.Shell(pos, radius * 0.3F, radius * 1.8F, 26, 0xBFF6FF, false));
		}
		Vec3 forward = dir.lengthSqr() > 1.0E-6 ? dir.normalize() : new Vec3(0, 1, 0);
		int count = ClientConfig.count((int) Math.min(ultimate ? 700 : 120, 30 + radius * 20));
		for (int i = 0; i < count; i++) {
			Vec3 d = randomDir(random).add(forward.scale(0.8)).normalize();
			double speed = (0.4 + random.nextDouble()) * (0.5 + radius * 0.12);
			spawn(level, i % 2 == 0 ? ModParticles.SPARK : ModParticles.GLOW, i % 3 == 0 ? 0xFFFFFF : color, 0x1A4AFF, 0.2F + random.nextFloat() * 0.3F, 14 + random.nextInt(12),
				0.2F, ADD | SHRINK, pos.x, pos.y, pos.z, d.x * speed, d.y * speed, d.z * speed);
		}
		int dust = ClientConfig.count((int) Math.min(200, radius * 8));
		for (int i = 0; i < dust; i++) {
			double angle = random.nextDouble() * Math.PI * 2;
			double speed = 0.2 + random.nextDouble() * radius * 0.08;
			spawn(level, ModParticles.SMOKE, 0x9A8A78, 0x5A5048, 1.0F + random.nextFloat() * 2.0F, 40 + random.nextInt(40), 0.0F, FxParticleOptions.F_GROW,
				pos.x, pos.y, pos.z, Math.cos(angle) * speed, 0.05 + random.nextDouble() * 0.2, Math.sin(angle) * speed);
		}
	}

	static void solar(ClientLevel level, RandomSource random, Vec3 pos, float radius, boolean apocalypse, int color) {
		WorldFx.add(new WorldFx.Glow(pos, radius * (apocalypse ? 1.6F : 1.0F), apocalypse ? 50 : 14, 0xFFF4D0));
		WorldFx.add(new WorldFx.Shell(pos, radius * 0.1F, radius * (apocalypse ? 1.5F : 1.1F), apocalypse ? 50 : 18, 0xFFB01F, false));
		if (apocalypse) {
			for (int k = 0; k < 5; k++) {
				WorldFx.add(new WorldFx.Shockwave(pos, radius * (1.2F + k * 0.6F), 30 + k * 10, k % 2 == 0 ? 0xFF8A1F : 0xFFE27A));
			}
		}
		int count = ClientConfig.count((int) Math.min(apocalypse ? 1000 : 200, 60 + radius * 20));
		for (int i = 0; i < count; i++) {
			Vec3 d = randomDir(random);
			double speed = (0.3 + random.nextDouble()) * (0.4 + radius * 0.1);
			spawn(level, ModParticles.PLASMA, random.nextBoolean() ? 0xFFF2A0 : 0xFF8A1F, 0xB0200A, 0.4F + random.nextFloat() * (apocalypse ? 1.6F : 0.6F), 25 + random.nextInt(30),
				0.05F, ADD | SHRINK, pos.x, pos.y + 0.5, pos.z, d.x * speed, Math.abs(d.y) * speed, d.z * speed);
		}
	}

	static void orbital(ClientLevel level, RandomSource random, Vec3 pos, float radius, int duration, int color) {
		WorldFx.add(new WorldFx.Beam(pos.add(0, 260, 0), pos, radius, duration, color));
		WorldFx.add(new WorldFx.Glow(pos, radius * 4.0F, duration, color));
		WorldFx.add(new WorldFx.Shockwave(pos, radius * 8.0F, 18, color));
		int count = ClientConfig.count(80);
		for (int i = 0; i < count; i++) {
			Vec3 d = randomDir(random);
			double speed = 0.3 + random.nextDouble() * 1.2;
			spawn(level, ModParticles.SPARK, i % 2 == 0 ? 0xFFFFFF : color, color, 0.3F, 16 + random.nextInt(10), 0.3F, ADD | SHRINK,
				pos.x, pos.y + 0.5, pos.z, d.x * speed, Math.abs(d.y) * speed + 0.3, d.z * speed);
		}
	}

	static void shatter(ClientLevel level, RandomSource random, Vec3 pos, float radius, float mode, int color, double dist) {
		WorldFx.add(new WorldFx.Shell(pos, radius * 0.2F, radius * 1.4F, 16, color, false));
		WorldFx.add(new WorldFx.Glow(pos, radius * 0.6F, 10, 0xE8C8FF));
		if (mode >= 1.0F && dist < radius * 4.0 + 24.0) {
			ScreenEffects.cracks(mode >= 2.0F ? 1.0F : 0.6F);
		}
		int count = ClientConfig.count((int) Math.min(500, 40 + radius * 18));
		for (int i = 0; i < count; i++) {
			Vec3 d = randomDir(random);
			double speed = (0.2 + random.nextDouble()) * (0.3 + radius * 0.06);
			spawn(level, i % 2 == 0 ? ModParticles.SHARD : ModParticles.GLOW, i % 3 == 0 ? 0x6CF6FF : color, 0x2A0A4A, 0.15F + random.nextFloat() * 0.35F,
				30 + random.nextInt(30), 0.05F, ADD | SHRINK | FxParticleOptions.F_SPIN, pos.x, pos.y + 0.5, pos.z, d.x * speed, Math.abs(d.y) * speed + 0.05, d.z * speed);
		}
	}

	static void muzzle(ClientLevel level, RandomSource random, Vec3 pos, Vec3 vec, float size, boolean arc, int color) {
		if (arc && vec.lengthSqr() > 4.0) {
			WorldFx.add(new WorldFx.Arc(pos, pos.add(vec), 0.15F + size * 0.05F, 8, color, random.nextLong()));
			WorldFx.add(new WorldFx.Glow(pos.add(vec), size, 8, color));
			return;
		}
		Vec3 dir = vec.lengthSqr() > 1.0E-6 ? vec.normalize() : new Vec3(0, 1, 0);
		WorldFx.add(new WorldFx.Glow(pos, size, 5, color));
		int count = ClientConfig.count(12 + (int) (size * 10));
		for (int i = 0; i < count; i++) {
			Vec3 d = dir.add(randomDir(random).scale(0.35)).normalize();
			double speed = 0.2 + random.nextDouble() * (0.3 + size * 0.2);
			spawn(level, ModParticles.SPARK, i % 2 == 0 ? 0xFFFFFF : color, color, 0.12F + size * 0.05F, 6 + random.nextInt(6), 0.0F, ADD | SHRINK | NOPHYS,
				pos.x, pos.y, pos.z, d.x * speed, d.y * speed, d.z * speed);
		}
	}

	static void heatHaze(ClientLevel level, RandomSource random, Vec3 pos, float radius, int color) {
		int count = ClientConfig.count((int) Math.min(40, 4 + radius * 1.5));
		for (int i = 0; i < count; i++) {
			double angle = random.nextDouble() * Math.PI * 2;
			double r = Math.sqrt(random.nextDouble()) * radius;
			double x = pos.x + Math.cos(angle) * r;
			double z = pos.z + Math.sin(angle) * r;
			if (i % 3 == 0) {
				spawn(level, ModParticles.SMOKE, 0xFFFFFF, 0xFFE8C8, 0.6F + random.nextFloat(), 26 + random.nextInt(20), -0.06F, FxParticleOptions.F_GROW | NOPHYS,
					x, pos.y + 0.2, z, 0, 0.04, 0);
			} else {
				spawn(level, ModParticles.PLASMA, color, 0x8A1A05, 0.08F + random.nextFloat() * 0.1F, 20 + random.nextInt(20), -0.05F, ADD | SHRINK,
					x, pos.y + 0.2, z, (random.nextDouble() - 0.5) * 0.04, 0.05 + random.nextDouble() * 0.08, (random.nextDouble() - 0.5) * 0.04);
			}
		}
	}

	static void debrisRing(ClientLevel level, RandomSource random, Vec3 pos, float radius, int color) {
		int count = ClientConfig.count((int) Math.min(240, radius * 6));
		for (int i = 0; i < count; i++) {
			double angle = random.nextDouble() * Math.PI * 2;
			double r = radius * (0.85 + random.nextDouble() * 0.3);
			spawn(level, ModParticles.SMOKE, 0x8C7B6B, 0x4A4038, 0.8F + random.nextFloat() * 1.6F, 30 + random.nextInt(40), 0.05F, FxParticleOptions.F_GROW,
				pos.x + Math.cos(angle) * r, pos.y + 0.5, pos.z + Math.sin(angle) * r, Math.cos(angle) * 0.15, 0.1 + random.nextDouble() * 0.25, Math.sin(angle) * 0.15);
		}
	}
}
