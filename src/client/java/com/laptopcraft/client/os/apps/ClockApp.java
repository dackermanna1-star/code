package com.laptopcraft.client.os.apps;

import com.laptopcraft.client.os.Theme;
import com.laptopcraft.client.os.apps.kit.KitApp;
import com.laptopcraft.client.os.ui.Ease;
import com.laptopcraft.client.os.ui.Gfx;
import com.laptopcraft.registry.ModSounds;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import net.minecraft.client.gui.GuiGraphics;

/** CubeOS Clock: an analog world clock, stopwatch with laps, and a countdown timer. */
public class ClockApp extends KitApp {
	private static final String[] TABS = {"Clock", "Stopwatch", "Timer"};
	private static final String[] MOON = {"Full moon", "Waning gibbous", "Last quarter", "Waning crescent", "New moon", "Waxing crescent", "First quarter", "Waxing gibbous"};
	private int tab;
	// stopwatch
	private long swStart, swAccum;
	private boolean swRunning;
	private final List<Long> laps = new ArrayList<>();
	// timer
	private int timerSet = 60;
	private long timerEnd;
	private long timerPausedLeft = -1;
	private boolean timerDone;

	@Override
	protected void draw(GuiGraphics g, int w, int h, float pt) {
		Theme t = t();
		Gfx.rect(g, 0, 0, w, h, t.bg());
		int tw = (w - 8) / TABS.length;
		for (int i = 0; i < TABS.length; i++) {
			int idx = i;
			boolean hov = region(g, 4 + i * tw, 3, tw - 2, 14, () -> tab = idx);
			Gfx.roundRect(g, 4 + i * tw, 3, tw - 2, 14, 4, tab == i ? t.selection() : hov ? t.hover() : t.surface());
			Gfx.textCentered(g, TABS[i], 4 + i * tw + tw / 2, 6, tab == i ? t.text() : t.textDim());
		}
		int top = 22;
		switch (tab) {
			case 1 -> stopwatch(g, w, h, top);
			case 2 -> timer(g, w, h, top);
			default -> clock(g, w, h, top);
		}
	}

	private void clock(GuiGraphics g, int w, int h, int top) {
		Theme t = t();
		long dt = ctx.dayTime() % 24000;
		double hours = ((dt + 6000) % 24000) / 1000.0;
		int r = Math.max(20, Math.min(w, h - top - 40) / 2 - 6);
		int cx = w / 2, cy = top + 4 + r;
		// face
		Gfx.roundRect(g, cx - r, cy - r, r * 2, r * 2, r, t.surface());
		Gfx.roundBorder(g, cx - r, cy - r, r * 2, r * 2, r, t.border());
		boolean night = dt >= 13000 && dt < 23000;
		Gfx.roundRect(g, cx - r + 4, cy - r + 4, r * 2 - 8, r * 2 - 8, r - 4, night ? 0x22283593 : 0x22FFD54F);
		for (int i = 0; i < 12; i++) {
			double a = i / 12.0 * Math.PI * 2;
			int len = i % 3 == 0 ? 4 : 2;
			for (int k = 0; k < len; k++) {
				int px = cx + (int) Math.round(Math.sin(a) * (r - 4 - k));
				int py = cy - (int) Math.round(Math.cos(a) * (r - 4 - k));
				Gfx.rect(g, px, py, 1, 1, t.text());
			}
		}
		hand(g, cx, cy, (hours % 12) / 12.0, r * 0.5, t.text());
		hand(g, cx, cy, (hours % 1.0), r * 0.75, t.accent());
		Gfx.roundRect(g, cx - 2, cy - 2, 4, 4, 2, t.accent());
		int y = cy + r + 6;
		Gfx.textCentered(g, ctx.clockText() + "  ·  Day " + ctx.day(), cx, y, t.text());
		int phase = (int) ((ctx.dayTime() / 24000L) % 8);
		Gfx.textCentered(g, (night ? "☽ " : "☀ ") + (night ? MOON[phase] : dt < 6000 ? "Morning" : dt < 12000 ? "Afternoon" : "Evening"), cx, y + 11, t.textDim());
	}

	private void hand(GuiGraphics g, int cx, int cy, double frac, double len, int color) {
		double a = frac * Math.PI * 2;
		for (int i = 0; i < (int) len; i++) {
			int px = cx + (int) Math.round(Math.sin(a) * i);
			int py = cy - (int) Math.round(Math.cos(a) * i);
			Gfx.rect(g, px, py, 2, 2, color);
		}
	}

	private long swElapsed() {
		return swAccum + (swRunning ? Ease.now() - swStart : 0);
	}

