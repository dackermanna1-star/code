package dev.visceral.client.fx;

import dev.visceral.VisceralConfig;
import dev.visceral.blood.BloodType;
import dev.visceral.blood.BloodTypes;
import dev.visceral.client.wound.ClientWounds;
import dev.visceral.client.wound.WoundPlacement;
import dev.visceral.registry.VisceralAttachments;
import dev.visceral.wound.BodyFrame;
import dev.visceral.wound.Wound;
import dev.visceral.wound.WoundData;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.phys.Vec3;

/**
 * Open wounds keep dripping while they bleed: fresh deep cuts spurt in time with the heartbeat,
 * drips trail behind moving creatures and collect into puddles under ones that stand still.
 */
public final class BleedingFx {
	/** Corpses keep leaking for a while after death. */
	public static final int CORPSE_BLEED_TICKS = 500;
	private static final double MAX_DISTANCE_SQ = 64.0 * 64.0;
	private static final RandomSource RANDOM = RandomSource.create();

	private BleedingFx() {
	}

	public static void tick(ClientLevel level, Iterable<? extends Entity> extraCorpses) {
		Minecraft minecraft = Minecraft.getInstance();
		Vec3 camera = minecraft.gameRenderer.getMainCamera().position();
		float amount = VisceralConfig.get().bloodAmount * BloodFx.particleFactor(minecraft);
		if (amount <= 0.0F) {
			return;
		}
		for (Entity entity : level.entitiesForRendering()) {
			if (entity instanceof LivingEntity living && living.hasAttached(VisceralAttachments.WOUNDS)) {
				bleed(level, living, camera, amount, living.isDeadOrDying());
			}
		}
		for (Entity corpse : extraCorpses) {
			if (corpse instanceof LivingEntity living && corpse.isRemoved() && living.hasAttached(VisceralAttachments.WOUNDS)) {
				bleed(level, living, camera, amount, true);
			}
		}
	}

	private static void bleed(ClientLevel level, LivingEntity entity, Vec3 camera, float amount, boolean dead) {
		if (entity.distanceToSqr(camera) > MAX_DISTANCE_SQ) {
			return;
		}
		WoundData data = entity.getAttached(VisceralAttachments.WOUNDS);
		BloodType blood = BloodTypes.of(entity.getType());
		if (data == null || !blood.bleeds()) {
			return;
		}
		long now = level.getGameTime();
		float multiplier = Math.max(0.35F, VisceralConfig.get().bleedDurationMultiplier);
		for (Wound wound : data.wounds()) {
			if (!wound.type().bleeds()) {
				continue;
			}
			long age = now - wound.time();
			long limit = wound.bleedTicks(multiplier) + (dead ? CORPSE_BLEED_TICKS : 0);
			if (age < 0 || age > limit) {
				continue;
			}
			float remaining = 1.0F - (float) age / limit;
			float intensity = wound.severity() * (float) Math.pow(remaining, 0.6);

			Vec3 position;
			Vec3 normal;
			WoundPlacement placement = ClientWounds.get(entity.getId(), wound);
			if (placement != null && placement.lastWorldPos != null && now - placement.lastSeenTick < 20) {
				position = placement.lastWorldPos;
				normal = placement.lastWorldNormal != null ? placement.lastWorldNormal : new Vec3(0, 0, 0);
			} else {
				// Not rendered (first person, out of view): approximate from the stored hit ray.
				float yaw = entity.yBodyRot;
				Vec3 origin = BodyFrame.fromBody(wound.origin().x(), wound.origin().y(), wound.origin().z(), yaw);
				Vec3 dir = BodyFrame.fromBody(wound.dir().x(), wound.dir().y(), wound.dir().z(), yaw);
				position = entity.position().add(origin).add(dir.scale(0.75));
				normal = dir.reverse();
			}

			// Arterial spurts for the first seconds of a deep wound.
			if (age < 36 && wound.severity() > 0.9F && age % 7 == 0 && !dead) {
				int count = Math.round((2 + wound.severity() * 2.5F) * amount);
				for (int i = 0; i < count; i++) {
					Vec3 v = BloodFx.cone(RANDOM, normal.add(0, 0.35, 0), 0.25F).scale(0.08 + RANDOM.nextFloat() * 0.12 * wound.severity());
					BloodParticles.drop(level, position.x, position.y, position.z, v.x, v.y, v.z, 0.016F + RANDOM.nextFloat() * 0.02F, blood);
				}
			}

			float chance = Mth.clamp((0.05F + 0.2F * intensity) * amount, 0.0F, 0.85F);
			if (RANDOM.nextFloat() < chance) {
				Vec3 start = position.add(normal.scale(0.03));
				Vec3 v = normal.scale(0.012).add((RANDOM.nextFloat() - 0.5F) * 0.01, -0.01, (RANDOM.nextFloat() - 0.5F) * 0.01);
				BloodParticles.drop(level, start.x, start.y, start.z, v.x, v.y, v.z, 0.026F + RANDOM.nextFloat() * 0.022F * Math.min(1.5F, wound.severity()), blood);
			}
		}
	}
}
