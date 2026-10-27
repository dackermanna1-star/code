package com.realweather.mixin;

import com.realweather.weather.WeatherSimulator;
import net.minecraft.server.level.ServerLevel;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * Routes every vanilla weather change (the /weather command, other mods) and sleeping through the night into the
 * RealWeather simulator so it can transition smoothly instead of being overridden.
 */
@Mixin(ServerLevel.class)
abstract class ServerLevelMixin {
	@Inject(method = "setWeatherParameters", at = @At("HEAD"))
	private void realweather$onSetWeather(int clearTime, int rainTime, boolean raining, boolean thundering, CallbackInfo ci) {
		WeatherSimulator simulator = WeatherSimulator.get();
		if (simulator != null) {
			simulator.onVanillaWeatherSet((ServerLevel) (Object) this, clearTime, rainTime, raining, thundering);
		}
	}

	@Inject(method = "resetWeatherCycle", at = @At("HEAD"))
	private void realweather$onResetWeather(CallbackInfo ci) {
		WeatherSimulator simulator = WeatherSimulator.get();
		if (simulator != null) {
			simulator.onVanillaWeatherReset((ServerLevel) (Object) this);
		}
	}
}
