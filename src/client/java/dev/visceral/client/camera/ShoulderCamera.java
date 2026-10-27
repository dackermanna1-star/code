package dev.visceral.client.camera;

import dev.visceral.client.config.ClientConfig;
import dev.visceral.client.input.LockOn;
import dev.visceral.combat.AttackDef;
import dev.visceral.entity.VisceralEntity;
import dev.visceral.net.Payloads;
import net.minecraft.client.CameraType;
import net.minecraft.client.Minecraft;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.projectile.ProjectileUtil;
import net.minecraft.world.level.ClipContext;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.EntityHitResult;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;
import org.jspecify.annotations.Nullable;

/**
 * Cinematic over-the-shoulder third-person camera.
 *
 * <p>Owns its own yaw/pitch when decoupled (the mouse orbits the camera; the character turns
 * towards its movement). The pivot follows the eyes through a critically damped spring (less
 * vertical bounce on stairs and jumps), the boom pulls back slightly at a sprint and frames
 * lock-on targets, collision pulls it in instantly and lets it back out slowly, and impacts add
 * a small, configurable trauma shake. No roll, no head-bob: designed to stay comfortable.
 */
public final class ShoulderCamera {
	private static float yaw, pitch;
	private static boolean initialised;
	private static boolean wasActive;
	private static Vec3 pivot;
	private static Vec3 pivotVel = Vec3.ZERO;
	private static float side = 1f, sideTarget = 1f;
	private static float distance = 2.8f;
	private static float sprintBlend;
	private static float lockBlend;
	private static float trauma;
	private static long lastNanos = -1;
	private static float shakeTime;
	private static float aimBlend;
	private static Vec3 lastCameraPos = Vec3.ZERO;
	private static Vec3 lastLook = new Vec3(0, 0, 1);

	private ShoulderCamera() {
	}

	public static boolean active() {
		Minecraft mc = Minecraft.getInstance();
		return ClientConfig.get().shoulderCamera && mc.player != null && mc.options.getCameraType() == CameraType.THIRD_PERSON_BACK
			&& mc.getCameraEntity() == mc.player;
	}

	public static boolean decoupled() {
		return active() && ClientConfig.get().decoupledCamera;
	}

	/** True while the character should face the crosshair (using items, mining, aiming). */
	public static boolean aiming() {
		Minecraft mc = Minecraft.getInstance();
		if (mc.player == null) return false;
		return mc.player.isUsingItem() || mc.options.keyUse.isDown() || (mc.options.keyAttack.isDown()
			&& mc.hitResult != null && mc.hitResult.getType() == HitResult.Type.BLOCK && !dev.visceral.client.input.CombatInput.attacking());
	}

	public static float viewYaw() {
		Minecraft mc = Minecraft.getInstance();
		return decoupled() && initialised ? yaw : (mc.player != null ? mc.player.getYRot() : 0);
	}

	public static float viewPitch() {
		Minecraft mc = Minecraft.getInstance();
		return decoupled() && initialised ? pitch : (mc.player != null ? mc.player.getXRot() : 0);
	}

	/** Mouse look while decoupled. Mirrors {@code Entity.turn}. */
	public static void turn(double dx, double dy) {
		float sens = ClientConfig.get().cameraSensitivity;
		if (LockOn.active()) {
			LockOn.onMouseTurn(dx);
			dx *= 0.15;
			dy *= 0.3;
		}
		yaw += (float) dx * 0.15f * sens;
		pitch = Mth.clamp(pitch + (float) dy * 0.15f * sens, -80f, 80f);
	}

	/** Fixed observer camera for scripted shots: offset in the player's frame (right, up, forward). */
	private static Vec3 devOffset;
	private static float devTargetHeight = 1.0f;

	private static Vec3 devAbsPos, devAbsTarget;

	public static void setObserver(@Nullable Vec3 offsetRightUpForward, float targetHeight) {
		devOffset = offsetRightUpForward;
		devTargetHeight = targetHeight;
		devAbsPos = null;
	}

	public static void setObserverAbsolute(Vec3 pos, Vec3 target) {
		devAbsPos = pos;
		devAbsTarget = target;
		devOffset = null;
	}

	/** Points the free camera (scripted shots, external integrations). */
	public static void setView(float newYaw, float newPitch) {
		yaw = newYaw;
		pitch = Mth.clamp(newPitch, -80f, 80f);
		initialised = true;
	}

	public static void swapShoulder() {
		sideTarget = -sideTarget;
	}

