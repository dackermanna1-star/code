package com.chaosunleashed.client.mixin;

import com.chaosunleashed.client.render.ChaosSkyRenderer;
import net.minecraft.client.render.SkyRendering;
import net.minecraft.client.util.math.MatrixStack;
import org.joml.Vector4f;
import org.joml.Vector4fc;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.ModifyArg;
import org.spongepowered.asm.mixin.injection.ModifyArgs;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import org.spongepowered.asm.mixin.injection.invoke.arg.Args;

/** Giant orange sun (Solar Flare), big red moon (Blood Moon) and the eclipse disk/corona. */
@Mixin(SkyRendering.class)
public abstract class SkyRenderingMixin {
	private static final String SCALE = "Lorg/joml/Matrix4fStack;scale(FFF)Lorg/joml/Matrix4f;";
	private static final String WRITE = "Lnet/minecraft/client/gl/DynamicUniforms;write(Lorg/joml/Matrix4fc;Lorg/joml/Vector4fc;Lorg/joml/Vector3fc;Lorg/joml/Matrix4fc;)Lcom/mojang/blaze3d/buffers/GpuBufferSlice;";

	@ModifyArgs(method = "renderSun", at = @At(value = "INVOKE", target = SCALE))
	private void chaosunleashed$sunScale(Args args) {
		float scale = ChaosSkyRenderer.sunScale();
		args.set(0, (Float) args.get(0) * scale);
		args.set(2, (Float) args.get(2) * scale);
	}

	@ModifyArg(method = "renderSun", at = @At(value = "INVOKE", target = WRITE), index = 1)
	private Vector4fc chaosunleashed$sunColor(Vector4fc color) {
		return ChaosSkyRenderer.sunColor(new Vector4f(color));
	}

	@Inject(method = "renderSun", at = @At("TAIL"))
	private void chaosunleashed$eclipse(float alpha, MatrixStack matrices, CallbackInfo ci) {
		ChaosSkyRenderer.renderEclipse(matrices, alpha);
	}

	@ModifyArgs(method = "renderMoon", at = @At(value = "INVOKE", target = SCALE))
	private void chaosunleashed$moonScale(Args args) {
		float scale = ChaosSkyRenderer.moonScale();
		args.set(0, (Float) args.get(0) * scale);
		args.set(2, (Float) args.get(2) * scale);
	}

	@ModifyArg(method = "renderMoon", at = @At(value = "INVOKE", target = WRITE), index = 1)
	private Vector4fc chaosunleashed$moonColor(Vector4fc color) {
		return ChaosSkyRenderer.moonColor(new Vector4f(color));
	}
}
