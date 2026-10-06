package com.laptopcraft.client.os;

import java.util.Locale;

/**
 * Minecraft time helpers. Day time 0 = 06:00, 6000 = noon, 18000 = midnight, 24000 ticks per day.
 */
public final class OSClock {
	private static final String[] MOON_PHASES = {
			"Full Moon", "Waning Gibbous", "Third Quarter", "Waning Crescent",
			"New Moon", "Waxing Crescent", "First Quarter", "Waxing Gibbous"
	};

	private OSClock() {
	}

	public static int hours(long dayTime) {
		return (int) ((Math.floorMod(dayTime, 24000L) / 1000 + 6) % 24);
	}

	public static int minutes(long dayTime) {
		return (int) (Math.floorMod(dayTime, 1000L) * 60 / 1000);
	}

	/** "14:05" (24 h) or "2:05 PM". */
	public static String format(long dayTime, boolean h24) {
		int h = hours(dayTime), m = minutes(dayTime);
		if (h24) {
			return String.format(Locale.ROOT, "%02d:%02d", h, m);
		}
		int h12 = h % 12 == 0 ? 12 : h % 12;
		return String.format(Locale.ROOT, "%d:%02d %s", h12, m, h < 12 ? "AM" : "PM");
	}

	/** Day number starting at 1. */
	public static int day(long dayTime) {
		return (int) (Math.floorDiv(dayTime, 24000L) + 1);
	}

	/** 0..7, 0 = full moon (vanilla order). */
	public static int moonPhase(long dayTime) {
		return (int) Math.floorMod(Math.floorDiv(dayTime, 24000L), 8L);
	}

	public static String moonPhaseName(int phase) {
		return MOON_PHASES[Math.floorMod(phase, 8)];
	}

	/** "Morning", "Afternoon", "Evening" or "Night". */
	public static String partOfDay(long dayTime) {
		int h = hours(dayTime);
		if (h >= 5 && h < 12) {
			return "Morning";
		}
		if (h >= 12 && h < 17) {
			return "Afternoon";
		}
		if (h >= 17 && h < 21) {
			return "Evening";
		}
		return "Night";
	}

	/** Fraction of the day 0..1 starting at midnight (useful for analog clocks). */
	public static float dayFraction(long dayTime) {
		return ((Math.floorMod(dayTime, 24000L) + 6000) % 24000) / 24000f;
	}
}
