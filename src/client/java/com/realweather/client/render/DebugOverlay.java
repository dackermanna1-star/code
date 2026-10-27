package com.realweather.client.render;

import com.realweather.client.config.ClientConfig;
import com.realweather.client.weather.ClientWeather;
import com.realweather.weather.WeatherState;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;

/** Optional on-screen readout of the local weather (toggle with {@code /realweather debug}). */
public final class DebugOverlay {
	private DebugOverlay() {
	}

	/** The readout as plain text (also used for logging). */
	public static List<String> lines(float partialTick) {
		Minecraft minecraft = Minecraft.getInstance();
		List<String> lines = new ArrayList<>();
		if (minecraft.level == null) {
			return lines;
		}
		ClientWeather weather = ClientWeather.get();
		WeatherState state = weather.state();
		float[] wind = weather.windVector(partialTick, minecraft.gameRenderer.getMainCamera().position().y, minecraft.level.getSeaLevel());
		float speed = (float) Math.sqrt(wind[0] * wind[0] + wind[1] * wind[1]);
		lines.add(String.format(Locale.ROOT, "RealWeather: %s%s", state.type.id(), weather.isServerSynced() ? "" : " (vanilla server)"));
		lines.add(String.format(Locale.ROOT, "clouds %.0f%%  precip %.0f%%  storm %.0f%%  fog %.0f%%  cold %.0f%%",
			weather.cloudCover(partialTick) * 100, weather.precipitation(partialTick) * 100, weather.storm(partialTick) * 100,
			weather.fog(partialTick) * 100, weather.coldSnap(partialTick) * 100));
		lines.add(String.format(Locale.ROOT, "wind %.1f m/s (gust x%.2f)  local %s %.0f%%",
			speed, weather.gust(partialTick), weather.localType().name().toLowerCase(Locale.ROOT), weather.localIntensity(partialTick) * 100));
		lines.add(String.format(Locale.ROOT, "exposure %.0f%%  wet %.0f%%  in-cloud %.0f%%  visibility %s  %s",
			weather.exposure(partialTick) * 100, weather.wetness(partialTick) * 100, weather.inCloud(partialTick) * 100,
			WeatherAtmosphere.visibility() > 1.0E6F ? "-" : String.format(Locale.ROOT, "%.0f", WeatherAtmosphere.visibility()),
			WeatherAtmosphere.fogDebug()));
		lines.add(String.format(Locale.ROOT, "camera %s  fps %d", minecraft.gameRenderer.getMainCamera().getFluidInCamera().name().toLowerCase(Locale.ROOT),
			minecraft.getFps()));
		return lines;
	}

	public static void render(GuiGraphics graphics, DeltaTracker deltaTracker) {
		Minecraft minecraft = Minecraft.getInstance();
		if (!ClientConfig.get().debugOverlay || minecraft.level == null || minecraft.getDebugOverlay().showDebugScreen()) {
			return;
		}
		List<String> lines = lines(deltaTracker.getGameTimeDeltaPartialTick(false));
		int y = 4;
		for (String line : lines) {
			int width = minecraft.font.width(line);
			graphics.fill(2, y - 1, 6 + width, y + 9, 0x90000000);
			graphics.drawString(minecraft.font, line, 4, y, 0xFFE0E8F0, false);
			y += 11;
		}
	}
}
