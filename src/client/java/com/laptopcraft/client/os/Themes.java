package com.laptopcraft.client.os;

import com.laptopcraft.client.os.ui.Gfx;
import java.util.List;

/**
 * Built-in CubeOS themes and accent presets.
 *
 * <pre>{@code
 * for (Themes.Accent a : Themes.ACCENTS) { ... a.name(), a.color() ... }   // e.g. for the Settings app
 * data.setInt("accent", Themes.ACCENTS.get(2).color());
 * }</pre>
 */
public final class Themes {
	/** Default accent (settings key {@code accent}): CubeOS blue. */
	public static final int DEFAULT_ACCENT = 0xFF3D8BFD;

	/** A named accent color preset. */
	public record Accent(String name, int color) {
	}

	/** Accent presets offered by the Settings app (first = default). */
	public static final List<Accent> ACCENTS = List.of(
			new Accent("Sky Blue", DEFAULT_ACCENT),
			new Accent("Emerald", 0xFF22B55E),
			new Accent("Amethyst", 0xFF9B5CF6),
			new Accent("Redstone", 0xFFE5484D),
			new Accent("Copper", 0xFFE8803A),
			new Accent("Gold", 0xFFF2B33D),
			new Accent("Cherry", 0xFFEC6FA9),
			new Accent("Prismarine", 0xFF1FB5A8),
			new Accent("Lapis", 0xFF3B5BDB),
			new Accent("Slate", 0xFF6B7A90));

	private static final int MAX_CACHE = 16;
	private static final java.util.Map<Long, Theme> CACHE = new java.util.LinkedHashMap<>(16, 0.75f, true) {
		@Override
		protected boolean removeEldestEntry(java.util.Map.Entry<Long, Theme> eldest) {
			return size() > MAX_CACHE;
		}
	};

	private Themes() {
	}

	/** Theme for the given mode and accent (cached). */
	public static Theme of(boolean dark, int accent) {
		accent |= 0xFF000000;
		long key = ((long) accent & 0xFFFFFFFFL) | (dark ? 1L << 32 : 0L);
		Theme t = CACHE.get(key);
		if (t == null) {
			t = dark ? build(true, accent) : build(false, accent);
			CACHE.put(key, t);
		}
		return t;
	}

	/** Dark theme with the given accent. */
	public static Theme dark(int accent) {
		return of(true, accent);
	}

	/** Light theme with the given accent. */
	public static Theme light(int accent) {
		return of(false, accent);
	}

	private static Theme build(boolean dark, int accent) {
		int accentText = Gfx.luminance(accent) > 0.6f ? 0xFF111111 : 0xFFFFFFFF;
		if (dark) {
			return new Impl(true, accent, accentText,
					0xFF1F2023, 0xFF2A2C31, 0xFF24262A, 0xFF3A3D44,
					0xFFE9EAEC, 0xFF9DA3AD, 0xFFFFFFFF,
					0xFF2C2E33, 0xFF222428,
					0x1CFFFFFF, Gfx.withAlpha(accent, 0x66),
					0xFFF2555A, 0xFF3DD68C, 0xFFF5B94A, Gfx.lighten(accent, 0.35f),
					0xFF17181B, 0xFF5A5E66, 0x30FFFFFF, 0xF0141518);
		}
		return new Impl(false, accent, accentText,
				0xFFF6F7F9, 0xFFFFFFFF, 0xFFEEF0F3, 0xFFD5D9DF,
				0xFF1D2127, 0xFF5F6874, 0xFFFFFFFF,
				0xFFE9ECF0, 0xFFF3F4F6,
				0x14000000, Gfx.withAlpha(accent, 0x4C),
				0xFFD92D35, 0xFF15924F, 0xFFC07D00, Gfx.darken(accent, 0.15f),
				0xFFFFFFFF, 0xFFB4BAC3, 0x24000000, 0xF0FFFFFF);
	}

	private record Impl(boolean dark, int accent, int accentText,
			int bg, int surface, int surfaceAlt, int border,
			int text, int textDim, int textOnDark,
			int titleBar, int titleBarInactive,
			int hover, int selection,
			int danger, int success, int warning, int link,
			int inputBg, int scrollbar, int pressed, int tooltipBg) implements Theme {
	}
}