	public static void addTrauma(float amount) {
		trauma = Math.min(1f, trauma + amount * ClientConfig.get().cameraShake);
	}

	public static void onImpact(LivingEntity victim, Payloads.Impact p) {
		Minecraft mc = Minecraft.getInstance();
		if (mc.player == null) return;
		if (victim == mc.player) addTrauma(0.25f + Math.min(0.5f, p.force() * 0.12f));
		else if (victim.distanceToSqr(mc.player) < 36 && p.has(Payloads.Impact.FLAG_HEAVY)) addTrauma(0.1f);
	}

	public static void onAttackStart(AttackDef def) {
		if (def.isFinisher()) addTrauma(0.05f);
	}

	/** Per-client-tick housekeeping: keep the camera state in sync with perspective changes. */
	public static void tick() {
		Minecraft mc = Minecraft.getInstance();
		LocalPlayer player = mc.player;
		boolean act = decoupled();
		if (player == null) {
			initialised = false;
			return;
		}
		if (act && !wasActive) {
			yaw = player.getYRot();
			pitch = player.getXRot();
			initialised = true;
		} else if (!act && wasActive && ClientConfig.get().decoupledCamera && initialised) {
			// Leaving third person: look where the camera was looking.
			player.setYRot(yaw);
			player.setXRot(pitch);
		}
		wasActive = act;
		if (act && aiming()) {
			// Face whatever is under the crosshair so placement, bows and mining go where you aim.
			aimAt(player);
		}
	}

	private static void aimAt(LocalPlayer player) {
		Vec3 target = lastCameraPos.add(lastLook.scale(48));
		HitResult hit = player.level().clip(new ClipContext(lastCameraPos, target, ClipContext.Block.OUTLINE, ClipContext.Fluid.NONE, player));
		Vec3 point = hit.getType() == HitResult.Type.MISS ? target : hit.getLocation();
		if (ClientConfig.get().aimConvergence) {
			Vec3 to = point.subtract(player.getEyePosition());
			float y = (float) (Mth.atan2(to.z, to.x) * Mth.RAD_TO_DEG) - 90f;
			float p = (float) -(Mth.atan2(to.y, to.horizontalDistance()) * Mth.RAD_TO_DEG);
			player.setYRot(y);
			player.setXRot(Mth.clamp(p, -90f, 90f));
		} else {
			player.setYRot(yaw);
			player.setXRot(pitch);
		}
	}

