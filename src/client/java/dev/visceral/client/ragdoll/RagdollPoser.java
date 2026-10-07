package dev.visceral.client.ragdoll;

import dev.visceral.client.model.ModelTree;
import net.minecraft.client.model.Model;
import net.minecraft.client.model.geom.ModelPart;
import org.joml.Matrix3f;
import org.joml.Matrix4f;
import org.joml.Matrix4fc;
import org.joml.Quaternionf;
import org.joml.Vector3f;

/**
 * Writes simulated bone transforms back into a posed model. Works on any model that shares part
 * paths with the one the ragdoll was built from, independent of where the model root currently is.
 */
public final class RagdollPoser {
	private RagdollPoser() {
	}

	/**
	 * @param model     model right after {@code setupAnim}
	 * @param modelPose model space to camera-relative transform the model is about to be drawn with
	 */
	public static void apply(Model<?> model, Matrix4fc modelPose, RagdollFrame frame) {
		if (frame == null || frame.isEmpty()) {
			return;
		}
		ModelTree tree = ModelTree.of(model.root());
		Matrix4f inversePose = new Matrix4f(modelPose).invert();
		Matrix4f[] current = new Matrix4f[tree.size()];
		Matrix4f parentInverse = new Matrix4f();
		Matrix3f rotationScale = new Matrix3f();
		Quaternionf rotation = new Quaternionf();
		Vector3f translation = new Vector3f();
		Vector3f euler = new Vector3f();
		for (ModelTree.Node node : tree.nodes) {
			Matrix4f parentMatrix = node.parent() < 0 ? new Matrix4f() : current[node.parent()];
			ModelPart part = node.part();
			Matrix4f target = frame.target(node.path());
			if (target != null) {
				Matrix4f desired = new Matrix4f(inversePose).mul(target);
				Matrix4f local = parentMatrix.invert(parentInverse).mul(desired);
				local.getTranslation(translation);
				local.get3x3(rotationScale);
				float sx = part.xScale == 0.0F ? 1.0F : part.xScale;
				float sy = part.yScale == 0.0F ? 1.0F : part.yScale;
				float sz = part.zScale == 0.0F ? 1.0F : part.zScale;
				rotationScale.scale(1.0F / sx, 1.0F / sy, 1.0F / sz);
				rotation.setFromUnnormalized(rotationScale);
				new Matrix3f().rotation(rotation).getEulerAnglesZYX(euler);
				if (Float.isFinite(translation.x + translation.y + translation.z + euler.x + euler.y + euler.z)) {
					part.x = translation.x * 16.0F;
					part.y = translation.y * 16.0F;
					part.z = translation.z * 16.0F;
					part.xRot = euler.x;
					part.yRot = euler.y;
					part.zRot = euler.z;
				}
			}
			Matrix4f matrix = new Matrix4f(parentMatrix);
			ModelTree.applyLocal(matrix, part);
			current[node.index()] = matrix;
		}
	}
}
