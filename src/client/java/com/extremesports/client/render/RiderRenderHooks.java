package com.extremesports.client.render;

import com.extremesports.client.anim.BailAnimations;
import com.extremesports.client.anim.RideAnimator;
import com.extremesports.client.anim.RideFrame;
import com.extremesports.client.anim.Skeleton;
import com.extremesports.entity.SportEquipmentEntity;
import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.math.Axis;
import net.fabricmc.fabric.api.client.rendering.v1.RenderStateDataKey;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.model.player.PlayerModel;
import net.minecraft.client.renderer.entity.state.AvatarRenderState;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.Avatar;
import net.minecraft.world.entity.player.Player;
import org.jspecify.annotations.Nullable;

/**
 * Bridges the ride animation into the vanilla player renderer: body placement in setupRotations and limb poses
 * after the vanilla model animation.
 */
public final class RiderRenderHooks {
	public record RiderData(@Nullable RideFrame frame, float blend, BailAnimations.@Nullable Pose bail) {
	}

	public static final RenderStateDataKey<RiderData> KEY = RenderStateDataKey.create(() -> "extremesports:rider");

	private RiderRenderHooks() {
	}

	public static void extract(Avatar avatar, AvatarRenderState state, float partialTick) {
		if (avatar instanceof Player player && player.getVehicle() instanceof SportEquipmentEntity entity) {
			RideFrame frame = RideAnimator.frame(entity, partialTick);
			state.setData(KEY, new RiderData(frame, frame.blend, null));
			return;
		}
		BailAnimations.Pose bail = BailAnimations.pose(avatar, partialTick);
		state.setData(KEY, bail != null ? new RiderData(null, 1.0F, bail) : null);
	}

	/** Returns true when the vanilla rotation setup should be skipped. */
	public static boolean setupRotations(AvatarRenderState state, PoseStack poseStack, float bodyRot) {
		RiderData data = state.getData(KEY);
		if (data == null) {
			return false;
		}
		if (data.bail() != null) {
			BailAnimations.Pose bail = data.bail();
			poseStack.mulPose(Axis.YP.rotationDegrees(180.0F - bail.yaw()));
			poseStack.translate(0.0F, bail.lift(), 0.0F);
			poseStack.mulPose(Axis.XP.rotationDegrees(bail.pitch()));
			poseStack.mulPose(Axis.ZP.rotationDegrees(bail.roll()));
			return true;
		}
		RideFrame frame = data.frame();
		if (frame == null || state.deathTime > 0.0F) {
			return false;
		}
		RideTransforms.applyShared(poseStack, frame, frame.standHeight);
		float yaw = Mth.rotLerp(data.blend(), bodyRot, frame.riderYaw);
		poseStack.mulPose(Axis.YP.rotationDegrees(180.0F - yaw));
		return true;
	}

	public static void applyPose(PlayerModel model, AvatarRenderState state) {
		RiderData data = state.getData(KEY);
		if (data == null) {
			return;
		}
		if (data.bail() != null) {
			BailAnimations.applyLimbs(model, data.bail());
			return;
		}
		RideFrame frame = data.frame();
		if (frame == null) {
			return;
		}
		float t = Mth.clamp(data.blend(), 0.0F, 1.0F);
		Skeleton sk = frame.skeleton;
		apply(model.head, sk, Skeleton.HEAD, t);
		apply(model.body, sk, Skeleton.BODY, t);
		apply(model.rightArm, sk, Skeleton.RIGHT_ARM, t);
		apply(model.leftArm, sk, Skeleton.LEFT_ARM, t);
		apply(model.rightLeg, sk, Skeleton.RIGHT_LEG, t);
		apply(model.leftLeg, sk, Skeleton.LEFT_LEG, t);
	}

	private static void apply(ModelPart part, Skeleton sk, int index, float t) {
		part.x = Mth.lerp(t, part.x, sk.x[index]);
		part.y = Mth.lerp(t, part.y, sk.y[index]);
		part.z = Mth.lerp(t, part.z, sk.z[index]);
		part.xRot = Mth.rotLerpRad(t, part.xRot, sk.xRot[index]);
		part.yRot = Mth.rotLerpRad(t, part.yRot, sk.yRot[index]);
		part.zRot = Mth.rotLerpRad(t, part.zRot, sk.zRot[index]);
		part.yScale = Mth.lerp(t, part.yScale, sk.yScale[index]);
	}
}
