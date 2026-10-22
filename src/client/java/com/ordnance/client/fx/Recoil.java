package com.ordnance.client.fx;

import com.ordnance.config.ConfigManager;
import net.minecraft.client.network.ClientPlayerEntity;
import net.minecraft.util.math.MathHelper;

/** Local-player recoil: a muzzle climb applied to the real aim over a few ticks, plus a view-model kick. */
public final class Recoil {
	private static float kick;
	private static float lastKick;
	private static float pendingPitch;
	private static float pendingYaw;

	private Recoil() {
	}

	public static void fire(float pitchDegrees, float yawJitter, float kickAmount) {
		float scale = ConfigManager.get().visuals.recoil;
		kick = Math.min(1.0F, kick + kickAmount * Math.min(1.0F, scale));
		pendingPitch += pitchDegrees * scale;
		pendingYaw += yawJitter * scale;
	}

	public static void tick(ClientPlayerEntity player) {
		lastKick = kick;
		kick *= 0.7F;
		if (Math.abs(pendingPitch) > 0.01F || Math.abs(pendingYaw) > 0.01F) {
			float pitchStep = pendingPitch * 0.55F;
			float yawStep = pendingYaw * 0.55F;
			player.setPitch(MathHelper.clamp(player.getPitch() - pitchStep, -90.0F, 90.0F));
			player.setYaw(player.getYaw() + yawStep);
			pendingPitch -= pitchStep;
			pendingYaw -= yawStep;
		}
	}

	public static float kick(float tickDelta) {
		return MathHelper.lerp(tickDelta, lastKick, kick);
	}

	public static void reset() {
		kick = lastKick = pendingPitch = pendingYaw = 0.0F;
	}
}
