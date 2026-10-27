package com.realweather.client.mixin;

import com.realweather.client.render.WeatherAtmosphere;
import net.minecraft.client.Camera;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.renderer.SkyRenderer;
import net.minecraft.client.renderer.state.SkyRenderState;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Dims the sun, moon and stars behind overcast decks and fog, not only during rain. */
@Mixin(SkyRenderer.class)
abstract class SkyRendererMixin {
	@Inject(method = "extractRenderState", at = @At("TAIL"))
	private void realweather$overcastSky(ClientLevel level, float partialTick, Camera camera, SkyRenderState state, CallbackInfo ci) {
		state.rainBrightness = Math.min(state.rainBrightness, WeatherAtmosphere.celestialVisibility(partialTick));
	}
}