	private static String fmt(long ms) {
		return String.format(Locale.ROOT, "%02d:%02d.%02d", ms / 60000, ms / 1000 % 60, ms / 10 % 100);
	}

	private void stopwatch(GuiGraphics g, int w, int h, int top) {
		Theme t = t();
		String s = fmt(swElapsed());
		Gfx.textCenteredScaled(g, s, w / 2, top + 14, 3f, t.text());
		int by = top + 50, bw = 64;
		button(g, w / 2 - bw - 4, by, bw, 18, swRunning ? "Pause" : swElapsed() > 0 ? "Resume" : "Start", true, () -> {
			if (swRunning) {
				swAccum += Ease.now() - swStart;
			} else {
				swStart = Ease.now();
			}
			swRunning = !swRunning;
		});
		button(g, w / 2 + 4, by, bw, 18, swRunning ? "Lap" : "Reset", false, () -> {
			if (swRunning) {
				laps.add(0, swElapsed());
			} else {
				swAccum = 0;
				laps.clear();
			}
		});
		int y = by + 26;
		for (int i = 0; i < laps.size() && y < h - 10; i++) {
			long lap = laps.get(i) - (i + 1 < laps.size() ? laps.get(i + 1) : 0);
			Gfx.text(g, "Lap " + (laps.size() - i), w / 2 - 70, y, t.textDim());
			Gfx.textRight(g, fmt(lap), w / 2 + 70, y, t.text());
			y += 11;
		}
	}

	private long timerLeft() {
		if (timerPausedLeft >= 0) {
			return timerPausedLeft;
		}
		return timerEnd == 0 ? timerSet * 1000L : Math.max(0, timerEnd - Ease.now());
	}

	private void timer(GuiGraphics g, int w, int h, int top) {
		Theme t = t();
		long left = timerLeft();
		boolean running = timerEnd != 0 && timerPausedLeft < 0;
		float frac = timerSet <= 0 ? 0 : left / (timerSet * 1000f);
		int r = Math.max(18, Math.min(w, h - top - 50) / 2 - 8);
		int cx = w / 2, cy = top + 4 + r;
		for (int i = 0; i < 60; i++) {
			double a = i / 60.0 * Math.PI * 2;
			int px = cx + (int) Math.round(Math.sin(a) * r), py = cy - (int) Math.round(Math.cos(a) * r);
			Gfx.rect(g, px - 1, py - 1, 3, 3, i / 60f < frac ? t.accent() : t.border());
		}
		long secs = (left + 999) / 1000;
		String s = String.format(Locale.ROOT, "%d:%02d", secs / 60, secs % 60);
		Gfx.textCenteredScaled(g, s, cx, cy - 8, 2f, timerDone ? t.success() : t.text());
		if (timerDone) {
			Gfx.textCentered(g, "Time's up!", cx, cy + 12, t.success());
		}
		int y = cy + r + 8;
		if (!running && timerPausedLeft < 0) {
			int[] presets = {30, 60, 180, 300, 600};
			int x = w / 2 - presets.length * 22;
			for (int p : presets) {
				String label = p < 60 ? p + "s" : (p / 60) + "m";
				boolean sel = p == timerSet;
				boolean hov = region(g, x, y, 40, 14, () -> {
					timerSet = p;
					timerDone = false;
				});
				Gfx.roundRect(g, x, y, 40, 14, 7, sel ? t.accent() : hov ? t.hover() : t.surface());
				Gfx.textCentered(g, label, x + 20, y + 3, sel ? t.accentText() : t.text());
				x += 44;
			}
			y += 20;
		}
		int bw = 64;
		button(g, w / 2 - bw - 4, y, bw, 18, running ? "Pause" : timerPausedLeft >= 0 ? "Resume" : "Start", true, () -> {
			if (running) {
				timerPausedLeft = timerLeft();
			} else {
				timerEnd = Ease.now() + (timerPausedLeft >= 0 ? timerPausedLeft : timerSet * 1000L);
				timerPausedLeft = -1;
				timerDone = false;
			}
		});
		button(g, w / 2 + 4, y, bw, 18, "Reset", false, () -> {
			timerEnd = 0;
			timerPausedLeft = -1;
			timerDone = false;
		});
	}

	@Override
	public void tick() {
		super.tick();
		if (timerEnd != 0 && timerPausedLeft < 0 && Ease.now() >= timerEnd) {
			timerEnd = 0;
			timerDone = true;
			ctx.playSound(ModSounds.LAPTOP_NOTIFY, 1.2f);
			ctx.notify("info", "Timer finished", "Your " + (timerSet < 60 ? timerSet + " second" : timerSet / 60 + " minute") + " timer is done!");
		}
	}
}
