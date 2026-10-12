package com.extremesports.mixin.client;

import com.extremesports.client.render.RiderRenderHooks;
import com.mojang.blaze3d.vertex.PoseStack;
import net.minecraft.client.renderer.entity.player.AvatarRenderer;
import net.minecraft.client.renderer.entity.state.AvatarRenderState;
import net.minecraft.world.entity.Avatar;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(AvatarRenderer.class)
public abstract class AvatarRendererMixin {
	@Inject(method = "extractRenderState(Lnet/minecraft/world/entity/Avatar;Lnet/minecraft/client/renderer/entity/state/AvatarRenderState;F)V", at = @At("TAIL"))
	private void extremesports$extractRider(Avatar avatar, AvatarRenderState state, float partialTick, CallbackInfo ci) {
		RiderRenderHooks.extract(avatar, state, partialTick);
	}

	@Inject(method = "setupRotations(Lnet/minecraft/client/renderer/entity/state/AvatarRenderState;Lcom/mojang/blaze3d/vertex/PoseStack;FF)V",
		at = @At("HEAD"), cancellable = true)
	private void extremesports$riderRotations(AvatarRenderState state, PoseStack poseStack, float bodyRot, float scale, CallbackInfo ci) {
		if (RiderRenderHooks.setupRotations(state, poseStack, bodyRot)) {
			ci.cancel();
		}
	}
}
