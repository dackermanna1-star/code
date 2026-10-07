package dev.visceral.client.fx;

import dev.visceral.VisceralConfig;
import dev.visceral.blood.BloodType;
import dev.visceral.blood.BloodTypes;
import dev.visceral.client.ragdoll.RagdollManager;
import dev.visceral.network.HitFxPayload;
import dev.visceral.wound.WoundType;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.server.level.ParticleStatus;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.level.ClipContext;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;
import net.minecraft.world.phys.shapes.CollisionContext;

/** Turns a hit packet into a burst of blood (or bone chips, sparks, splinters...). */
public final class BloodFx {
	private BloodFx() {
	}

	public static void onHit(HitFxPayload payload) {
		Minecraft minecraft = Minecraft.getInstance();
		ClientLevel level = minecraft.level;
		if (level == null) {
			return;
		}
		Entity entity = level.getEntity(payload.entityId());
		BloodType blood = entity != null ? BloodTypes.of(entity.getType()) : BloodType.RED;
		RagdollManager.get().recordHit(payload);

		WoundType type = payload.woundType();
		boolean sharp = type != WoundType.BRUISE && type != WoundType.BURN;
		if (entity == minecraft.player && sharp && blood.bleeds() && VisceralConfig.get().screenBlood) {
			ScreenBlood.trigger(Mth.clamp(payload.damage() / 8.0F, 0.25F, 1.0F));
		}

		float amount = VisceralConfig.get().bloodAmount * particleFactor(minecraft);
		if (amount <= 0.0F) {
			return;
		}
		RandomSource random = RandomSource.create(payload.seed());
		Vec3 point = payload.point();
		Vec3 dir = payload.direction();
		if (dir.lengthSqr() < 1.0E-6) {
			dir = new Vec3(0, -1, 0);
		} else {
			dir = dir.normalize();
		}
		float damage = payload.damage();
		float severity = Mth.clamp(damage / 6.0F, 0.15F, 2.5F);
		boolean lethal = payload.has(HitFxPayload.LETHAL);
		float scale = amount * (lethal ? 1.6F : 1.0F) * (payload.has(HitFxPayload.CRITICAL) ? 1.3F : 1.0F);

		switch (blood.material) {
			case LIQUID, GOO, MAGMA -> liquid(level, random, blood, type, point, dir, damage, severity, scale, lethal);
			case BONE -> fragments(level, random, blood, point, dir, severity, scale, 0xE8E2D2, 0xB9B2A2);
			case WOOD -> fragments(level, random, blood, point, dir, severity, scale, 0x7A5634, 0xB89A6A);
			case SNOW -> {
				fragments(level, random, blood, point, dir, severity, scale, 0xF6FAFF, 0xD8E4EE);
				vanilla(level, random, point, dir, ParticleTypes.SNOWFLAKE, Math.round((4 + 6 * severity) * scale), 0.12);
			}
			case METAL -> {
				int sparks = Math.round((6 + 10 * severity) * scale);
				for (int i = 0; i < sparks; i++) {
					Vec3 v = cone(random, dir.reverse(), 0.9F).scale(0.15 + random.nextFloat() * 0.3);
					BloodParticles.spark(point.x, point.y, point.z, v.x, v.y + 0.05, v.z, 0.025F + random.nextFloat() * 0.02F, random.nextBoolean() ? 0xFFD27A : 0xFFF2C4);
				}
				fragments(level, random, blood, point, dir, severity * 0.4F, scale, blood == BloodType.COPPER ? 0x5FA88A : 0x9A9A9A, 0x6E6E6E);
			}
			case EMBER -> {
				int embers = Math.round((8 + 10 * severity) * scale);
				for (int i = 0; i < embers; i++) {
					Vec3 v = cone(random, dir, 1.2F).scale(0.05 + random.nextFloat() * 0.15);
					BloodParticles.ember(point.x, point.y, point.z, v.x, v.y + 0.04, v.z, 0.03F + random.nextFloat() * 0.03F, random.nextBoolean() ? 0xFFB347 : 0xFF7A1A);
				}
				vanilla(level, random, point, dir, ParticleTypes.SMOKE, Math.round(4 * scale), 0.05);
			}
			case SPIRIT -> vanilla(level, random, point, dir, ParticleTypes.END_ROD, Math.round((3 + 4 * severity) * scale), 0.06);
			default -> {
			}
		}
	}

