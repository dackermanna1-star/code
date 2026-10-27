package dev.visceral.client.input;

import dev.visceral.client.camera.ShoulderCamera;
import dev.visceral.client.config.ClientConfig;
import dev.visceral.combat.PlayerCombat;
import net.minecraft.client.Minecraft;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.network.chat.Component;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.monster.Enemy;
import net.minecraft.world.level.ClipContext;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;
import org.jspecify.annotations.Nullable;

/** Target lock: keeps the camera and character oriented towards one enemy. */
public final class LockOn {
	private static @Nullable LivingEntity target;
	private static int lostTicks;
	private static double flickAccum;
	private static int flickCooldown;

	private LockOn() {
	}

	public static @Nullable LivingEntity target() {
		return target;
	}

	public static boolean active() {
		return target != null;
	}

	public static void toggle() {
		if (target != null) {
			target = null;
			return;
		}
		target = acquire(null, 0);
		lostTicks = 0;
	}

	public static void clear() {
		target = null;
	}

	public static void tick() {
		Minecraft mc = Minecraft.getInstance();
		LocalPlayer player = mc.player;
		if (target == null || player == null) return;
		if (flickCooldown > 0) flickCooldown--;
		double range = ClientConfig.get().lockOnRange + 4;
		if (!target.isAlive() || target.isRemoved() || target.level() != player.level() || target.distanceToSqr(player) > range * range) {
			target = null;
			return;
		}
		if (!canSee(player, target)) {
			if (++lostTicks > 50) {
				target = null;
				player.displayClientMessage(Component.translatable("visceral.lockon.lost"), true);
			}
		} else {
			lostTicks = 0;
		}
	}

	/** Horizontal mouse flick while locked switches to the next target on that side. */
	public static boolean onMouseTurn(double dx) {
		if (target == null) return false;
		flickAccum = flickAccum * 0.8 + dx;
		if (Math.abs(flickAccum) > 260 && flickCooldown <= 0) {
			LivingEntity next = acquire(target, (int) Math.signum(flickAccum));
			if (next != null) target = next;
			flickAccum = 0;
			flickCooldown = 8;
		}
		return true;
	}

	private static @Nullable LivingEntity acquire(@Nullable LivingEntity exclude, int side) {
		Minecraft mc = Minecraft.getInstance();
		LocalPlayer player = mc.player;
		if (player == null || mc.level == null) return null;
		double range = ClientConfig.get().lockOnRange;
		Vec3 eye = player.getEyePosition();
		float yaw = ShoulderCamera.viewYaw(), pitch = ShoulderCamera.viewPitch();
		Vec3 look = Vec3.directionFromRotation(pitch, yaw);
		LivingEntity best = null;
		double bestScore = Double.MAX_VALUE;
		for (Entity e : mc.level.getEntities(player, player.getBoundingBox().inflate(range))) {
			if (!(e instanceof LivingEntity le) || le == exclude || !PlayerCombat.isValidTarget(player, le)) continue;
			Vec3 to = le.getBoundingBox().getCenter().subtract(eye);
			double dist = to.length();
			if (dist > range || dist < 0.5) continue;
			Vec3 dir = to.scale(1 / dist);
			double angle = Math.acos(Mth.clamp(dir.dot(look), -1, 1));
			if (side != 0) {
				// Only targets on the requested side of the current one.
				Vec3 right = new Vec3(-look.z, 0, look.x).normalize();
				Vec3 cur = exclude.getBoundingBox().getCenter().subtract(eye).normalize();
				double rel = dir.dot(right) - cur.dot(right);
				if (Math.signum(rel) != side) continue;
				angle = Math.abs(rel);
			} else if (angle > Math.toRadians(50)) {
				continue;
			}
			if (!canSee(player, le)) continue;
			double score = angle * 6 + dist * 0.08 + (le instanceof Enemy ? 0 : 1.5);
			if (score < bestScore) {
				bestScore = score;
				best = le;
			}
		}
		return best;
	}

	static boolean canSee(LocalPlayer player, LivingEntity e) {
		Vec3 eye = player.getEyePosition();
		Vec3 c = e.getBoundingBox().getCenter();
		return player.level().clip(new ClipContext(eye, c, ClipContext.Block.VISUAL, ClipContext.Fluid.NONE, player)).getType() == HitResult.Type.MISS;
	}
}