	/** Positions the camera; called at the end of {@code Camera.setup}. */
	public static void update(CameraControl cam, Entity entity, float partialTick) {
		ClientConfig cfg = ClientConfig.get();
		Minecraft mc = Minecraft.getInstance();
		long now = System.nanoTime();
		float dt = lastNanos < 0 ? 0.016f : Math.min(0.1f, (now - lastNanos) / 1e9f);
		lastNanos = now;
		if (!(entity instanceof LocalPlayer player)) return;
		if (!initialised) {
			yaw = player.getYRot();
			pitch = player.getXRot();
			initialised = true;
		}
		if (devAbsPos != null) {
			Vec3 to = devAbsTarget.subtract(devAbsPos);
			float y = (float) (Mth.atan2(to.z, to.x) * Mth.RAD_TO_DEG) - 90f;
			float p = (float) -(Mth.atan2(to.y, to.horizontalDistance()) * Mth.RAD_TO_DEG);
			cam.visceral$setRotation(y, p);
			cam.visceral$setPosition(devAbsPos);
			lastCameraPos = devAbsPos;
			lastLook = Vec3.directionFromRotation(p, y);
			return;
		}
		if (devOffset != null) {
			float py = player.getViewYRot(partialTick) * Mth.DEG_TO_RAD;
			Vec3 f = new Vec3(-Mth.sin(py), 0, Mth.cos(py));
			Vec3 r = new Vec3(-f.z, 0, f.x);
			Vec3 base = player.getPosition(partialTick);
			Vec3 at = base.add(0, devTargetHeight, 0);
			Vec3 pos = base.add(r.scale(devOffset.x)).add(0, devOffset.y, 0).add(f.scale(devOffset.z));
			Vec3 to = at.subtract(pos);
			float y = (float) (Mth.atan2(to.z, to.x) * Mth.RAD_TO_DEG) - 90f;
			float p = (float) -(Mth.atan2(to.y, to.horizontalDistance()) * Mth.RAD_TO_DEG);
			cam.visceral$setRotation(y, p);
			cam.visceral$setPosition(pos);
			lastCameraPos = pos;
			lastLook = Vec3.directionFromRotation(p, y);
			return;
		}
		boolean dec = cfg.decoupledCamera;
		float camYaw = dec ? yaw : player.getViewYRot(partialTick);
		float camPitch = dec ? pitch : player.getViewXRot(partialTick);

		LivingEntity lock = LockOn.target();
		lockBlend += ((lock != null ? 1f : 0f) - lockBlend) * Math.min(1f, dt * 5f);
		if (lock != null && dec) {
			// Swing the camera behind the player so both stay framed: the player on one side of the
			// screen and the target on the other, never hidden behind the player's head.
			Vec3 to = lock.getBoundingBox().getCenter().subtract(player.getEyePosition(partialTick));
			float bias = (float) Mth.clamp(Math.toDegrees(Math.atan2(0.45, Math.max(1.0, to.horizontalDistance()))), 3.0, 12.0);
			float wantYaw = (float) (Mth.atan2(to.z, to.x) * Mth.RAD_TO_DEG) - 90f - bias * Math.signum(side);
			float wantPitch = (float) -(Mth.atan2(to.y, to.horizontalDistance()) * Mth.RAD_TO_DEG) * 0.6f + 8f;
			float k = Math.min(1f, dt * 6f);
			yaw += Mth.wrapDegrees(wantYaw - yaw) * k;
			pitch += (Mth.clamp(wantPitch, -40f, 50f) - pitch) * k;
			camYaw = yaw;
			camPitch = pitch;
		}

		Vec3 eye = player.getEyePosition(partialTick);
		if (VisceralEntity.state(player).ragdoll()) {
			// Follow the body while down.
			var anim = dev.visceral.client.anim.EntityAnimator.get(player);
			if (anim != null && anim.ragdoll != null) {
				var t = anim.ragdoll.torso();
				eye = new Vec3(t.pos.x, t.pos.y + 0.6, t.pos.z);
			}
		}
		if (pivot == null || pivot.distanceToSqr(eye) > 64) {
			pivot = eye;
			pivotVel = Vec3.ZERO;
		}
		// Critically damped spring towards the eye; stiffer horizontally than vertically.
		float smooth = cfg.cameraSmoothing;
		double wH = Mth.lerp(smooth, 60f, 14f), wV = Mth.lerp(smooth, 40f, 8f);
		pivot = springStep(pivot, eye, dt, wH, wV);

		sprintBlend += ((player.isSprinting() ? 1f : 0f) - sprintBlend) * Math.min(1f, dt * 2.5f);
		aimBlend += ((aiming() ? 1f : 0f) - aimBlend) * Math.min(1f, dt * 8f);
		side += (sideTarget - side) * Math.min(1f, dt * 7f);

		float targetDist = cfg.cameraDistance * Math.max(0.5f, player.getScale()) + cfg.sprintPullback * sprintBlend + 0.6f * lockBlend - 0.7f * aimBlend;
		float shoulder = cfg.shoulderOffset * side * (1f + 0.15f * lockBlend);
		float height = cfg.cameraHeight;

		Vec3 forward = Vec3.directionFromRotation(camPitch, camYaw);
		Vec3 right = new Vec3(-forward.z, 0, forward.x).normalize();
		Vec3 up = right.cross(forward).normalize();
		Vec3 base = pivot.add(up.scale(height));
		// Keep the shoulder offset out of walls beside the player (auto shoulder swap).
		Vec3 shoulderPoint = base.add(right.scale(shoulder));
		double shoulderFree = clearance(player, base, shoulderPoint);
		if (shoulderFree < Math.abs(shoulder) * 0.6 && cfg.autoShoulderSwap) {
			double other = clearance(player, base, base.add(right.scale(-shoulder)));
			if (other > shoulderFree + 0.2) sideTarget = -Math.signum(side);
		}
		shoulderPoint = base.add(right.scale(Math.signum(shoulder) * Math.min(Math.abs(shoulder), Math.max(0, shoulderFree - 0.15))));
		double free = clearance(player, shoulderPoint, shoulderPoint.subtract(forward.scale(targetDist)));
		float allowed = (float) Math.max(0.3, free - 0.15);
		if (allowed < distance) distance = allowed;
		else distance += (Math.min(allowed, targetDist) - distance) * Math.min(1f, dt * 3f);
		Vec3 pos = shoulderPoint.subtract(forward.scale(distance));

		// Trauma shake.
		trauma = Math.max(0, trauma - dt * 1.4f);
		shakeTime += dt;
		float shake = trauma * trauma;
		float sy = 0, sp = 0;
		if (shake > 0) {
			sy = shake * 1.6f * noise(shakeTime * 23f, 1.3f);
			sp = shake * 1.6f * noise(shakeTime * 21f, 7.1f);
			pos = pos.add(up.scale(shake * 0.05f * noise(shakeTime * 19f, 3.7f)));
		}
		cam.visceral$setRotation(camYaw + sy, camPitch + sp);
		cam.visceral$setPosition(pos);
		lastCameraPos = pos;
		lastLook = Vec3.directionFromRotation(camPitch, camYaw);
	}

