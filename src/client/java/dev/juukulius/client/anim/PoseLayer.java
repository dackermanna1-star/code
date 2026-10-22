package dev.juukulius.client.anim;

import java.util.Arrays;

/**
 * One blend layer of a pose. For each model bone: an optional target (rotation in radians, position offset in pixels from
 * the part's rest position) blended over the incoming pose by {@code weight}, plus additive rotation/position offsets.
 */
public final class PoseLayer {
	public final boolean[] hasTarget = new boolean[Bone.COUNT];
	public final boolean[] hasTargetPos = new boolean[Bone.COUNT];
	public final float[] weight = new float[Bone.COUNT];
	public final float[][] targetRot = new float[Bone.COUNT][3];
	public final float[][] targetPos = new float[Bone.COUNT][3];
	public final float[][] addRot = new float[Bone.COUNT][3];
	public final float[][] addPos = new float[Bone.COUNT][3];
	public boolean active;

	public void clear() {
		this.active = false;
		Arrays.fill(this.hasTarget, false);
		Arrays.fill(this.hasTargetPos, false);
		Arrays.fill(this.weight, 0.0F);
		for (int i = 0; i < Bone.COUNT; i++) {
			Arrays.fill(this.targetRot[i], 0.0F);
			Arrays.fill(this.targetPos[i], 0.0F);
			Arrays.fill(this.addRot[i], 0.0F);
			Arrays.fill(this.addPos[i], 0.0F);
		}
	}

	public void target(Bone bone, float weight, float xRot, float yRot, float zRot) {
		int i = bone.ordinal();
		this.active = true;
		this.hasTarget[i] = true;
		this.weight[i] = weight;
		this.targetRot[i][0] = xRot;
		this.targetRot[i][1] = yRot;
		this.targetRot[i][2] = zRot;
	}

	public void targetPos(Bone bone, float x, float y, float z) {
		int i = bone.ordinal();
		this.hasTargetPos[i] = true;
		this.targetPos[i][0] = x;
		this.targetPos[i][1] = y;
		this.targetPos[i][2] = z;
	}

	public void add(Bone bone, float xRot, float yRot, float zRot) {
		int i = bone.ordinal();
		this.active = true;
		this.addRot[i][0] += xRot;
		this.addRot[i][1] += yRot;
		this.addRot[i][2] += zRot;
	}

	/** Mirrors this layer across the body's centre plane: right and left limbs swap, yaw and roll change sign. */
	public void mirror() {
		swap(Bone.RIGHT_ARM, Bone.LEFT_ARM);
		swap(Bone.RIGHT_LEG, Bone.LEFT_LEG);
		for (int i = 0; i < Bone.COUNT; i++) {
			mirrorRotation(this.targetRot[i]);
			mirrorRotation(this.addRot[i]);
			this.targetPos[i][0] = -this.targetPos[i][0];
			this.addPos[i][0] = -this.addPos[i][0];
		}
	}

	private static void mirrorRotation(float[] rotation) {
		rotation[1] = -rotation[1];
		rotation[2] = -rotation[2];
	}

	private void swap(Bone first, Bone second) {
		int a = first.ordinal();
		int b = second.ordinal();
		boolean target = this.hasTarget[a];
		this.hasTarget[a] = this.hasTarget[b];
		this.hasTarget[b] = target;
		boolean targetPos = this.hasTargetPos[a];
		this.hasTargetPos[a] = this.hasTargetPos[b];
		this.hasTargetPos[b] = targetPos;
		float weight = this.weight[a];
		this.weight[a] = this.weight[b];
		this.weight[b] = weight;
		swapRows(this.targetRot, a, b);
		swapRows(this.targetPos, a, b);
		swapRows(this.addRot, a, b);
		swapRows(this.addPos, a, b);
	}

	private static void swapRows(float[][] rows, int a, int b) {
		float[] row = rows[a];
		rows[a] = rows[b];
		rows[b] = row;
	}

	public void addPos(Bone bone, float x, float y, float z) {
		int i = bone.ordinal();
		this.active = true;
		this.addPos[i][0] += x;
		this.addPos[i][1] += y;
		this.addPos[i][2] += z;
	}
}
