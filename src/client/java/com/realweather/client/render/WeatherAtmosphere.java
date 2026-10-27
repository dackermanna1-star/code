package com.realweather.client.render;

import com.realweather.client.config.ClientConfig;
import com.realweather.client.weather.ClientWeather;
import com.realweather.weather.Climate;
import net.minecraft.client.Camera;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.renderer.fog.FogData;
import net.minecraft.core.BlockPos;
import net.minecraft.util.ARGB;
import net.minecraft.util.Mth;
import net.minecraft.world.attribute.EnvironmentAttributeSystem;
import net.minecraft.world.attribute.EnvironmentAttributes;
import net.minecraft.world.level.LightLayer;
import net.minecraft.world.phys.Vec3;

/**
 * Ties the atmosphere together: visibility (fog distances) and fog colour from precipitation, fog banks,
 * blizzards and clouds; sky colour, sky light and star visibility from cloud cover; and lightning illumination.
 */
public final class WeatherAtmosphere {
	private static float visibility = Float.MAX_VALUE;
	private static float lastFogStart;
	private static float lastFogEnd;

	private WeatherAtmosphere() {
	}

	/** Environmental fog start/end of the last frame, for the debug overlay. */
	public static String fogDebug() {
		return String.format(java.util.Locale.ROOT, "fog %.0f..%.0f", lastFogStart, lastFogEnd);
	}

	/** Current weather visibility in blocks (very large when clear). */
	public static float visibility() {
		return visibility;
	}

	private static float smoothstep(float edge0, float edge1, float x) {
		float t = Mth.clamp((x - edge0) / (edge1 - edge0), 0.0F, 1.0F);
		return t * t * (3.0F - 2.0F * t);
	}

	/** 0 underground, 1 under the open sky. Weather fog belongs outside, not in caves. */
	private static float outdoorFactor(ClientLevel level, Camera camera) {
		BlockPos pos = camera.blockPosition();
		float sky = level.getLightEngine().getLayerListener(LightLayer.SKY).getLightValue(pos);
		return Mth.clamp((sky - 6.0F) / 8.0F, 0.0F, 1.0F);
	}

	private static float blizzardFactor(ClientWeather weather, ClientLevel level, Vec3 camera, float partialTick) {
		if (!weather.localType().isSnowy()) {
			return 0.0F;
		}
		float[] wind = weather.windVector(partialTick, camera.y, level.getSeaLevel());
		float speed = Mth.sqrt(wind[0] * wind[0] + wind[1] * wind[1]);
		return smoothstep(0.35F, 0.9F, weather.localIntensity(partialTick)) * smoothstep(6.0F, 16.0F, speed);
	}

	public static void applyFog(FogData fog, Camera camera, ClientLevel level, float renderDistance, float partialTick) {
		applyWeatherFog(fog, camera, level, renderDistance, partialTick);
		lastFogStart = fog.environmentalStart;
		lastFogEnd = fog.environmentalEnd;
	}

	private static void applyWeatherFog(FogData fog, Camera camera, ClientLevel level, float renderDistance, float partialTick) {
		ClientConfig config = ClientConfig.get();
		ClientWeather weather = ClientWeather.get();
		visibility = Float.MAX_VALUE;
		if (!config.weatherFog || !weather.hasWeather() || config.fogStrength <= 0.0F) {
			return;
		}
		float outdoor = outdoorFactor(level, camera);
		Vec3 pos = camera.position();
		float intensity = weather.localIntensity(partialTick);
		Climate.Precipitation type = weather.localType();
		float weatherFog = weather.fog(partialTick);
		float blizzard = blizzardFactor(weather, level, pos, partialTick);
		float inCloud = weather.inCloud(partialTick);

		float far = Math.max(renderDistance, 256.0F);
		float v = far;
		if (intensity > 0.0F) {
			float precipitationVisibility = type.isSnowy() ? Mth.lerp(smoothstep(0.0F, 1.0F, intensity), 260.0F, 70.0F) : Mth.lerp(smoothstep(0.0F, 1.1F, intensity), 420.0F, 85.0F);
			v = Math.min(v, Mth.lerp(Mth.clamp(intensity * 4.0F, 0.0F, 1.0F), far, precipitationVisibility));
		}
		if (blizzard > 0.0F) {
			v = Math.min(v, Mth.lerp(blizzard, far, 18.0F));
		}
		if (weatherFog > 0.0F) {
			v = Math.min(v, Mth.lerp(smoothstep(0.0F, 1.0F, weatherFog), far, 26.0F));
		}
		v = Mth.lerp(outdoor, far, v);
		if (inCloud > 0.0F) {
			v = Math.min(v, Mth.lerp(smoothstep(0.0F, 0.6F, inCloud), far, 9.0F));
		}
		v = Mth.lerp(Math.min(config.fogStrength, 1.0F), far, v / Math.max(1.0F, config.fogStrength));
		if (v >= far * 0.999F) {
			return;
		}
		visibility = v;
		// The start is derived from our visibility instead of combined with vanilla's: vanilla's rain fog pushes
		// the start far negative (-160), which together with a short end would haze even the nearest blocks.
		float density = Math.max(blizzard, Math.max(weatherFog, inCloud));
		float startFraction = Mth.lerp(density, 0.3F, 0.0F);
		float end = Math.min(fog.environmentalEnd, v);
		fog.environmentalEnd = end;
		fog.environmentalStart = Math.min(Math.max(fog.environmentalStart, end * startFraction), end * 0.95F);
		fog.skyEnd = Math.min(fog.skyEnd, Math.max(v * 1.6F, 24.0F));
		fog.cloudEnd = Math.min(fog.cloudEnd, Math.max(v * 3.0F, 32.0F));
	}

