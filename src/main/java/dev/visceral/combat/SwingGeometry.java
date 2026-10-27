package dev.visceral.combat;

import net.minecraft.util.Mth;
import net.minecraft.world.phys.Vec3;

/**
 * Swing geometry in world space for an attacker's eye position and look angles. Shared by the
 * server hit sweep and the client debug overlay.
 */
public final class SwingGeometry {
	public final Vec3 origin;
	public final Vec3 forward;
	public final Vec3 right;
	public final Vec3 up;
	private final Vec3 sideAxis;
	private final AttackDef def;

	public SwingGeometry(AttackDef def, Vec3 eye, float yawDeg, float pitchDeg) {
		this.def = def;
		float pitch = (pitchDeg * def.pitchFollow + def.pitchOffset) * Mth.DEG_TO_RAD;
		float yaw = yawDeg * Mth.DEG_TO_RAD;
		Vec3 flatFwd = new Vec3(-Mth.sin(yaw), 0, Mth.cos(yaw));
		this.right = new Vec3(-flatFwd.z, 0, flatFwd.x);
		this.forward = new Vec3(flatFwd.x * Mth.cos(pitch), -Mth.sin(pitch), flatFwd.z * Mth.cos(pitch));
		this.up = right.cross(forward).normalize();
		this.origin = eye.add(0, def.heightOffset, 0).add(right.scale(def.sideOffset));
		float tilt = def.tilt * Mth.DEG_TO_RAD;
		this.sideAxis = right.scale(Mth.cos(tilt)).subtract(up.scale(Mth.sin(tilt)));
	}

	/** Blade direction at normalised swing progress {@code t} in [0,1]. */
	public Vec3 direction(float t) {
		if (def.thrust) return forward;
		float a = Mth.lerp(t, def.yawStart, def.yawEnd) * Mth.DEG_TO_RAD;
		return forward.scale(Mth.cos(a)).add(sideAxis.scale(Mth.sin(a)));
	}

	/** Current reach of the blade tip at progress {@code t} (thrusts extend over the window). */
	public float reach(float t, float reachScale) {
		float r = def.reach * reachScale;
		if (!def.thrust) return r;
		float e = 1f - (1f - t) * (1f - t);
		return Mth.lerp(Math.min(1f, 0.35f + e), def.minReach, r);
	}

	/** Direction the blade pushes whatever it hits at progress {@code t}. */
	public Vec3 push(float t) {
		Vec3 flat;
		if (def.thrust) {
			flat = new Vec3(forward.x, 0, forward.z);
		} else {
			float a = Mth.lerp(t, def.yawStart, def.yawEnd) * Mth.DEG_TO_RAD;
			float sign = Math.signum(def.yawEnd - def.yawStart);
			Vec3 tangent = forward.scale(-Mth.sin(a)).add(sideAxis.scale(Mth.cos(a))).scale(sign);
			Vec3 mix = forward.scale(0.6).add(tangent.scale(0.8));
			flat = new Vec3(mix.x, 0, mix.z);
		}
		double l = flat.length();
		return l < 1e-6 ? new Vec3(forward.x, 0, forward.z).normalize() : flat.scale(1 / l);
	}
}
