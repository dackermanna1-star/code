package dev.visceral.client.anim;

import net.minecraft.client.model.HumanoidModel;
import net.minecraft.client.model.geom.ModelPart;
import org.joml.Matrix3f;
import org.joml.Matrix4f;
import org.joml.Quaternionf;
import org.joml.Vector3f;
import org.jspecify.annotations.Nullable;

/**
 * Writes an {@link AnimPose} into a humanoid model after vanilla {@code setupAnim}.
 *
 * <p>Vanilla humanoid parts are siblings, so bending the torso would leave arms and head
 * floating. This composes a real hierarchy instead: the torso rotates about the waist, and the
 * head and arms ride on it; legs hang off the pelvis. Absolute (ragdoll) transforms are
 * converted back into model space through the captured model matrix.
 */
public final class PoseApplier {
	private static final Quaternionf[] VANILLA = new Quaternionf[Bone.COUNT];
	private static final Quaternionf[] FINAL = new Quaternionf[Bone.COUNT];
	private static final Vector3f[] PIVOT = new Vector3f[Bone.COUNT];
	private static final Vector3f TMP = new Vector3f(), TMP2 = new Vector3f(), EULER = new Vector3f();
	private static final Quaternionf QTMP = new Quaternionf();
	private static final Matrix4f INV = new Matrix4f(), M = new Matrix4f();
	private static final Matrix3f M3 = new Matrix3f();

	static {
		for (int i = 0; i < Bone.COUNT; i++) {
			VANILLA[i] = new Quaternionf();
			FINAL[i] = new Quaternionf();
			PIVOT[i] = new Vector3f();
		}
	}

	private PoseApplier() {
	}

	/** Receives the final world transforms (relative to the entity origin) of each bone. */
	public interface Sink {
		void acceptBoneTransforms(Vector3f[] pivots, Quaternionf[] rotations, float modelScale);
	}

	private static final Vector3f[] OUT_POS = new Vector3f[Bone.COUNT];
	private static final Quaternionf[] OUT_ROT = new Quaternionf[Bone.COUNT];

	static {
		for (int i = 0; i < Bone.COUNT; i++) {
			OUT_POS[i] = new Vector3f();
			OUT_ROT[i] = new Quaternionf();
		}
	}

	public static void apply(HumanoidModel<?> model, AnimPose pose, @Nullable Sink sink) {
		Rig rig = Rig.of(model);
		ModelPart[] parts = rig.parts;
		for (int i = 0; i < Bone.COUNT; i++) {
			ModelPart p = parts[i];
			VANILLA[i].rotationZYX(p.zRot, p.yRot, p.xRot);
		}

		int b = Bone.BODY.ordinal();
		// Torso about the waist.
		Quaternionf bodyRot = FINAL[b].set(pose.local[b]).mul(rig.restRot[b]);
		if (pose.vanilla[b] > 0) bodyRot.slerp(VANILLA[b], pose.vanilla[b]);
		Vector3f restBody = rig.restPivot[b];
		Vector3f waist = TMP.set(restBody).add(0, rig.waistY, 0);
		PIVOT[b].set(restBody).sub(waist);
		bodyRot.transform(PIVOT[b]).add(waist).add(pose.offset[b]);

		for (Bone bone : Bone.ALL) {
			int i = bone.ordinal();
			if (i == b) continue;
			Quaternionf fin = FINAL[i];
			if (bone.childOfBody()) {
				Vector3f rel = TMP2.set(rig.restPivot[i]).sub(restBody).add(pose.offset[i]);
				PIVOT[i].set(bodyRot.transform(rel)).add(PIVOT[b]);
				fin.set(bodyRot);
			} else {
				PIVOT[i].set(rig.restPivot[i]).add(pose.offset[i]);
				fin.identity();
			}
			if (pose.vanillaBase[i]) fin.mul(VANILLA[i]).mul(pose.local[i]);
			else fin.mul(pose.local[i]).mul(rig.restRot[i]);
			if (pose.vanilla[i] > 0) fin.slerp(VANILLA[i], pose.vanilla[i]);
		}

		boolean world = pose.worldWeight > 0 && pose.hasModelMatrix;
		float modelScale = pose.hasModelMatrix ? scaleOf(pose.modelToEntity) : 1f;
		if (world) {
			INV.set(pose.modelToEntity).invertAffine();
			float w = Math.min(1f, pose.worldWeight);
			for (int i = 0; i < Bone.COUNT; i++) {
				M.set(INV).translate(pose.worldPos[i]).rotate(pose.worldRot[i]).scale(modelScale);
				M.getTranslation(TMP).mul(16f);
				M.get3x3(M3);
				M3.getNormalizedRotation(QTMP);
				PIVOT[i].lerp(TMP, w);
				FINAL[i].slerp(QTMP, w);
			}
		}

		for (int i = 0; i < Bone.COUNT; i++) {
			ModelPart p = parts[i];
			Vector3f pv = PIVOT[i];
			p.x = pv.x;
			p.y = pv.y;
			p.z = pv.z;
			M3.set(FINAL[i]).getEulerAnglesZYX(EULER);
			p.xRot = EULER.x;
			p.yRot = EULER.y;
			p.zRot = EULER.z;
			if (pose.hidden[i]) {
				p.xScale = p.yScale = p.zScale = 0f;
			}
		}

		if (sink != null && pose.hasModelMatrix) {
			for (int i = 0; i < Bone.COUNT; i++) {
				M.set(pose.modelToEntity).translate(PIVOT[i].x / 16f, PIVOT[i].y / 16f, PIVOT[i].z / 16f).rotate(FINAL[i]);
				M.getTranslation(OUT_POS[i]);
				M.get3x3(M3);
				M3.getNormalizedRotation(OUT_ROT[i]);
			}
			sink.acceptBoneTransforms(OUT_POS, OUT_ROT, modelScale);
		}
	}

	public static float scaleOf(Matrix4f m) {
		return (float) Math.cbrt(Math.abs(m.determinant3x3()));
	}
}
