package com.extremesports.client.anim;

import net.minecraft.util.Mth;
import org.joml.Matrix3f;

/**
 * Tiny pose solver for the humanoid player model. Coordinates are model space in pixels: +x is the rider's left,
 * -z is forward, +y is down; the feet rest at y = 24. Limbs are aimed at targets (simple one-bone IK) and squashed
 * slightly when a target is closer than the limb length, which reads as a bent knee or elbow.
 */
public final class Skeleton {
	public static final int HEAD = 0;
	public static final int BODY = 1;
	public static final int RIGHT_ARM = 2;
	public static final int LEFT_ARM = 3;
	public static final int RIGHT_LEG = 4;
	public static final int LEFT_LEG = 5;
	public static final int PARTS = 6;
	public static final float ARM_LENGTH = 9.5F;
	public static final float LEG_LENGTH = 12.0F;

	public final float[] x = new float[PARTS];
	public final float[] y = new float[PARTS];
	public final float[] z = new float[PARTS];
	public final float[] xRot = new float[PARTS];
	public final float[] yRot = new float[PARTS];
	public final float[] zRot = new float[PARTS];
	public final float[] yScale = new float[PARTS];

	// Torso frame used to place shoulders
	private float neckX;
	private float neckY;
	private float neckZ;
	private float lean;
	private float twist;
	private float side;

	public Skeleton() {
		reset();
	}

	public void reset() {
		for (int i = 0; i < PARTS; i++) {
			x[i] = 0.0F;
			y[i] = 0.0F;
			z[i] = 0.0F;
			xRot[i] = 0.0F;
			yRot[i] = 0.0F;
			zRot[i] = 0.0F;
			yScale[i] = 1.0F;
		}
		torso(0.0F, 12.0F, 0.0F, 0.0F, 0.0F, 0.0F);
	}

	/** Rotates (vx,vy,vz) by ModelPart's ZYX convention. */
	static float[] rotate(float vx, float vy, float vz, float rx, float ry, float rz) {
		float cx = Mth.cos(rx);
		float sx = Mth.sin(rx);
		float y1 = vy * cx - vz * sx;
		float z1 = vy * sx + vz * cx;
		float cy = Mth.cos(ry);
		float sy = Mth.sin(ry);
		float x2 = vx * cy + z1 * sy;
		float z2 = -vx * sy + z1 * cy;
		float cz = Mth.cos(rz);
		float sz = Mth.sin(rz);
		float x3 = x2 * cz - y1 * sz;
		float y3 = x2 * sz + y1 * cz;
		return new float[]{x3, y3, z2};
	}

	/**
	 * Places the torso from the hip centre. lean > 0 bends forward, twist turns the shoulders (positive toward
	 * the rider's left), side tilts sideways.
	 */
	public void torso(float hipX, float hipY, float hipZ, float lean, float twist, float side) {
		this.lean = lean;
		this.twist = twist;
		this.side = side;
		// Body box hangs from the neck: hip = neck + R * (0, 12, 0)
		float[] down = rotate(0.0F, 12.0F, 0.0F, lean, twist, side);
		neckX = hipX - down[0];
		neckY = hipY - down[1];
		neckZ = hipZ - down[2];
		set(BODY, neckX, neckY, neckZ, lean, twist, side);
		set(HEAD, neckX, neckY, neckZ, 0.0F, twist, 0.0F);
		float[] right = rotate(-5.0F, 2.0F, 0.0F, lean, twist, side);
		float[] left = rotate(5.0F, 2.0F, 0.0F, lean, twist, side);
		set(RIGHT_ARM, neckX + right[0], neckY + right[1], neckZ + right[2], 0.0F, 0.0F, 0.0F);
		set(LEFT_ARM, neckX + left[0], neckY + left[1], neckZ + left[2], 0.0F, 0.0F, 0.0F);
		float hipTwist = twist * 0.35F;
		float cos = Mth.cos(hipTwist);
		float sin = Mth.sin(hipTwist);
		set(RIGHT_LEG, hipX - 1.9F * cos, hipY, hipZ + 1.9F * sin, 0.0F, 0.0F, 0.0F);
		set(LEFT_LEG, hipX + 1.9F * cos, hipY, hipZ - 1.9F * sin, 0.0F, 0.0F, 0.0F);
	}

	private void set(int part, float px, float py, float pz, float rx, float ry, float rz) {
		x[part] = px;
		y[part] = py;
		z[part] = pz;
		xRot[part] = rx;
		yRot[part] = ry;
		zRot[part] = rz;
		yScale[part] = 1.0F;
	}

	/** Head orientation in model space (radians): yaw relative to forward, pitch positive looks down. */
	public void look(float yaw, float pitch) {
		yRot[HEAD] = yaw;
		xRot[HEAD] = pitch;
	}

	/**
	 * Aims a limb (whose rest direction is +y) at a target point. Sets yScale when the target is closer
	 * than the limb so it looks bent; footYaw rotates the foot/hand around the limb axis.
	 */
	public void aim(int part, float tx, float ty, float tz, float length, float footYaw) {
		float dx = tx - x[part];
		float dy = ty - y[part];
		float dz = tz - z[part];
		float distance = Mth.sqrt(dx * dx + dy * dy + dz * dz);
		if (distance < 1.0E-3F) {
			return;
		}
		float aimX = (float) Math.asin(Mth.clamp(dz / distance, -1.0F, 1.0F));
		float aimZ = (float) Mth.atan2(-dx, dy);
		if (Math.abs(footYaw) < 1.0E-4F) {
			xRot[part] = aimX;
			yRot[part] = 0.0F;
			zRot[part] = aimZ;
		} else {
			// Twist around the limb's own axis: M = Rz * Rx * Ry(twist), re-expressed in ModelPart's ZYX order
			Matrix3f m = new Matrix3f().rotationZ(aimZ).rotateX(aimX).rotateY(footYaw);
			xRot[part] = (float) Mth.atan2(m.m12, m.m22);
			yRot[part] = (float) Math.asin(Mth.clamp(-m.m02, -1.0F, 1.0F));
			zRot[part] = (float) Mth.atan2(m.m01, m.m00);
		}
		yScale[part] = Mth.clamp(distance / length, 0.72F, 1.0F);
	}

	/** Aims an arm with the default arm length. */
	public void reach(int arm, float tx, float ty, float tz) {
		aim(arm, tx, ty, tz, ARM_LENGTH, 0.0F);
	}

	/** Aims a leg at a foot position with the default leg length. */
	public void step(int leg, float tx, float ty, float tz, float footYaw) {
		aim(leg, tx, ty, tz, LEG_LENGTH, footYaw);
	}

	/** Blends every channel toward another skeleton. */
	public void blendTo(Skeleton other, float t) {
		for (int i = 0; i < PARTS; i++) {
			x[i] = Mth.lerp(t, x[i], other.x[i]);
			y[i] = Mth.lerp(t, y[i], other.y[i]);
			z[i] = Mth.lerp(t, z[i], other.z[i]);
			xRot[i] = Mth.rotLerpRad(t, xRot[i], other.xRot[i]);
			yRot[i] = Mth.rotLerpRad(t, yRot[i], other.yRot[i]);
			zRot[i] = Mth.rotLerpRad(t, zRot[i], other.zRot[i]);
			yScale[i] = Mth.lerp(t, yScale[i], other.yScale[i]);
		}
	}

	public float neckX() {
		return neckX;
	}

	public float neckY() {
		return neckY;
	}

	public float neckZ() {
		return neckZ;
	}

	public float lean() {
		return lean;
	}

	public float twist() {
		return twist;
	}

	public float side() {
		return side;
	}
}
