package com.realweather.client.screen;

import com.mojang.serialization.Codec;
import com.realweather.client.config.ClientConfig;
import java.util.Arrays;
import java.util.Locale;
import java.util.function.Consumer;
import java.util.function.IntConsumer;
import net.minecraft.client.Minecraft;
import net.minecraft.client.OptionInstance;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.options.OptionsSubScreen;
import net.minecraft.network.chat.Component;
import org.jspecify.annotations.Nullable;

/** In-game settings for RealWeather's client effects ({@code /realweather config}). */
public final class RealWeatherConfigScreen extends OptionsSubScreen {
	public RealWeatherConfigScreen(@Nullable Screen parent) {
		super(parent, Minecraft.getInstance().options, Component.translatable("realweather.config.title"));
	}

	@Override
	protected void addOptions() {
		if (this.list == null) {
			return;
		}
		ClientConfig c = ClientConfig.get();

		this.list.addHeader(Component.translatable("realweather.config.section.general"));
		this.list.addBig(new OptionInstance<>("realweather.config.quality", OptionInstance.noTooltip(),
			(caption, value) -> Component.translatable("options.generic_value", caption, Component.translatable("realweather.config.quality." + value.name().toLowerCase(Locale.ROOT))),
			new OptionInstance.Enum<>(Arrays.asList(ClientConfig.Quality.values()), Codec.STRING.xmap(s -> ClientConfig.Quality.valueOf(s), Enum::name)),
			c.qualityPreset(), value -> c.quality = value.name().toLowerCase(Locale.ROOT)));

		this.list.addHeader(Component.translatable("realweather.config.section.precipitation"));
		this.list.addSmall(
			bool("customPrecipitation", c.customPrecipitation, v -> c.customPrecipitation = v),
			bool("rainCurtains", c.rainCurtains, v -> c.rainCurtains = v),
			percent("precipitationDensity", c.precipitationDensity, 300, v -> c.precipitationDensity = v / 100.0F),
			percent("particleDensity", c.particleDensity, 300, v -> c.particleDensity = v / 100.0F),
			bool("splashes", c.splashes, v -> c.splashes = v),
			bool("ripples", c.ripples, v -> c.ripples = v),
			bool("snowflakes", c.snowflakes, v -> c.snowflakes = v),
			bool("windDebris", c.windDebris, v -> c.windDebris = v)
		);

		this.list.addHeader(Component.translatable("realweather.config.section.sky"));
		this.list.addSmall(
			bool("volumetricClouds", c.volumetricClouds, v -> c.volumetricClouds = v),
			bool("cloudShadows", c.cloudShadows, v -> c.cloudShadows = v),
			bool("weatherFog", c.weatherFog, v -> c.weatherFog = v),
			percent("fogStrength", c.fogStrength, 300, v -> c.fogStrength = v / 100.0F),
			bool("skyEffects", c.skyEffects, v -> c.skyEffects = v),
			bool("customLightning", c.customLightning, v -> c.customLightning = v),
			percent("flashBrightness", c.flashBrightness, 200, v -> c.flashBrightness = v / 100.0F),
			bool("realisticThunderDelay", c.realisticThunderDelay, v -> c.realisticThunderDelay = v)
		);

		this.list.addHeader(Component.translatable("realweather.config.section.terrain"));
		this.list.addSmall(
			bool("foliageSway", c.foliageSway, v -> c.foliageSway = v),
			percent("swayStrength", c.swayStrength, 300, v -> c.swayStrength = v / 100.0F),
			bool("wetSurfaces", c.wetSurfaces, v -> c.wetSurfaces = v),
			percent("wetnessStrength", c.wetnessStrength, 200, v -> c.wetnessStrength = v / 100.0F)
		);

		this.list.addHeader(Component.translatable("realweather.config.section.sound"));
		this.list.addSmall(
			bool("ambientSounds", c.ambientSounds, v -> c.ambientSounds = v),
			bool("replaceVanillaRainSounds", c.replaceVanillaRainSounds, v -> c.replaceVanillaRainSounds = v),
			percent("rainVolume", c.rainVolume, 200, v -> c.rainVolume = v / 100.0F),
			percent("windVolume", c.windVolume, 200, v -> c.windVolume = v / 100.0F),
			percent("thunderVolume", c.thunderVolume, 200, v -> c.thunderVolume = v / 100.0F),
			bool("debugOverlay", c.debugOverlay, v -> c.debugOverlay = v)
		);
	}

	private static OptionInstance<Boolean> bool(String name, boolean value, Consumer<Boolean> setter) {
		return OptionInstance.createBoolean("realweather.config." + name, OptionInstance.cachedConstantTooltip(
			Component.translatable("realweather.config." + name + ".tooltip")), value, setter);
	}

	private static OptionInstance<Integer> percent(String name, float value, int max, IntConsumer setter) {
		return new OptionInstance<>("realweather.config." + name,
			OptionInstance.cachedConstantTooltip(Component.translatable("realweather.config." + name + ".tooltip")),
			(caption, v) -> Component.translatable("options.percent_value", caption, v),
			new OptionInstance.IntRange(0, max, true), Math.round(value * 100.0F), setter::accept);
	}

	@Override
	public void removed() {
		super.removed();
		ClientConfig.save();
	}
}
