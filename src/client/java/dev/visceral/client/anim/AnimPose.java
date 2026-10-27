package dev.visceral.client.anim;

import org.joml.Matrix4f;
import org.joml.Quaternionf;
import org.joml.Vector3f;

/**
 * The pose an animator wants for one frame. Bone rotations are local (head/arms relative to the
 * torso, torso/legs relative to the pelvis), offsets are pixels added to the rest pivot in the
 * parent's space. {@link #vanilla} blends each bone towards whatever vanilla animation produced
 * (treated as pelvis-relative), so item-use poses (bows, crossbows, eating) keep working.
 *
 * <p>When {@link #worldWeight} > 0 the bones are instead driven by absolute transforms relative
 * to the entity's render origin (ragdolls, corpses, ragdoll-to-animation blends).
 */
public final class AnimPose {
	public boolean active;
	public final Quaternionf[] local = new Quaternionf[Bone.COUNT];
	public final Vector3f[] offset = new Vector3f[Bone.COUNT];
	public final float[] vanilla = new float[Bone.COUNT];
	/** Use the vanilla rotation as the base of the local rotation (ours is applied on top). */
	public final boolean[] vanillaBase = new boolean[Bone.COUNT];
	public final boolean[] hidden = new boolean[Bone.COUNT];
	/** Extra rotation applied to held items, per arm (right, left), degrees around the arm's long axis. */
	public float rightItemRoll, leftItemRoll, rightItemPitch, leftItemPitch;

	/** Root (pelvis/feet) transform in the body-yaw frame: x right, y up, z forward (blocks); degrees. */
	public float rootX, rootY, rootZ, rootPitch, rootRoll, rootYaw;
	/** Height above the feet (blocks) the root rotation pivots about (0 = feet, hip height for lying/kneeling clips). */
	public float rootPivotY;
	/** Replace vanilla root rotation (body yaw, death flip) entirely with {@link #rootYawAbsolute}. */
	public boolean overrideRootYaw;
	public float rootYawAbsolute;

	public float worldWeight;
	public final Vector3f[] worldPos = new Vector3f[Bone.COUNT];
	public final Quaternionf[] worldRot = new Quaternionf[Bone.COUNT];

	/** Model space (units of blocks before 1/16 part scaling) to entity-origin-relative world, captured at submit. */
	public final Matrix4f modelToEntity = new Matrix4f();
	public boolean hasModelMatrix;
	public boolean suppressVanillaAttack;
	public boolean noRedOverlay;

	public AnimPose() {
		for (int i = 0; i < Bone.COUNT; i++) {
			local[i] = new Quaternionf();
			offset[i] = new Vector3f();
			worldPos[i] = new Vector3f();
			worldRot[i] = new Quaternionf();
		}
	}

	public void reset() {
		active = false;
		for (int i = 0; i < Bone.COUNT; i++) {
			local[i].identity();
			offset[i].zero();
			vanilla[i] = 0;
			vanillaBase[i] = false;
			hidden[i] = false;
		}
		rightItemRoll = leftItemRoll = rightItemPitch = leftItemPitch = 0;
		rootX = rootY = rootZ = rootPitch = rootRoll = rootYaw = 0;
		rootPivotY = 0;
		overrideRootYaw = false;
		worldWeight = 0;
		hasModelMatrix = false;
		suppressVanillaAttack = false;
		noRedOverlay = false;
	}

	public Quaternionf bone(Bone b) {
		return local[b.ordinal()];
	}

	public Vector3f off(Bone b) {
		return offset[b.ordinal()];
	}

	/** Sets a bone rotation from ModelPart-style Euler angles in degrees (ZYX order). */
	public AnimPose rot(Bone b, float xDeg, float yDeg, float zDeg) {
		local[b.ordinal()].rotationZYX(zDeg * DEG, yDeg * DEG, xDeg * DEG);
		return this;
	}

	public static final float DEG = (float) (Math.PI / 180.0);
}
