package com.realweather.client.mixin;

import com.llamalad7.mixinextras.injector.ModifyExpressionValue;
import com.llamalad7.mixinextras.sugar.Local;
import com.mojang.blaze3d.buffers.Std140Builder;
import com.realweather.client.render.GlobalsExtension;
import net.minecraft.client.Camera;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.renderer.GlobalSettingsUniform;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;

/**
 * Enlarges vanilla's Globals uniform buffer and appends RealWeather's data after the vanilla fields. Shaders that
 * declare the original, shorter block are unaffected (std140 allows binding a larger buffer).
 */
@Mixin(GlobalSettingsUniform.class)
abstract class GlobalSettingsUniformMixin {
	@ModifyExpressionValue(method = "<clinit>", at = @At(value = "INVOKE", target = "Lcom/mojang/blaze3d/buffers/Std140SizeCalculator;get()I"))
	private static int realweather$extendSize(int vanillaSize) {
		return GlobalsExtension.extendedSize(vanillaSize);
	}

	@ModifyExpressionValue(
		method = "update",
		at = @At(value = "INVOKE", target = "Lcom/mojang/blaze3d/buffers/Std140Builder;putInt(I)Lcom/mojang/blaze3d/buffers/Std140Builder;", ordinal = 1)
	)
	private Std140Builder realweather$appendWeather(Std140Builder builder, @Local(argsOnly = true) Camera camera,
			@Local(argsOnly = true) DeltaTracker deltaTracker) {
		return GlobalsExtension.write(builder, camera, deltaTracker);
	}
}
