package com.realweather.client.mixin;

import com.realweather.client.render.DistantLightning;
import com.realweather.client.render.PrecipitationRenderer;
import net.minecraft.client.Camera;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.WeatherEffectRenderer;
import net.minecraft.client.renderer.state.WeatherRenderState;
import net.minecraft.server.level.ParticleStatus;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.Vec3;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * Hands precipitation rendering, splash particles and rain sounds over to RealWeather while keeping vanilla's
 * render pass, render targets and ordering (so Fabulous graphics and other weather-target users stay correct).
 */
@Mixin(WeatherEffectRenderer.class)
abstract class WeatherEffectRendererMixin {
	@Inject(method = "extractRenderState", at = @At("HEAD"), cancellable = true)
	private void realweather$extract(Level level, int ticks, float partialTick, Vec3 camera, WeatherRenderState state, CallbackInfo ci) {
		if (PrecipitationRenderer.enabled() && level instanceof ClientLevel clientLevel) {
			state.reset();
			PrecipitationRenderer.get().extract(clientLevel, ticks, partialTick, camera);
			ci.cancel();
		}
	}

	@Inject(method = "render", at = @At("HEAD"), cancellable = true)
	private void realweather$render(MultiBufferSource buffers, Vec3 camera, WeatherRenderState state, CallbackInfo ci) {
		if (PrecipitationRenderer.enabled()) {
			PrecipitationRenderer.get().render(buffers, camera);
			renderLightning(buffers, camera);
			ci.cancel();
		}
	}

	@Inject(method = "render", at = @At("RETURN"))
	private void realweather$renderAfterVanilla(MultiBufferSource buffers, Vec3 camera, WeatherRenderState state, CallbackInfo ci) {
		renderLightning(buffers, camera);
	}

	/** Lightning goes last: it outshines the rain in front of it. */
	private static void renderLightning(MultiBufferSource buffers, Vec3 camera) {
		DistantLightning.render(buffers, camera.x, camera.y, camera.z, Minecraft.getInstance().getDeltaTracker().getGameTimeDeltaPartialTick(false));
	}

	@Inject(method = "tickRainParticles", at = @At("HEAD"), cancellable = true)
	private void realweather$tickParticles(ClientLevel level, Camera camera, int ticks, ParticleStatus status, int radius, CallbackInfo ci) {
		if (PrecipitationRenderer.enabled()) {
			ci.cancel();
		}
	}
}
