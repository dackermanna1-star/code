package com.extremesports.client.render;

import com.extremesports.client.anim.RideFrame;
import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.math.Axis;

/**
 * Applies the transforms that rider and equipment share, so a backflip, a carve or a ramp tilt moves both
 * together. The pose stack must be positioned at {@code originY} blocks above the equipment's origin.
 */
public final class RideTransforms {
	private RideTransforms() {
	}

	public static void applyShared(PoseStack poseStack, RideFrame frame, float originY) {
		poseStack.translate(0.0F, -originY + frame.dropY, 0.0F);
		poseStack.mulPose(Axis.YP.rotationDegrees(-frame.yaw));
		if (frame.flipPitch != 0.0F || frame.flipRoll != 0.0F || frame.flipYaw != 0.0F) {
			poseStack.translate(0.0F, frame.pivotY, 0.0F);
			poseStack.mulPose(Axis.YP.rotationDegrees(-frame.flipYaw));
			poseStack.mulPose(Axis.XP.rotationDegrees(-frame.flipPitch));
			poseStack.mulPose(Axis.ZP.rotationDegrees(frame.flipRoll));
			poseStack.translate(0.0F, -frame.pivotY, 0.0F);
		}
		poseStack.mulPose(Axis.XP.rotationDegrees(-frame.pitch));
		poseStack.mulPose(Axis.ZP.rotationDegrees(frame.roll));
		poseStack.mulPose(Axis.YP.rotationDegrees(frame.yaw));
		poseStack.translate(0.0F, originY, 0.0F);
	}

	/** Rotation about a steering axis tilted back by {@code headAngle} radians through (0, y, z) pixels. */
	public static void steeringAxis(PoseStack poseStack, float pivotY, float pivotZ, float headAngle, float degrees) {
		if (degrees == 0.0F) {
			return;
		}
		poseStack.translate(0.0F, pivotY / 16.0F, pivotZ / 16.0F);
		poseStack.mulPose(Axis.XP.rotation(-headAngle));
		poseStack.mulPose(Axis.YP.rotationDegrees(degrees));
		poseStack.mulPose(Axis.XP.rotation(headAngle));
		poseStack.translate(0.0F, -pivotY / 16.0F, -pivotZ / 16.0F);
	}
}
