package com.extremesports.client.camera;

import com.extremesports.client.ClientConfig;
import com.extremesports.client.anim.RideAnimState;
import com.extremesports.entity.SportEquipmentEntity;
import com.extremesports.physics.RideController;
import com.extremesports.sport.SurfaceType;
import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.math.Axis;
import net.minecraft.client.Minecraft;
import net.minecraft.core.BlockPos;
import net.minecraft.util.Mth;

/**
 * Camera shake on impacts, rolling vibration, speed FOV and a crouch dip in first person.
 * All effects scale with the player's settings and switch off with Reduced Motion.
 */
public final class CameraEffects {
	private static float shake;
	private static float shakeO;
	private static float fov = 1.0F;
	private static float fovO = 1.0F;
	private static float vibration;
	private static float time;

	private CameraEffects() {
	}

	public static void impulse(float strength) {
		shake = Math.min(1.5F, shake + strength * ClientConfig.get().motion(ClientConfig.get().cameraShake));
	}

	private static SportEquipmentEntity ridden() {
		Minecraft mc = Minecraft.getInstance();
		return mc.player != null && mc.player.getVehicle() instanceof SportEquipmentEntity entity ? entity : null;
	}

	public static void tick() {
		ClientConfig config = ClientConfig.get();
		shakeO = shake;
		shake *= 0.78F;
		if (shake < 0.01F) {
			shake = 0.0F;
		}
		fovO = fov;
		SportEquipmentEntity entity = ridden();
		float targetFov = 1.0F;
		float targetVibration = 0.0F;
		if (entity != null) {
			RideController ride = entity.ride;
			float speed = ride.speed;
			targetFov = 1.0F + Mth.clamp((speed - 0.3F) * 0.22F, 0.0F, 0.14F) * config.motion(config.fovEffect);
			if (ride.grounded() && speed > 0.03F) {
				BlockPos below = BlockPos.containing(entity.getX(), entity.getY() - 0.1, entity.getZ());
				SurfaceType surface = SurfaceType.classify(entity.level().getBlockState(below));
				targetVibration = (0.15F + surface.bumpiness) * Math.min(1.0F, speed * 2.0F);
			} else if (ride.contact == RideController.Contact.GRIND) {
				targetVibration = 0.6F;
			}
		}
		fov += (targetFov - fov) * 0.15F;
		vibration += (targetVibration * config.motion(config.cameraBob) - vibration) * 0.3F;
		time += 1.0F;
	}

	public static float fovMultiplier(float partialTick) {
		return Mth.lerp(partialTick, fovO, fov);
	}

	/** Applied in GameRenderer after the vanilla hurt tilt. */
	public static void apply(PoseStack poseStack, float partialTick) {
		float s = Mth.lerp(partialTick, shakeO, shake);
		float t = time + partialTick;
		if (s > 0.001F) {
			poseStack.mulPose(Axis.ZP.rotationDegrees(Mth.sin(t * 2.9F) * 2.2F * s));
			poseStack.mulPose(Axis.XP.rotationDegrees(Mth.sin(t * 3.7F + 1.3F) * 1.6F * s));
		}
		if (vibration > 0.001F) {
			poseStack.mulPose(Axis.XP.rotationDegrees((Mth.sin(t * 9.1F) * 0.5F + Mth.sin(t * 13.7F) * 0.3F) * 0.35F * vibration));
		}
	}

	/** First-person eye height offset while crouching to pop or absorbing a landing. */
	public static float eyeOffset(float partialTick) {
		SportEquipmentEntity entity = ridden();
		if (entity == null || ClientConfig.get().reducedMotion) {
			return 0.0F;
		}
		RideAnimState state = RideAnimState.of(entity);
		return -0.28F * state.crouch.get(partialTick);
	}
}
