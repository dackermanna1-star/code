package com.chaosunleashed.client.mixin;

import com.chaosunleashed.client.effect.ScreenShake;
import net.minecraft.client.render.GameRenderer;
import net.minecraft.client.util.math.MatrixStack;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Applies Chaos camera shake on top of the vanilla hurt tilt (affects both the world and the hand). */
@Mixin(GameRenderer.class)
public abstract class GameRendererMixin {
	@Inject(method = "tiltViewWhenHurt", at = @At("TAIL"))
	private void chaosunleashed$shake(MatrixStack matrices, float tickProgress, CallbackInfo ci) {
		ScreenShake.apply(matrices, tickProgress);
	}
}
