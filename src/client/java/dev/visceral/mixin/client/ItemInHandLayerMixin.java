package dev.visceral.mixin.client;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.math.Axis;
import dev.visceral.client.anim.AnimPose;
import dev.visceral.client.render.RenderHooks;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.entity.layers.ItemInHandLayer;
import net.minecraft.client.renderer.entity.state.ArmedEntityRenderState;
import net.minecraft.client.renderer.item.ItemStackRenderState;
import net.minecraft.world.entity.HumanoidArm;
import net.minecraft.world.item.ItemStack;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Lets animation clips orient held weapons (wrist roll/flex) about the grip. */
@Mixin(ItemInHandLayer.class)
public abstract class ItemInHandLayerMixin {
	@Inject(method = "submitArmWithItem", at = @At(value = "INVOKE", target = "Lcom/mojang/blaze3d/vertex/PoseStack;translate(FFF)V", shift = At.Shift.AFTER))
	private void visceral$itemPose(ArmedEntityRenderState state, ItemStackRenderState itemState, ItemStack stack, HumanoidArm arm, PoseStack poseStack,
		SubmitNodeCollector collector, int light, CallbackInfo ci) {
		AnimPose pose = state.getData(RenderHooks.POSE);
		if (pose == null || !pose.active) return;
		boolean right = arm == HumanoidArm.RIGHT;
		float roll = right ? pose.rightItemRoll : pose.leftItemRoll;
		float pitch = right ? pose.rightItemPitch : pose.leftItemPitch;
		if (roll != 0) poseStack.mulPose(Axis.ZP.rotationDegrees(roll));
		if (pitch != 0) poseStack.mulPose(Axis.XP.rotationDegrees(pitch));
	}
}
