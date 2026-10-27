package com.realweather.client.weather;

import com.realweather.weather.WeatherState;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.world.attribute.EnvironmentAttributes;
import net.minecraft.world.phys.Vec3;

/**
 * Vertical structure of the cloud layer. Fair-weather cumulus sit near vanilla's cloud height; overcast layers
 * hang lower and thunderstorms grow into tall, low-based cumulonimbus towers.
 */
public final class CloudLayer {
	private CloudLayer() {
	}

	public static float vanillaHeight(ClientLevel level) {
		return level.environmentAttributes().getDimensionValue(EnvironmentAttributes.CLOUD_HEIGHT);
	}

	public static float vanillaHeight(ClientLevel level, Vec3 near) {
		return level.environmentAttributes().getValue(EnvironmentAttributes.CLOUD_HEIGHT, near);
	}

	public static float baseHeight(float vanillaHeight, float cloudCover, float storm, float precipitation) {
		return vanillaHeight - 10.0F - 22.0F * cloudCover - 20.0F * storm - 6.0F * precipitation;
	}

	public static float thickness(float cloudCover, float storm, float precipitation) {
		return 55.0F + 45.0F * cloudCover + 170.0F * storm + 25.0F * precipitation;
	}

	public static float baseHeight(ClientLevel level, WeatherState state) {
		return baseHeight(vanillaHeight(level), state.cloudCover, state.storm, state.precipitation);
	}

	public static float thickness(WeatherState state) {
		return thickness(state.cloudCover, state.storm, state.precipitation);
	}
}
