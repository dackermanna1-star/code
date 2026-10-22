package dev.juukulius.client.anim;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.math.Axis;
import net.minecraft.client.model.HumanoidModel;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.model.geom.PartPose;
import net.minecraft.util.Mth;
import org.joml.Matrix3f;
import org.joml.Vector3f;

/**
 * The complete animation result for one player for one frame: blend layers for the humanoid bones and summed offsets
 * for the root, the held item and the first-person hands. Computed once per frame during render-state extraction and
 * applied to every humanoid model rendered for that player (body, outfit, armor).
 */
public final class PoseSnapshot {
	public static final int LOCOMOTION = 0;
	public static final int ACTION_OLD = 1;
	public static final int ACTION_NEW = 2;
	public static final int REACTION = 3;

	public final PoseLayer[] layers = {new PoseLayer(), new PoseLayer(), new PoseLayer(), new PoseLayer()};
	/**
	 * Root rotation (degrees: x leans forward, y turns right, z leans left) around the feet and translation (pixels: x
	 * right, y up, z forward). Signs follow the body bone, so whole-body and torso motion compose naturally.
	 */
	public final float[] rootRot = new float[3];
	public final float[] rootPos = new float[3];
	/** Held item rotation (degrees) and translation (pixels) relative to the hand. */
	public final float[] itemRot = new float[3];
	public final float[] itemPos = new float[3];
	/** First-person main hand / casting hand offsets (degrees, pixels). */
	public final float[] fpMainRot = new float[3];
	public final float[] fpMainPos = new float[3];
	public final float[] fpOffRot = new float[3];
	public final float[] fpOffPos = new float[3];
	public float fpOffWeight;
	/** Whether this snapshot carries any data worth applying. */
	public boolean active;

	public void clear() {
		for (PoseLayer layer : this.layers) {
			layer.clear();
		}

		java.util.Arrays.fill(this.rootRot, 0.0F);
		java.util.Arrays.fill(this.rootPos, 0.0F);
		java.util.Arrays.fill(this.itemRot, 0.0F);
		java.util.Arrays.fill(this.itemPos, 0.0F);
		java.util.Arrays.fill(this.fpMainRot, 0.0F);
		java.util.Arrays.fill(this.fpMainPos, 0.0F);
		java.util.Arrays.fill(this.fpOffRot, 0.0F);
		java.util.Arrays.fill(this.fpOffPos, 0.0F);
		this.fpOffWeight = 0.0F;
		this.active = false;
	}

	/** Applies the bone layers on top of the vanilla pose already set up on {@code model}. */
	public void apply(HumanoidModel<?> model) {
		if (!this.active) {
			return;
		}

		ModelPart[] parts = {model.head, model.body, model.rightArm, model.leftArm, model.rightLeg, model.leftLeg};
		float bodyX = model.body.xRot;
		float bodyY = model.body.yRot;
		float bodyZ = model.body.zRot;
		for (int b = 0; b < parts.length; b++) {
			ModelPart part = parts[b];
			for (PoseLayer layer : this.layers) {
				if (!layer.active) {
					continue;
				}

				float weight = layer.weight[b];
				if (layer.hasTarget[b] && weight > 0.0F) {
					part.xRot = Mth.lerp(weight, part.xRot, layer.targetRot[b][0]);
					part.yRot = Mth.lerp(weight, part.yRot, layer.targetRot[b][1]);
					part.zRot = Mth.lerp(weight, part.zRot, layer.targetRot[b][2]);
					if (layer.hasTargetPos[b]) {
						PartPose rest = part.getInitialPose();
						part.x = Mth.lerp(weight, part.x, rest.x() + layer.targetPos[b][0]);
						part.y = Mth.lerp(weight, part.y, rest.y() + layer.targetPos[b][1]);
						part.z = Mth.lerp(weight, part.z, rest.z() + layer.targetPos[b][2]);
					}
				}

				float[] addRot = layer.addRot[b];
				part.xRot += addRot[0];
				part.yRot += addRot[1];
				part.zRot += addRot[2];
				float[] addPos = layer.addPos[b];
				part.x += addPos[0];
				part.y += addPos[1];
				part.z += addPos[2];
			}
		}

		carryArms(model, bodyX, bodyY, bodyZ);
	}

