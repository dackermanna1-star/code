package com.ordnance.client.mixin;

import com.ordnance.client.fx.CameraShake;
import com.ordnance.client.fx.HeatHaze;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gl.PostEffectProcessor;
import net.minecraft.client.render.DefaultFramebufferSet;
import net.minecraft.client.render.GameRenderer;
import net.minecraft.client.render.RenderTickCounter;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.client.util.memory.ObjectPool;
import net.minecraft.util.Identifier;
import org.spongepowered.asm.mixin.Final;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Camera shake on the projection matrix, and the heat-haze post effect after the world is drawn. */
@Mixin(GameRenderer.class)
public abstract class GameRendererMixin {
	@Shadow
	@Final
	private MinecraftClient client;

	@Shadow
	@Final
	private ObjectPool pool;

	@Inject(method = "tiltViewWhenHurt", at = @At("HEAD"))
	private void ordnance$cameraShake(MatrixStack matrices, float tickProgress, CallbackInfo ci) {
		CameraShake.apply(matrices);
	}

	@Inject(
		method = "render",
		at = @At(value = "INVOKE", target = "Lnet/minecraft/client/render/WorldRenderer;drawEntityOutlinesFramebuffer()V", shift = At.Shift.AFTER)
	)
	private void ordnance$heatHaze(RenderTickCounter tickCounter, boolean tick, CallbackInfo ci) {
		Identifier effect = HeatHaze.effect();
		if (effect != null) {
			PostEffectProcessor processor = this.client.getShaderLoader().loadPostEffect(effect, DefaultFramebufferSet.MAIN_ONLY);
			if (processor != null) {
				processor.render(this.client.getFramebuffer(), this.pool);
			}
		}
	}
}
