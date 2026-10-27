package com.realweather.client.mixin;

import com.realweather.client.render.VolumetricClouds;
import net.minecraft.client.CloudStatus;
import net.minecraft.client.renderer.CloudRenderer;
import net.minecraft.world.phys.Vec3;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * Replaces vanilla's blocky clouds with RealWeather's volumetric clouds. If they are disabled (or their shader is
 * unavailable, e.g. overridden by a broken resource pack) vanilla clouds render as usual.
 */
@Mixin(CloudRenderer.class)
abstract class CloudRendererMixin {
	@Inject(method = "render", at = @At("HEAD"), cancellable = true)
	private void realweather$renderVolumetric(int cloudColor, CloudStatus status, float cloudHeight, Vec3 camera, long gameTime, float partialTick,
			CallbackInfo ci) {
		if (VolumetricClouds.get().render(cloudColor, status, camera, partialTick)) {
			ci.cancel();
		}
	}
}