	/**
	 * Humanoid arms are not children of the torso, so a twisted or leaning torso would leave the shoulders behind. The
	 * arms follow the torso rotation the animation added on top of the vanilla pose, as if they were its children (arm
	 * rotations in clips are therefore relative to the chest).
	 */
	private static void carryArms(HumanoidModel<?> model, float vanillaX, float vanillaY, float vanillaZ) {
		ModelPart body = model.body;
		if (body.xRot == vanillaX && body.yRot == vanillaY && body.zRot == vanillaZ) {
			return;
		}

		Matrix3f delta = new Matrix3f().rotationZYX(body.zRot, body.yRot, body.xRot)
			.mul(new Matrix3f().rotationZYX(vanillaZ, vanillaY, vanillaX).transpose());
		Vector3f offset = new Vector3f();
		Matrix3f rotation = new Matrix3f();
		for (ModelPart arm : new ModelPart[]{model.rightArm, model.leftArm}) {
			delta.transform(offset.set(arm.x - body.x, arm.y - body.y, arm.z - body.z));
			arm.x = body.x + offset.x;
			arm.y = body.y + offset.y;
			arm.z = body.z + offset.z;
			// Decompose delta * Rz * Ry * Rx back into the part's Z-Y-X Euler angles.
			new Matrix3f(delta).mul(rotation.rotationZYX(arm.zRot, arm.yRot, arm.xRot), rotation);
			arm.yRot = (float) Math.asin(Mth.clamp(-rotation.m02(), -1.0F, 1.0F));
			arm.xRot = (float) Mth.atan2(rotation.m12(), rotation.m22());
			arm.zRot = (float) Mth.atan2(rotation.m01(), rotation.m00());
		}
	}

	/**
	 * Mirrors the whole pose left to right, for left-handed players: clips and the stance are authored for a sword in
	 * the right hand. First-person offsets are mirrored where they are applied.
	 */
	public void mirror() {
		for (PoseLayer layer : this.layers) {
			layer.mirror();
		}

		this.rootRot[1] = -this.rootRot[1];
		this.rootRot[2] = -this.rootRot[2];
		this.rootPos[0] = -this.rootPos[0];
		this.itemRot[1] = -this.itemRot[1];
		this.itemRot[2] = -this.itemRot[2];
		this.itemPos[0] = -this.itemPos[0];
	}

	/** Applies the root motion. Called in the renderer's rotation setup, where +Y is up and the body faces -Z. */
	public void applyRoot(PoseStack poseStack) {
		if (!this.active) {
			return;
		}

		poseStack.translate(this.rootPos[0] / 16.0F, this.rootPos[1] / 16.0F, -this.rootPos[2] / 16.0F);
		if (this.rootRot[1] != 0.0F) {
			poseStack.mulPose(Axis.YP.rotationDegrees(-this.rootRot[1]));
		}

		if (this.rootRot[0] != 0.0F) {
			poseStack.mulPose(Axis.XP.rotationDegrees(-this.rootRot[0]));
		}

		if (this.rootRot[2] != 0.0F) {
			poseStack.mulPose(Axis.ZP.rotationDegrees(this.rootRot[2]));
		}
	}

	public void applyItem(PoseStack poseStack) {
		if (!this.active) {
			return;
		}

		poseStack.translate(this.itemPos[0] / 16.0F, this.itemPos[1] / 16.0F, this.itemPos[2] / 16.0F);
		if (this.itemRot[0] != 0.0F || this.itemRot[1] != 0.0F || this.itemRot[2] != 0.0F) {
			poseStack.mulPose(new org.joml.Quaternionf().rotationXYZ(
				this.itemRot[0] * Mth.DEG_TO_RAD, this.itemRot[1] * Mth.DEG_TO_RAD, this.itemRot[2] * Mth.DEG_TO_RAD));
		}
	}
}
