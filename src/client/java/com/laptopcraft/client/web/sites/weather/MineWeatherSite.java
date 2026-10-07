package com.laptopcraft.client.web.sites.weather;

import com.laptopcraft.client.os.ui.Ease;
import com.laptopcraft.client.os.ui.Gfx;
import com.laptopcraft.client.web.PlaceholderSite;
import com.laptopcraft.client.web.WebPage;
import com.laptopcraft.client.web.WebUrl;
import com.laptopcraft.client.web.kit.Kit;
import com.laptopcraft.client.web.kit.KitPage;
import java.util.List;
import java.util.Locale;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Holder;
import net.minecraft.world.level.biome.Biome;

/** MineWeather (mineweather.mc) — live conditions from your world plus a (mostly made-up) forecast. */
public class MineWeatherSite extends PlaceholderSite {
	public MineWeatherSite() {
		super("mineweather.mc", "MineWeather", "Live weather for your biome. Forecasts 90% creeper-accurate.", "weather", "mineweather_logo", 0xFF1E88E5,
				List.of("weather", "rain", "forecast", "temperature", "storm", "sun", "moon"));
	}

	@Override
	public WebPage createPage(WebUrl url) {
		return new WeatherPage(this);
	}

	static final class WeatherPage extends KitPage {
		private static final String[] MOON = {"Full moon", "Waning gibbous", "Last quarter", "Waning crescent", "New moon", "Waxing crescent", "First quarter", "Waxing gibbous"};
		private static final String[] COND = {"Sunny", "Partly cloudy", "Cloudy", "Rain", "Thunderstorm", "Snow"};
		private final MineWeatherSite site;
		private int docHeight;

		WeatherPage(MineWeatherSite site) {
			this.site = site;
		}

		@Override
		public String title() {
			return "MineWeather — Live forecast";
		}

		@Override
		public int background() {
			return 0xFF0B1E3A;
		}

		@Override
		public int contentHeight(int width, int viewportHeight) {
			return Math.max(viewportHeight, docHeight);
		}

