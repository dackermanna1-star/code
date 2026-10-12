package com.extremesports.mixin.client;

import com.extremesports.client.camera.CameraEffects;
import com.mojang.blaze3d.vertex.PoseStack;
import net.minecraft.client.Camera;
import net.minecraft.client.renderer.GameRenderer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

@Mixin(GameRenderer.class)
public abstract class GameRendererMixin {
	@Inject(method = "bobHurt", at = @At("TAIL"))
	private void extremesports$rideShake(PoseStack poseStack, float partialTick, CallbackInfo ci) {
		CameraEffects.apply(poseStack, partialTick);
	}

	@Inject(method = "getFov", at = @At("RETURN"), cancellable = true)
	private void extremesports$speedFov(Camera camera, float partialTick, boolean useFovSetting, CallbackInfoReturnable<Float> cir) {
		if (useFovSetting) {
			cir.setReturnValue(cir.getReturnValueF() * CameraEffects.fovMultiplier(partialTick));
		}
	}
}