	public static int fogColor(int base, Camera camera, ClientLevel level, float partialTick) {
		ClientConfig config = ClientConfig.get();
		ClientWeather weather = ClientWeather.get();
		if (!config.weatherFog || !weather.hasWeather()) {
			return base;
		}
		Vec3 pos = camera.position();
		float r = ARGB.redFloat(base);
		float g = ARGB.greenFloat(base);
		float b = ARGB.blueFloat(base);
		float luma = 0.299F * r + 0.587F * g + 0.114F * b;
		float light = Mth.clamp(luma / 0.65F, 0.04F, 1.2F);
		float outdoor = outdoorFactor(level, camera);
		float intensity = weather.localIntensity(partialTick) * outdoor;
		float blizzard = blizzardFactor(weather, level, pos, partialTick) * outdoor;
		float weatherFog = weather.fog(partialTick) * outdoor;
		float storm = weather.storm(partialTick) * outdoor;
		float inCloud = weather.inCloud(partialTick);

		// Rain desaturates and cools the haze.
		float rain = Mth.clamp(intensity * 0.9F, 0.0F, 0.6F) * (weather.localType().isSnowy() ? 0.5F : 1.0F);
		r = Mth.lerp(rain, r, luma * 0.92F);
		g = Mth.lerp(rain, g, luma * 0.96F);
		b = Mth.lerp(rain, b, luma * 1.04F);
		// Fog banks, falling snow and the inside of clouds are bright, milky white-grey.
		float milk = Math.max(Math.max(blizzard * 0.85F, weatherFog * 0.7F), inCloud * 0.9F);
		milk = Math.max(milk, weather.localType().isSnowy() ? intensity * 0.45F : 0.0F);
		r = Mth.lerp(milk, r, 0.80F * light);
		g = Mth.lerp(milk, g, 0.83F * light);
		b = Mth.lerp(milk, b, 0.88F * light);
		float dark = 1.0F - storm * 0.3F;
		r *= dark;
		g *= dark;
		b *= dark;
		float flash = Math.min(1.0F, weather.flashBrightness(pos, partialTick) * config.flashBrightness) * outdoor;
		r = Mth.lerp(flash * 0.45F, r, 0.78F);
		g = Mth.lerp(flash * 0.45F, g, 0.8F);
		b = Mth.lerp(flash * 0.45F, b, 0.92F);
		return ARGB.colorFromFloat(ARGB.alphaFloat(base), Mth.clamp(r, 0.0F, 1.0F), Mth.clamp(g, 0.0F, 1.0F), Mth.clamp(b, 0.0F, 1.0F));
	}

	/** How visible the sun, moon and stars are (combined with vanilla's rain dimming). */
	public static float celestialVisibility(float partialTick) {
		ClientWeather weather = ClientWeather.get();
		if (!ClientConfig.get().skyEffects || !weather.hasWeather()) {
			return 1.0F;
		}
		float overcast = smoothstep(0.7F, 1.0F, weather.cloudCover(partialTick)) * 0.85F;
		float fog = weather.fog(partialTick) * 0.75F;
		float cloud = weather.inCloud(partialTick);
		return Mth.clamp(1.0F - Math.max(Math.max(overcast, fog), cloud), 0.0F, 1.0F);
	}