		@Override
		protected void draw(GuiGraphics g, int width, int vh, int scrollY, float pt) {
			Minecraft mc = Minecraft.getInstance();
			ClientLevel level = mc.level;
			BlockPos pos = mc.player != null ? mc.player.blockPosition() : BlockPos.ZERO;
			long dayTime = page.app().dayTime() % 24000;
			boolean night = dayTime >= 13000 && dayTime < 23000;
			String biome = "Plains";
			float baseTemp = 0.8f;
			boolean snowy = false;
			if (level != null) {
				Holder<Biome> b = level.getBiome(pos);
				biome = b.unwrapKey().map(k -> pretty(k.identifier().getPath())).orElse("Unknown");
				baseTemp = b.value().getBaseTemperature();
				snowy = b.value().coldEnoughToSnow(pos, level.getSeaLevel());
			}
			int cond = level == null ? 0 : level.isThundering() ? 4 : level.isRaining() ? (snowy ? 5 : 3) : 0;
			int tempC = Math.round(baseTemp * 25 - 2 + (night ? -6 : 3) + (cond >= 3 ? -3 : 0));
			// hero
			int heroH = 120;
			int top = night ? 0xFF0B1030 : cond >= 3 ? 0xFF4B5D73 : 0xFF2F80ED;
			int bottom = night ? 0xFF243B6B : cond >= 3 ? 0xFF8A9BB0 : 0xFF8ED1FC;
			Gfx.gradientV(g, 0, 0, width, heroH, top, bottom);
			Gfx.textureFit(g, site.logo(), 10, 6, 120, 18);
			illustration(g, width - 120, 26, 100, 80, cond, night);
			Gfx.textShadow(g, biome + " · X " + pos.getX() + ", Z " + pos.getZ(), 14, 32, 0xFFE3F2FD);
			Gfx.textScaledShadow(g, tempC + "°C", 14, 46, 4f, 0xFFFFFFFF);
			Gfx.textShadow(g, COND[cond] + " · feels like " + (tempC - 2) + "°", 14, 84, 0xFFFFFFFF);
			Gfx.textShadow(g, "Day " + page.app().day() + " · " + page.app().clockText() + (night ? " · " + MOON[(int) (page.app().dayTime() / 24000 % 8)] : ""), 14, 98, 0xFFE3F2FD);
			int y = heroH + 10;
			if (cond == 4) {
				Gfx.roundRect(g, 10, y, width - 20, 22, 4, 0xFFB71C1C);
				Gfx.text(g, "⚠ SEVERE WEATHER: thunderstorm. Charged creepers possible. Stay indoors, keep a bucket handy.", 18, y + 7, 0xFFFFFFFF);
				y += 30;
			}
			// stats
			String[][] stats = {{"Wind", (6 + (int) (Kit.rand("wind" + page.app().day(), 1) * 20)) + " km/h"}, {"Humidity", (cond >= 3 ? 88 : 40 + (int) (baseTemp * 20)) + "%"},
					{"Sunrise", "06:00"}, {"Sunset", "18:00"}, {"UV index", night || cond >= 3 ? "0 (low)" : "6 (wear a helmet)"}, {"Creeper risk", night ? "HIGH" : "Low"}};
			int cols = Math.max(2, Math.min(6, (width - 20) / 90));
			int cw = (width - 20 - (cols - 1) * 8) / cols;
			for (int i = 0; i < stats.length; i++) {
				int x = 10 + (i % cols) * (cw + 8), sy = y + (i / cols) * 40;
				Gfx.roundRect(g, x, sy, cw, 34, 6, 0xFF14305A);
				Gfx.text(g, stats[i][0], x + 8, sy + 6, 0xFF90CAF9);
				Gfx.textClipped(g, stats[i][1], x + 8, sy + 19, cw - 12, i == 5 && night ? 0xFFFF8A80 : 0xFFFFFFFF);
			}
			y += ((stats.length + cols - 1) / cols) * 40 + 10;
			// hourly
			Gfx.text(g, "Next hours", 12, y, 0xFFFFFFFF);
			y += 12;
			int hours = Math.max(4, Math.min(12, (width - 20) / 52));
			int hw = (width - 20) / hours;
			for (int i = 0; i < hours; i++) {
				long t = (dayTime + (i + 1) * 1000L) % 24000;
				boolean n = t >= 13000 && t < 23000;
				int hx = 10 + i * hw;
				Gfx.roundRect(g, hx, y, hw - 4, 62, 6, 0xFF14305A);
				long hh = (t / 1000 + 6) % 24;
				Gfx.textCentered(g, String.format(Locale.ROOT, "%02d:00", hh), hx + (hw - 4) / 2, y + 5, 0xFF90CAF9);
				int c = i < 2 ? cond : forecast(page.app().day() * 24 + i);
				illustration(g, hx + (hw - 4) / 2 - 12, y + 16, 24, 20, c, n);
				Gfx.textCentered(g, (tempC + (n ? -4 : 2) - i / 3) + "°", hx + (hw - 4) / 2, y + 44, 0xFFFFFFFF);
			}
			y += 72;
			// week
			Gfx.text(g, "7-day forecast", 12, y, 0xFFFFFFFF);
			y += 12;
			for (int d = 0; d < 7; d++) {
				int day = page.app().day() + d;
				int c = d == 0 ? cond : forecast(day * 31);
				Gfx.roundRect(g, 10, y, width - 20, 22, 4, d % 2 == 0 ? 0xFF14305A : 0xFF11284B);
				Gfx.text(g, d == 0 ? "Today" : "Day " + day, 18, y + 7, 0xFFFFFFFF);
				illustration(g, 90, y + 2, 22, 18, c, false);
				Gfx.text(g, COND[c], 120, y + 7, 0xFFE3F2FD);
				int hi = tempC + 3 - (int) (Kit.rand("hi", day) * 6), lo = hi - 6 - (int) (Kit.rand("lo", day) * 4);
				Gfx.textRight(g, hi + "° / " + lo + "°", width - 18, y + 7, 0xFFFFFFFF);
				y += 25;
			}
			y += 8;
			Gfx.textCentered(g, "Data provided by the Weather Villagers' Union. Not liable for creeper damage.", width / 2, y, 0xFF6F8FB8);
			docHeight = y + 20;
		}