	private static void liquid(ClientLevel level, RandomSource random, BloodType blood, WoundType type, Vec3 point, Vec3 dir, float damage, float severity, float scale, boolean lethal) {
		float base = switch (type) {
			case CUT -> 10 + 14 * severity;
			case GASH -> 18 + 22 * severity;
			case PUNCTURE -> 7 + 9 * severity;
			case BITE -> 8 + 9 * severity;
			case CLAW -> 10 + 12 * severity;
			case BRUISE -> damage >= 4.0F ? 2 + 4 * severity : (lethal ? 3 : 0);
			case BURN -> 0;
		};
		int drops = Math.round(base * scale);
		float sizeScale = type == WoundType.GASH ? 1.3F : blood.material == BloodType.Material.GOO ? 1.6F : 1.0F;
		boolean fromBelow = dir.y > 0.85;

		// Sideways direction: slashes drag a fan of blood along the blade.
		Vec3 side = dir.cross(new Vec3(0, 1, 0));
		if (side.lengthSqr() < 1.0E-4) {
			side = new Vec3(1, 0, 0);
		}
		side = side.normalize().scale(random.nextBoolean() ? 1 : -1);

		for (int i = 0; i < drops; i++) {
			Vec3 velocity;
			float roll = random.nextFloat();
			if (fromBelow) {
				// Landing hard: blood bursts outwards along the ground.
				float angle = random.nextFloat() * Mth.TWO_PI;
				velocity = new Vec3(Mth.cos(angle), 0.4 + random.nextFloat() * 0.6, Mth.sin(angle)).scale(0.06 + random.nextFloat() * 0.14);
			} else if (roll < 0.62F) {
				// Exit spray in the direction of the blow.
				velocity = cone(random, dir, type == WoundType.PUNCTURE ? 0.25F : 0.55F).scale(0.12 + random.nextFloat() * 0.26 * (0.7 + severity * 0.4));
			} else if (roll < 0.86F && (type == WoundType.CUT || type == WoundType.GASH || type == WoundType.CLAW)) {
				velocity = cone(random, dir.scale(0.4).add(side), 0.5F).scale(0.1 + random.nextFloat() * 0.22);
			} else {
				// Back spatter towards the attacker.
				velocity = cone(random, dir.reverse(), 0.8F).scale(0.04 + random.nextFloat() * 0.12);
			}
			velocity = velocity.add(0, 0.04 + random.nextFloat() * 0.05, 0);
			float size = Math.min(0.065F, (0.018F + random.nextFloat() * random.nextFloat() * 0.05F) * sizeScale);
			Vec3 start = point.add((random.nextFloat() - 0.5F) * 0.08, (random.nextFloat() - 0.5F) * 0.08, (random.nextFloat() - 0.5F) * 0.08);
			BloodParticles.drop(level, start.x, start.y, start.z, velocity.x, velocity.y, velocity.z, size, blood);
		}

		if (type != WoundType.BURN && (type != WoundType.BRUISE || damage >= 4.0F)) {
			int mists = Math.round((type == WoundType.BRUISE ? 1 : 2 + severity * 2) * Math.min(scale, 2.0F));
			for (int i = 0; i < mists; i++) {
				Vec3 v = cone(random, dir, 0.7F).scale(0.03 + random.nextFloat() * 0.05);
				BloodParticles.mist(point.x, point.y, point.z, v.x, v.y, v.z, 0.08F + random.nextFloat() * 0.08F * (0.6F + severity * 0.5F), blood, 0.14F + random.nextFloat() * 0.12F);
			}
		}

		// Big splash on whatever is right behind the victim.
		if (VisceralConfig.get().worldStains && blood.stains() && type != WoundType.BRUISE && type != WoundType.BURN && damage >= 2.5F) {
			int rays = (lethal ? 4 : 2) + (type == WoundType.GASH ? 1 : 0);
			for (int i = 0; i < rays; i++) {
				Vec3 rayDir = cone(random, dir.add(0, -0.15, 0).normalize(), 0.35F);
				Vec3 end = point.add(rayDir.scale(4.5));
				BlockHitResult hit = level.clip(new ClipContext(point, end, ClipContext.Block.COLLIDER, ClipContext.Fluid.NONE, CollisionContext.empty()));
				if (hit.getType() == HitResult.Type.BLOCK) {
					double distance = hit.getLocation().distanceTo(point);
					float radius = (float) Mth.clamp(0.16 + severity * 0.24 - distance * 0.045, 0.08, 0.65) * (0.75F + random.nextFloat() * 0.5F);
					BloodDecals.spatter(level, hit.getLocation(), hit.getDirection(), rayDir, radius, blood);
				}
			}
		}
	}

	private static void fragments(ClientLevel level, RandomSource random, BloodType blood, Vec3 point, Vec3 dir, float severity, float scale, int colorA, int colorB) {
		int count = Math.round((4 + 7 * severity) * scale);
		for (int i = 0; i < count; i++) {
			Vec3 v = cone(random, dir, 0.9F).scale(0.08 + random.nextFloat() * 0.2).add(0, 0.08, 0);
			int color = BloodType.lerpRgb(colorA, colorB, random.nextFloat());
			BloodParticles.chip(point.x, point.y, point.z, v.x, v.y, v.z, 0.02F + random.nextFloat() * 0.035F, blood, color);
		}
	}

	private static void vanilla(ClientLevel level, RandomSource random, Vec3 point, Vec3 dir, net.minecraft.core.particles.SimpleParticleType particle, int count, double speed) {
		for (int i = 0; i < count; i++) {
			Vec3 v = cone(random, dir, 1.0F).scale(speed * (0.5 + random.nextFloat()));
			level.addParticle(particle, point.x, point.y, point.z, v.x, v.y, v.z);
		}
	}

	/** Random unit vector within roughly {@code spread} radians of {@code axis}. */
	static Vec3 cone(RandomSource random, Vec3 axis, float spread) {
		Vec3 a = axis.lengthSqr() < 1.0E-6 ? new Vec3(0, 1, 0) : axis.normalize();
		Vec3 jitter = new Vec3(random.nextGaussian(), random.nextGaussian(), random.nextGaussian()).scale(spread * 0.6);
		Vec3 result = a.add(jitter);
		return result.lengthSqr() < 1.0E-6 ? a : result.normalize();
	}

	public static float particleFactor(Minecraft minecraft) {
		ParticleStatus status = minecraft.options.particles().get();
		return switch (status) {
			case ALL -> 1.0F;
			case DECREASED -> 0.55F;
			case MINIMAL -> 0.2F;
		};
	}
}
