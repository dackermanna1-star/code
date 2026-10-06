package com.laptopcraft.client.os;

/**
 * Standard setting keys (stored in the "settings" compound via {@link OSData#getString} etc.) and
 * typed accessors with the documented defaults. Changes apply live: the OS re-reads them every frame.
 */
public final class OSSettings {
	/** Display name on the lock screen / start menu. Default: laptop owner name. */
	public static final String USERNAME = "username";
	/** Wallpaper id: a name from {@link Wallpapers#ALL}, "solid:AARRGGBB" or "gradient:AARRGGBB:AARRGGBB". */
	public static final String WALLPAPER = "wallpaper";
	/** "dark" or "light". */
	public static final String THEME = "theme";
	/** Accent color (ARGB int). */
	public static final String ACCENT = "accent";
	/** 24 hour clock (bool, default true). */
	public static final String CLOCK_24H = "clock24h";
	/** UI sounds (bool, default true). */
	public static final String SOUNDS = "sounds";
	/** Lock screen password (empty = none). */
	public static final String PASSWORD = "password";
	/** Browser home page (default "bloogle.mc"). */
	public static final String HOMEPAGE = "homepage";
	/** Show icons on the desktop (bool, default true). */
	public static final String SHOW_DESKTOP_ICONS = "showDesktopIcons";

	public static final String DEFAULT_WALLPAPER = "meadow";
	public static final String DEFAULT_HOMEPAGE = "bloogle.mc";

	private OSSettings() {
	}

	/** Wallpaper id (default {@value #DEFAULT_WALLPAPER}). */
	public static String wallpaper(OSData d) {
		String w = d.getString(WALLPAPER, DEFAULT_WALLPAPER);
		return w.isEmpty() ? DEFAULT_WALLPAPER : w;
	}

	/** True unless the theme is "light". */
	public static boolean dark(OSData d) {
		return !"light".equals(d.getString(THEME, "dark"));
	}

	/** Accent color (ARGB). */
	public static int accent(OSData d) {
		return d.getInt(ACCENT, Themes.DEFAULT_ACCENT) | 0xFF000000;
	}

	/** 24 hour clock (default true). */
	public static boolean clock24h(OSData d) {
		return d.getBool(CLOCK_24H, true);
	}

	/** UI sounds (default true). */
	public static boolean sounds(OSData d) {
		return d.getBool(SOUNDS, true);
	}

	/** Lock screen password ("" = none). */
	public static String password(OSData d) {
		return d.getString(PASSWORD, "");
	}

	/** Browser home page. */
	public static String homepage(OSData d) {
		String h = d.getString(HOMEPAGE, DEFAULT_HOMEPAGE);
		return h.isBlank() ? DEFAULT_HOMEPAGE : h;
	}

	/** Desktop icons visible (default true). */
	public static boolean showDesktopIcons(OSData d) {
		return d.getBool(SHOW_DESKTOP_ICONS, true);
	}

	/** User name, falling back to the owner name. */
	public static String username(OSData d, String owner) {
		String u = d.getString(USERNAME, owner);
		return u.isBlank() ? owner : u;
	}
}
