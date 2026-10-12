package com.extremesports.client.anim;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import net.minecraft.client.Minecraft;
import net.minecraft.client.model.player.PlayerModel;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.Entity;
import org.jspecify.annotations.Nullable;

/**
 * Tumble-and-recover animation played on a player after they bail: thrown forward, roll onto the ground, lie for a
 * moment, then get back up. Driven by a server broadcast so everyone nearby sees it.
 */
public final class BailAnimations {
	public static final int TUMBLE = 12;
	public static final int LIE = 16;
	public static final int RECOVER = 14;
	public static final int TOTAL = TUMBLE + LIE + RECOVER;

	private record Bail(long startTick, float yaw, float spin) {
	}

	/** Whole-body transform plus phase info for limb posing. */
	public record Pose(float yaw, float pitch, float roll, float lift, float tumble, float lying, float recover, float time) {
	}

	private static final Map<Integer, Bail> ACTIVE = new ConcurrentHashMap<>();

	private BailAnimations() {
	}

	public static void start(Entity entity, float yaw) {
		long now = entity.level().getGameTime();
		ACTIVE.put(entity.getId(), new Bail(now, yaw, entity.getRandom().nextBoolean() ? 1.0F : -1.0F));
	}

	public static boolean isBailing(Entity entity, int withinTicks) {
		Bail bail = ACTIVE.get(entity.getId());
		return bail != null && entity.level().getGameTime() - bail.startTick < withinTicks;
	}

	public static @Nullable Pose pose(Entity entity, float partialTick) {
		Bail bail = ACTIVE.get(entity.getId());
		if (bail == null) {
			return null;
		}
		float t = entity.level().getGameTime() - bail.startTick + partialTick;
		if (t >= TOTAL || entity.isPassenger()) {
			ACTIVE.remove(entity.getId());
			return null;
		}
		float tumble = Mth.clamp(t / TUMBLE, 0.0F, 1.0F);
		float lying = t < TUMBLE ? 0.0F : t < TUMBLE + LIE ? 1.0F : 0.0F;
		float recover = Mth.clamp((t - TUMBLE - LIE) / RECOVER, 0.0F, 1.0F);
		float down = RideAnimator.ease(tumble) * (1.0F - RideAnimator.ease(recover));
		float pitch = 88.0F * down;
		float roll = Mth.sin(tumble * (float) Math.PI) * 35.0F * bail.spin * (1.0F - recover);
		float lift = 0.12F * down;
		return new Pose(bail.yaw, pitch, roll, lift, tumble, lying, recover, t);
	}

	public static void applyLimbs(PlayerModel model, Pose pose) {
		float down = 1.0F - RideAnimator.ease(pose.recover());
		float flail = pose.tumble() < 1.0F ? Mth.sin(pose.time() * 1.6F) : 0.0F;
		model.rightArm.xRot = Mth.lerp(down, model.rightArm.xRot, -2.6F + flail * 0.8F);
		model.leftArm.xRot = Mth.lerp(down, model.leftArm.xRot, -2.4F - flail * 0.8F);
		model.rightArm.zRot = Mth.lerp(down, model.rightArm.zRot, 0.6F);
		model.leftArm.zRot = Mth.lerp(down, model.leftArm.zRot, -0.6F);
		model.rightLeg.xRot = Mth.lerp(down, model.rightLeg.xRot, 0.2F + flail * 0.5F);
		model.leftLeg.xRot = Mth.lerp(down, model.leftLeg.xRot, -0.1F - flail * 0.5F);
		model.rightLeg.zRot = Mth.lerp(down, model.rightLeg.zRot, 0.25F);
		model.leftLeg.zRot = Mth.lerp(down, model.leftLeg.zRot, -0.25F);
		model.head.xRot = Mth.lerp(down, model.head.xRot, -0.6F);
	}

	/** Whether the local player is still too dazed to move. */
	public static boolean localLocked() {
		Minecraft mc = Minecraft.getInstance();
		return mc.player != null && isBailing(mc.player, TUMBLE + LIE);
	}
}
