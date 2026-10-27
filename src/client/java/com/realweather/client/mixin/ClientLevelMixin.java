package com.realweather.client.mixin;

import com.realweather.client.render.WeatherAtmosphere;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.world.attribute.EnvironmentAttributeSystem;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** Adds RealWeather's client-only environment attribute layers (overcast skies, storm light, lightning flashes). */
@Mixin(ClientLevel.class)
abstract class ClientLevelMixin {
	@Inject(method = "addEnvironmentAttributeLayers", at = @At("RETURN"))
	private void realweather$addWeatherLayers(EnvironmentAttributeSystem.Builder builder, CallbackInfoReturnable<EnvironmentAttributeSystem.Builder> cir) {
		WeatherAtmosphere.addAttributeLayers(builder, (ClientLevel) (Object) this);
	}
}