	// -----------------------------------------------------------------------------------------------------------
	// Environment attribute layers (client level only)
	// -----------------------------------------------------------------------------------------------------------

	private static float overcastOnly(ClientLevel level) {
		ClientWeather weather = ClientWeather.get();
		if (!ClientConfig.get().skyEffects || !weather.hasWeather()) {
			return 0.0F;
		}
		float partialTick = Minecraft.getInstance().getDeltaTracker().getGameTimeDeltaPartialTick(false);
		float overcast = smoothstep(0.45F, 1.0F, weather.cloudCover(partialTick)) * 0.8F + weather.fog(partialTick) * 0.3F;
		// Vanilla already greys the sky for its rain level; only add what it does not cover.
		return Mth.clamp(overcast - level.getRainLevel(partialTick), 0.0F, 1.0F);
	}

	private static float flash(ClientLevel level) {
		ClientWeather weather = ClientWeather.get();
		if (!weather.hasWeather()) {
			return 0.0F;
		}
		Minecraft minecraft = Minecraft.getInstance();
		Camera camera = minecraft.gameRenderer.getMainCamera();
		if (!camera.isInitialized()) {
			return 0.0F;
		}
		float partialTick = minecraft.getDeltaTracker().getGameTimeDeltaPartialTick(false);
		return Math.min(1.0F, weather.flashBrightness(camera.position(), partialTick) * ClientConfig.get().flashBrightness);
	}

	private static float extraStorm(ClientLevel level) {
		ClientWeather weather = ClientWeather.get();
		if (!weather.hasWeather()) {
			return 0.0F;
		}
		float partialTick = Minecraft.getInstance().getDeltaTracker().getGameTimeDeltaPartialTick(false);
		return Mth.clamp(weather.storm(partialTick) - level.getThunderLevel(partialTick), 0.0F, 1.0F);
	}

	public static void addAttributeLayers(EnvironmentAttributeSystem.Builder builder, ClientLevel level) {
		int flashSky = ARGB.color(196, 202, 255);
		builder.addTimeBasedLayer(EnvironmentAttributes.SKY_COLOR, (color, time) -> {
			float overcast = overcastOnly(level);
			float storm = extraStorm(level);
			int result = color;
			if (overcast > 0.0F) {
				float luma = (0.299F * ARGB.redFloat(result) + 0.587F * ARGB.greenFloat(result) + 0.114F * ARGB.blueFloat(result));
				int grey = ARGB.colorFromFloat(1.0F, luma * 0.9F, luma * 0.93F, luma * 0.98F);
				result = ARGB.srgbLerp(overcast * 0.7F, result, grey);
			}
			if (storm > 0.0F) {
				result = ARGB.scaleRGB(result, 1.0F - storm * 0.35F);
			}
			float flash = flash(level);
			return flash > 0.0F ? ARGB.srgbLerp(Math.min(0.6F, flash * 0.5F), result, flashSky) : result;
		});
		builder.addTimeBasedLayer(EnvironmentAttributes.CLOUD_COLOR, (color, time) -> {
			float storm = ClientWeather.get().hasWeather() ? ClientWeather.get().storm(1.0F) : 0.0F;
			return storm > 0.0F ? ARGB.color(ARGB.alpha(color), ARGB.scaleRGB(color, 1.0F - storm * 0.3F)) : color;
		});
		builder.addTimeBasedLayer(EnvironmentAttributes.SKY_LIGHT_FACTOR, (factor, time) -> {
			float overcast = overcastOnly(level);
			float storm = extraStorm(level);
			float value = factor * (1.0F - overcast * 0.16F) * (1.0F - storm * 0.18F);
			float flash = flash(level);
			return flash > 0.0F ? Mth.lerp(Math.min(1.0F, flash * 0.8F), value, 1.0F) : value;
		});
		builder.addTimeBasedLayer(EnvironmentAttributes.STAR_BRIGHTNESS, (brightness, time) -> {
			float overcast = overcastOnly(level);
			return brightness * (1.0F - Math.min(1.0F, overcast * 1.2F));
		});
		builder.addTimeBasedLayer(EnvironmentAttributes.SUNRISE_SUNSET_COLOR, (color, time) -> {
			float overcast = overcastOnly(level);
			return overcast > 0.0F ? ARGB.color(Math.round(ARGB.alpha(color) * (1.0F - overcast * 0.75F)), color) : color;
		});
	}
}