	private static Vec3 springStep(Vec3 current, Vec3 target, float dt, double wH, double wV) {
		double x = criticallyDamped(current.x, target.x, dt, wH, 0);
		double y = criticallyDamped(current.y, target.y, dt, wV, 1);
		double z = criticallyDamped(current.z, target.z, dt, wH, 2);
		return new Vec3(x, y, z);
	}

	private static final double[] VEL = new double[3];

	private static double criticallyDamped(double x, double target, float dt, double omega, int axis) {
		double v = VEL[axis];
		double f = 1 + 2 * dt * omega;
		double oo = omega * omega;
		double hoo = dt * oo;
		double hhoo = dt * hoo;
		double detInv = 1.0 / (f + hhoo);
		double nx = (f * x + dt * v + hhoo * target) * detInv;
		double nv = (v + hoo * (target - x)) * detInv;
		VEL[axis] = nv;
		return nx;
	}

	private static double clearance(Entity player, Vec3 from, Vec3 to) {
		double best = from.distanceTo(to);
		for (int i = 0; i < 8; i++) {
			double ox = ((i & 1) * 2 - 1) * 0.1, oy = ((i >> 1 & 1) * 2 - 1) * 0.1, oz = ((i >> 2 & 1) * 2 - 1) * 0.1;
			Vec3 a = from.add(ox, oy, oz), b = to.add(ox, oy, oz);
			HitResult hit = player.level().clip(new ClipContext(a, b, ClipContext.Block.VISUAL, ClipContext.Fluid.NONE, player));
			if (hit.getType() != HitResult.Type.MISS) best = Math.min(best, hit.getLocation().distanceTo(a));
		}
		return best;
	}

	private static float noise(float t, float seed) {
		return (Mth.sin(t + seed) * 0.6f + Mth.sin(t * 2.31f + seed * 3f) * 0.4f);
	}

	/**
	 * Crosshair picking from the camera instead of the eyes (what you see under the crosshair is
	 * what you hit), limited to the player's real reach.
	 */
	public static @Nullable HitResult pick(LocalPlayer player, float partialTick) {
		if (!active()) return null;
		double blockReach = player.blockInteractionRange();
		double entityReach = player.entityInteractionRange();
		Vec3 eye = player.getEyePosition(partialTick);
		Vec3 from = lastCameraPos;
		Vec3 dir = lastLook;
		double camToEye = from.distanceTo(eye);
		double maxDist = camToEye + Math.max(blockReach, entityReach) + 1;
		Vec3 to = from.add(dir.scale(maxDist));
		BlockHitResult blockHit = player.level().clip(new ClipContext(from, to, ClipContext.Block.OUTLINE, ClipContext.Fluid.NONE, player));
		double blockDist = blockHit.getType() == HitResult.Type.MISS ? maxDist : blockHit.getLocation().distanceTo(from);
		AABB box = player.getBoundingBox().expandTowards(dir.scale(maxDist)).inflate(maxDist);
		EntityHitResult entityHit = ProjectileUtil.getEntityHitResult(player, from, from.add(dir.scale(blockDist)), box,
			e -> !e.isSpectator() && e.isPickable() && e != player, blockDist * blockDist);
		if (entityHit != null && entityHit.getLocation().distanceTo(eye) <= entityReach + 0.5) return entityHit;
		if (blockHit.getType() != HitResult.Type.MISS && blockHit.getLocation().distanceTo(eye) <= blockReach) return blockHit;
		Vec3 miss = blockHit.getLocation();
		return BlockHitResult.miss(miss, net.minecraft.core.Direction.getApproximateNearest(dir.x, dir.y, dir.z), net.minecraft.core.BlockPos.containing(miss));
	}

	public static Vec3 cameraPos() {
		return lastCameraPos;
	}

	public static Vec3 cameraLook() {
		return lastLook;
	}
}
