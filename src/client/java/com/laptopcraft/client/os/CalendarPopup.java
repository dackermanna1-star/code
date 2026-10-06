package com.laptopcraft.client.os;

import com.laptopcraft.client.os.ui.Gfx;
import com.laptopcraft.client.os.ui.UI;
import net.minecraft.client.gui.GuiGraphics;

/**
 * Clock flyout: big in-game time, day number, weather and a "moon calendar" (Minecraft's moon has an
 * 8-day cycle, so each row of the calendar is one lunar cycle).
 */
final class CalendarPopup extends Popup {
	private static final int CELL_W = 22;
	private static final int CELL_H = 20;

	CalendarPopup(CubeOS os) {
		super(os, "clock");
	}

	@Override
	void render(GuiGraphics g, int mouseX, int mouseY) {
		Theme t = UI.theme();
		int gridW = CELL_W * 8;
		layout(os.width(), os.desktopHeight(), gridW + 20, 216);
		int yy = y + slide();
		Gfx.shadow(g, x, yy, w, h, 8, 0x60);
		Gfx.panel(g, x, yy, w, h, 6, t.surface(), t.border());
		long dayTime = os.dayTime();
		boolean h24 = OSSettings.clock24h(os.data());
		String time = OSClock.format(dayTime, true);
		if (!h24) {
			String full = OSClock.format(dayTime, false);
			time = full.substring(0, full.length() - 3);
			Gfx.text(g, full.substring(full.length() - 2), x + 12 + Gfx.width(time) * 3 + 3, yy + 12, t.textDim());
		}
		Gfx.textScaled(g, time, x + 10, yy + 10, 3f, t.text());
		int day = OSClock.day(dayTime);
		Gfx.text(g, "Day " + day + " · " + OSClock.partOfDay(dayTime), x + 11, yy + 40, t.textDim());
		// weather chip
		String weather = os.weatherText();
		String glyph = os.weatherGlyph();
		int ww = Gfx.width(glyph + " " + weather) + 12;
		Gfx.roundRect(g, x + w - ww - 10, yy + 12, ww, 14, 7, t.surfaceAlt());
		Gfx.text(g, glyph + " " + weather, x + w - ww - 4, yy + 15, t.text());
		Gfx.rect(g, x + 1, yy + 54, w - 2, 1, t.border());

		int phase = os.moonPhase();
		Gfx.text(g, "Moon calendar", x + 10, yy + 61, t.text());
		Gfx.textRight(g, OSClock.moonPhaseName(phase), x + w - 10, yy + 61, t.textDim());
		int gx = x + 10;
		int gy = yy + 76;
		// header: moon phases for the 8 columns. Day d (1-based) has phase (d - 1) % 8 when the world starts at full moon.
		int firstDayOfRow = ((day - 1) / 8) * 8 + 1;
		int startDay = Math.max(1, firstDayOfRow - 8);
		int phaseOffset = Math.floorMod(phase - (day - 1) % 8, 8);
		for (int c = 0; c < 8; c++) {
			drawMoon(g, gx + c * CELL_W + (CELL_W - 9) / 2, gy, 9, (c + phaseOffset) % 8, t);
		}
		gy += 14;
		for (int r = 0; r < 4; r++) {
			for (int c = 0; c < 8; c++) {
				int d = startDay + r * 8 + c;
				int cx = gx + c * CELL_W;
				int cy = gy + r * CELL_H;
				boolean today = d == day;
				boolean hov = Gfx.hovered(mouseX, mouseY, cx, cy, CELL_W, CELL_H);
				if (today) {
					Gfx.roundRect(g, cx + 2, cy + 1, CELL_W - 4, CELL_H - 2, 4, t.accent());
				} else if (hov) {
					Gfx.roundRect(g, cx + 2, cy + 1, CELL_W - 4, CELL_H - 2, 4, t.hover());
				}
				int col = today ? t.accentText() : d < day ? t.textDim() : t.text();
				Gfx.textCentered(g, Integer.toString(d), cx + CELL_W / 2, cy + 6, col);
			}
		}
		Gfx.textCentered(g, "Full moons bring slime and werewolf rumors.", x + w / 2, yy + h - 14,
				Gfx.fade(t.textDim(), 0.8f));
	}

	/** Pixel moon with the lit part for the vanilla phase index (0 = full ... 4 = new). */
	static void drawMoon(GuiGraphics g, int x, int y, int d, int phase, Theme t) {
		int lit = 0xFFF1EBC8;
		int dark = t.dark() ? 0xFF3A3D44 : 0xFFB9BEC7;
		// fraction of the disc that is dark and from which side
		float[] darkFrac = {0f, 0.25f, 0.5f, 0.75f, 1f, 0.75f, 0.5f, 0.25f};
		boolean fromLeft = phase >= 1 && phase <= 3;
		float f = darkFrac[Math.floorMod(phase, 8)];
		float r = d / 2f;
		for (int row = 0; row < d; row++) {
			float dy = row + 0.5f - r;
			float half = (float) Math.sqrt(Math.max(0, r * r - dy * dy));
			int x0 = Math.round(x + r - half);
			int x1 = Math.round(x + r + half);
			if (x1 <= x0) {
				continue;
			}
			g.fill(x0, y + row, x1, y + row + 1, lit);
			int span = x1 - x0;
			int darkW = Math.round(span * f);
			if (darkW > 0) {
				if (phase == 4) {
					g.fill(x0, y + row, x1, y + row + 1, dark);
				} else if (fromLeft) {
					g.fill(x0, y + row, x0 + darkW, y + row + 1, dark);
				} else {
					g.fill(x1 - darkW, y + row, x1, y + row + 1, dark);
				}
			}
		}
	}
}
