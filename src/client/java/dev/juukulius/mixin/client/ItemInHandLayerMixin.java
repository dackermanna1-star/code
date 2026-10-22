package dev.juukulius.mixin.client;

import com.mojang.blaze3d.vertex.PoseStack;
import dev.juukulius.client.anim.AnimatorManager;
import dev.juukulius.client.anim.ClientClock;
import dev.juukulius.client.anim.PlayerAnimator;
import dev.juukulius.client.anim.PoseSnapshot;
import dev.juukulius.client.fx.BladeTrails;
import dev.juukulius.client.render.player.JuliusRenderInfo;
import dev.juukulius.registry.JuliusItems;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.entity.layers.ItemInHandLayer;
import net.minecraft.client.renderer.entity.state.ArmedEntityRenderState;
import net.minecraft.client.renderer.entity.state.AvatarRenderState;
import net.minecraft.client.renderer.item.ItemStackRenderState;
import net.minecraft.world.entity.HumanoidArm;
import net.minecraft.world.item.ItemStack;
import org.joml.Matrix4f;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Positions the sword in the hand during animations and reports the exact blade pose for trails and its rainbow aura. */
@Mixin(ItemInHandLayer.class)
public abstract class ItemInHandLayerMixin {
	@Inject(
		method = "submitArmWithItem",
		at = @At(
			value = "INVOKE",
			target = "Lnet/minecraft/client/renderer/item/ItemStackRenderState;submit(Lcom/mojang/blaze3d/vertex/PoseStack;Lnet/minecraft/client/renderer/SubmitNodeCollector;III)V"
		)
	)
	private void julius$swordPose(ArmedEntityRenderState state, ItemStackRenderState itemState, ItemStack stack, HumanoidArm arm, PoseStack poseStack,
		SubmitNodeCollector collector, int light, CallbackInfo ci) {
		if (!stack.is(JuliusItems.HOUSE_JUUKULIUS_SWORD) || arm != state.mainArm || !(state instanceof AvatarRenderState avatar)) {
			return;
		}

		PoseSnapshot pose = state.getData(JuliusRenderInfo.POSE);
		if (pose != null) {
			pose.applyItem(poseStack);
		}

		JuliusRenderInfo info = state.getData(JuliusRenderInfo.INFO);
		if (info != null) {
			PlayerAnimator animator = AnimatorManager.peek(avatar.id);
			float partialTick = Minecraft.getInstance().getDeltaTracker().getGameTimeDeltaPartialTick(false);
			BladeTrails.captureWorld(avatar.id, new Matrix4f(poseStack.last().pose()), arm == HumanoidArm.LEFT,
				Minecraft.getInstance().gameRenderer.getMainCamera().position(), animator != null ? animator.trailStyle : null,
				ClientClock.seconds(partialTick), info.clad);
		}
	}
}
