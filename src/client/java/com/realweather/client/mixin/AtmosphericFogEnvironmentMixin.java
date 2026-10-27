package com.realweather.client.mixin;

import com.realweather.client.render.WeatherAtmosphere;
import net.minecraft.client.Camera;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.renderer.fog.FogData;
import net.minecraft.client.renderer.fog.environment.AtmosphericFogEnvironment;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** Weather-dependent visibility (rain haze, fog banks, blizzard white-outs, flying through clouds) and fog colour. */
@Mixin(AtmosphericFogEnvironment.class)
abstract class AtmosphericFogEnvironmentMixin {
	@Inject(method = "setupFog", at = @At("TAIL"))
	private void realweather$weatherFog(FogData fog, Camera camera, ClientLevel level, float renderDistance, DeltaTracker deltaTracker, CallbackInfo ci) {
		WeatherAtmosphere.applyFog(fog, camera, level, renderDistance, deltaTracker.getGameTimeDeltaPartialTick(false));
	}

	@Inject(method = "getBaseColor", at = @At("RETURN"), cancellable = true)
	private void realweather$weatherFogColor(ClientLevel level, Camera camera, int renderDistance, float partialTick, CallbackInfoReturnable<Integer> cir) {
		cir.setReturnValue(WeatherAtmosphere.fogColor(cir.getReturnValueI(), camera, level, partialTick));
	}
}
