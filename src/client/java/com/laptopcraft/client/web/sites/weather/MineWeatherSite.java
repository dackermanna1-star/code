package com.laptopcraft.client.web.sites.weather;

import com.laptopcraft.client.web.PlaceholderSite;
import java.util.List;

/** Placeholder for MineWeather (mineweather.mc) — replaced by the real site implementation. */
public class MineWeatherSite extends PlaceholderSite {
	public MineWeatherSite() {
		super("mineweather.mc", "MineWeather", "Live weather, moon phase and a highly scientific forecast.", "weather", "mineweather_logo", 0xFF0EA5E9, List.of("weather", "forecast", "rain", "moon", "time"));
	}
}