		private static int forecast(int seed) {
			double r = Kit.rand("wx", seed);
			return r < 0.45 ? 0 : r < 0.7 ? 1 : r < 0.82 ? 2 : r < 0.95 ? 3 : 4;
		}

		private static String pretty(String path) {
			String[] parts = path.split("_");
			StringBuilder sb = new StringBuilder();
			for (String p : parts) {
				if (!p.isEmpty()) {
					sb.append(Character.toUpperCase(p.charAt(0))).append(p.substring(1)).append(' ');
				}
			}
			return sb.toString().trim();
		}

		private static void disc(GuiGraphics g, int cx, int cy, int r, int color) {
			for (int dy = -r; dy <= r; dy++) {
				int half = (int) Math.round(Math.sqrt(Math.max(0, r * r - dy * dy)));
				Gfx.rect(g, cx - half, cy + dy, half * 2, 1, color);
			}
		}

		private static void illustration(GuiGraphics g, int x, int y, int w, int h, int cond, boolean night) {
			long now = Ease.now();
			int s = Math.min(w, h);
			if (cond <= 1) {
				int r = s / 3;
				int cx = x + w / 2 - (cond == 1 ? s / 6 : 0), cy = y + h / 2 - (cond == 1 ? s / 8 : 0);
				if (night) {
					disc(g, cx, cy, r, 0xFFECEFF1);
					disc(g, cx - r / 3, cy - r / 3, r / 4, 0xFFCFD8DC);
				} else {
					for (int i = 0; i < 8; i++) {
						double a = i / 8.0 * Math.PI * 2 + now / 3000.0;
						int rx = cx + (int) (Math.cos(a) * r * 1.5), ry = cy + (int) (Math.sin(a) * r * 1.5);
						Gfx.rect(g, rx - 1, ry - 1, 2, 2, 0xFFFFE082);
					}
					disc(g, cx, cy, r, 0xFFFFC107);
				}
			}
			if (cond >= 1) {
				int cw = (int) (s * 0.9), ch = cw / 2;
				int cx = x + w / 2 - cw / 2 + (cond == 1 ? s / 8 : 0), cy = y + h / 2 - ch / 4;
				int col = cond >= 3 ? 0xFF90A4AE : 0xFFF5F5F5;
				Gfx.roundRect(g, cx, cy + ch / 4, cw, ch * 3 / 4, Math.min(6, ch / 3), col);
				disc(g, cx + cw / 3, cy + ch / 3, ch / 2, col);
				disc(g, cx + cw * 2 / 3, cy + ch / 4, ch * 2 / 3, col);
			}
			if (cond == 3 || cond == 4) {
				for (int i = 0; i < 6; i++) {
					int rx = x + w / 5 + i * w / 8;
					int ry = y + h * 2 / 3 + (int) ((now / 40 + i * 7) % Math.max(1, h / 3));
					Gfx.rect(g, rx, ry, 1, Math.max(2, h / 10), 0xFF64B5F6);
				}
			}
			if (cond == 4 && (now / 300) % 5 == 0) {
				Gfx.rect(g, x + w / 2, y + h / 2, 2, h / 3, 0xFFFFEB3B);
			}
			if (cond == 5) {
				for (int i = 0; i < 6; i++) {
					int rx = x + w / 5 + i * w / 8;
					int ry = y + h * 2 / 3 + (int) ((now / 90 + i * 5) % Math.max(1, h / 3));
					Gfx.rect(g, rx, ry, 2, 2, 0xFFFFFFFF);
				}
			}
		}
	}
}
