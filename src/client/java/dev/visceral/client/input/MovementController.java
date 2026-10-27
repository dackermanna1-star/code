package dev.visceral.client.input;

import dev.visceral.client.camera.ShoulderCamera;
import dev.visceral.client.config.ClientConfig;
import dev.visceral.entity.VisceralEntity;
import net.minecraft.client.Minecraft;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Input;
import net.minecraft.world.phys.Vec2;
import net.minecraft.world.phys.Vec3;

/**
 * Post-processes keyboard movement each tick:
 * <ul>
 * <li>Decoupled camera: input is interpreted relative to the camera, and the character turns
 * towards that direction at a limited rate (momentum: wide turns at a sprint, pivots when
 * reversing), moving forward along its own facing.</li>
 * <li>Lock-on / aiming: the character faces the target (or crosshair) and strafes.</li>
 * <li>Inertia: acceleration and deceleration ramps instead of instant starts/stops, with a
 * longer run-up into a full sprint.</li>
 * <li>Knocked down / staggered: no voluntary movement.</li>
 * </ul>
 */
public final class MovementController {
	private static Vec2 smoothed = Vec2.ZERO;
	private static float sprintRamp;
	/** Raw input (x = left, y = forward) in the camera frame, before processing. */
	public static Vec2 rawInput = Vec2.ZERO;

	private MovementController() {
	}

	public static Input process(LocalPlayer player, Input keys, Vec2 move, java.util.function.Consumer<Vec2> setMove) {
		rawInput = move;
		ClientConfig cfg = ClientConfig.get();
		if (VisceralEntity.state(player).incapacitated()) {
			smoothed = Vec2.ZERO;
			setMove.accept(Vec2.ZERO);
			return new Input(false, false, false, false, false, keys.shift(), false);
		}
		Vec2 target = move;
		boolean decoupled = ShoulderCamera.decoupled();
		LivingEntity lock = LockOn.target();
		if (decoupled && lock == null && !ShoulderCamera.aiming()) {
			float len = Math.min(1f, move.length());
			if (len > 0.01f) {
				float camYaw = ShoulderCamera.viewYaw() * Mth.DEG_TO_RAD;
				// Camera-relative direction: forward = (-sin, cos), left = (cos, sin) for MC yaw.
				double fx = -Mth.sin(camYaw), fz = Mth.cos(camYaw);
				double lx = Mth.cos(camYaw), lz = Mth.sin(camYaw);
				double dx = fx * move.y + lx * move.x, dz = fz * move.y + lz * move.x;
				float desired = (float) (Mth.atan2(dz, dx) * Mth.RAD_TO_DEG) - 90f;
				float diff = Mth.wrapDegrees(desired - player.getYRot());
				float speedFactor = player.isSprinting() ? 0.55f : 1f;
				float maxStep = cfg.turnSpeed * speedFactor / 20f;
				if (smoothed.length() < 0.3f) maxStep *= 2.5f;
				float step = Mth.clamp(diff, -maxStep, maxStep);
				player.setYRot(player.getYRot() + step);
				float pivot = Math.abs(diff) > 110 ? 0.3f : (Math.abs(diff) > 60 ? 0.7f : 1f);
				target = new Vec2(0, len * pivot);
			} else {
				target = Vec2.ZERO;
			}
			player.setXRot(Mth.clamp(ShoulderCamera.viewPitch() * 0.6f, -50f, 50f));
		} else if (lock != null && !player.isSprinting()) {
			Vec3 to = lock.position().subtract(player.position());
			float yaw = (float) (Mth.atan2(to.z, to.x) * Mth.RAD_TO_DEG) - 90f;
			float diff = Mth.wrapDegrees(yaw - player.getYRot());
			player.setYRot(player.getYRot() + Mth.clamp(diff, -30f, 30f));
			double dist = to.horizontalDistance();
			float pitch = (float) -(Mth.atan2(lock.getEyeY() - player.getEyeY(), dist) * Mth.RAD_TO_DEG);
			player.setXRot(Mth.clamp(pitch, -60f, 60f));
			if (decoupled) {
				// Lock-on movement is relative to the camera, which is looking at the target.
				float rel = Mth.wrapDegrees(ShoulderCamera.viewYaw() - player.getYRot()) * Mth.DEG_TO_RAD;
				float cos = Mth.cos(rel), sin = Mth.sin(rel);
				target = new Vec2(move.x * cos + move.y * sin, move.y * cos - move.x * sin);
			}
		} else if (lock != null && decoupled) {
			// Sprinting breaks out of the strafe: run freely towards input like the unlocked case.
			float camYaw = ShoulderCamera.viewYaw() * Mth.DEG_TO_RAD;
			double dx = -Mth.sin(camYaw) * move.y + Mth.cos(camYaw) * move.x, dz = Mth.cos(camYaw) * move.y + Mth.sin(camYaw) * move.x;
			if (move.length() > 0.01f) {
				float desired = (float) (Mth.atan2(dz, dx) * Mth.RAD_TO_DEG) - 90f;
				float diff = Mth.wrapDegrees(desired - player.getYRot());
				player.setYRot(player.getYRot() + Mth.clamp(diff, -cfg.turnSpeed * 0.55f / 20f, cfg.turnSpeed * 0.55f / 20f));
				target = new Vec2(0, Math.min(1f, move.length()));
			}
		}

		target = target.scale(CombatInput.moveFactor());

		// Inertia: ramps towards the target vector; slower to build up, a little quicker to shed.
		float inertia = cfg.movementInertia;
		boolean accelerating = target.lengthSquared() > smoothed.lengthSquared();
		float rate = accelerating ? Mth.lerp(inertia, 1f, 0.28f) : Mth.lerp(inertia, 1f, 0.4f);
		if (!player.onGround()) rate *= 0.6f;
		smoothed = new Vec2(smoothed.x + (target.x - smoothed.x) * rate, smoothed.y + (target.y - smoothed.y) * rate);
		if (smoothed.lengthSquared() < 1e-5f) smoothed = Vec2.ZERO;

		// Sprint run-up: from jog pace into a full sprint over ~0.6 s.
		sprintRamp = player.isSprinting() ? Math.min(1f, sprintRamp + 0.08f + (1 - inertia) * 0.2f) : 0f;
		Vec2 out = smoothed;
		if (player.isSprinting()) out = out.scale(Mth.lerp(sprintRamp, 0.8f, 1f));
		setMove.accept(out);
		boolean forward = out.y > 0.05f;
		return new Input(forward || (!decoupled && keys.forward()), keys.backward() && !decoupled, keys.left() && !decoupled && lock == null,
			keys.right() && !decoupled && lock == null, keys.jump(), keys.shift(), keys.sprint());
	}
}
