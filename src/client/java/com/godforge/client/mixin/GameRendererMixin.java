package com.godforge.client.mixin;

import com.godforge.client.fx.ScreenEffects;
import com.mojang.blaze3d.vertex.PoseStack;
import net.minecraft.client.Camera;
import net.minecraft.client.renderer.GameRenderer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** Applies screen shake and space distortion to the world projection, and the distortion FOV pulse. */
@Mixin(GameRenderer.class)
public abstract class GameRendererMixin {
	@Inject(method = "bobHurt", at = @At("HEAD"))
	private void godforge$shake(PoseStack poseStack, float partialTick, CallbackInfo ci) {
		ScreenEffects.applyCamera(poseStack, partialTick);
	}

	@Inject(method = "getFov", at = @At("RETURN"), cancellable = true)
	private void godforge$fov(Camera camera, float partialTick, boolean useFovSetting, CallbackInfoReturnable<Float> cir) {
		float multiplier = ScreenEffects.fovMultiplier(partialTick);
		if (multiplier != 1.0F) {
			cir.setReturnValue(cir.getReturnValue() * multiplier);
		}
	}
}
