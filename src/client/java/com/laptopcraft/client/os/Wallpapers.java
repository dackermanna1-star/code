package com.laptopcraft.client.os;

import com.laptopcraft.client.os.ui.Gfx;
import java.util.List;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.resources.Identifier;

/**
 * Desktop wallpapers. A wallpaper id is either
 * <ul>
 *   <li>a picture name from {@link #ALL} → {@code laptopcraft:textures/gui/wallpapers/<id>.png} (16:9),</li>
 *   <li>{@code "solid:AARRGGBB"} — a plain color, or</li>
 *   <li>{@code "gradient:AARRGGBB:AARRGGBB"} — a vertical gradient (top, bottom).</li>
 * </ul>
 * {@link #render} draws any of them "cover"-scaled into a rectangle (handy for Settings previews too).
 */
public final class Wallpapers {
	/** A picture wallpaper. */
	public record Wallpaper(String id, String name) {
	}

	/** All picture wallpapers (default first). */
	public static final List<Wallpaper> ALL = List.of(
			new Wallpaper("meadow", "Meadow"),
			new Wallpaper("sunset", "Sunset"),
			new Wallpaper("night", "Starry Night"),
			new Wallpaper("ocean", "Ocean"),
			new Wallpaper("cherry", "Cherry Grove"),
			new Wallpaper("snowy", "Snowy Peaks"),
			new Wallpaper("desert", "Desert"),
			new Wallpaper("aurora", "Aurora"),
			new Wallpaper("nether", "The Nether"),
			new Wallpaper("the_end", "The End"));

	/** Ready-made color wallpapers for the Settings app. */
	public static final List<String> COLOR_PRESETS = List.of(
			"gradient:FF1E3C72:FF2A5298",
			"gradient:FF614385:FF516395",
			"gradient:FF11998E:FF38EF7D",
			"gradient:FFFF7E5F:FFFEB47B",
			"gradient:FF232526:FF414345",
			"solid:FF2B2D42",
			"solid:FF0F766E",
			"solid:FF7C2D12");

	private static final int TEX_W = 960;
	private static final int TEX_H = 540;

	private Wallpapers() {
	}

	/** Texture of a picture wallpaper id. */
	public static Identifier texture(String id) {
		return Identifier.fromNamespaceAndPath("laptopcraft", "textures/gui/wallpapers/" + id + ".png");
	}

	/** Display name of a wallpaper id ("Meadow", "Color"). */
	public static String displayName(String id) {
		for (Wallpaper w : ALL) {
			if (w.id().equals(id)) {
				return w.name();
			}
		}
		return id.startsWith("solid:") || id.startsWith("gradient:") ? "Color" : id;
	}

	private static int parseColor(String hex, int def) {
		try {
			return (int) Long.parseLong(hex.trim(), 16) | (hex.trim().length() <= 6 ? 0xFF000000 : 0);
		} catch (NumberFormatException e) {
			return def;
		}
	}

	/** Draws the wallpaper covering (x, y, w, h). */
	public static void render(GuiGraphics g, String id, int x, int y, int w, int h) {
		if (id.startsWith("solid:")) {
			Gfx.rect(g, x, y, w, h, parseColor(id.substring(6), 0xFF2B2D42));
			return;
		}
		if (id.startsWith("gradient:")) {
			String[] p = id.substring(9).split(":");
			int top = parseColor(p.length > 0 ? p[0] : "", 0xFF1E3C72);
			int bottom = parseColor(p.length > 1 ? p[1] : "", 0xFF2A5298);
			Gfx.gradientV(g, x, y, w, h, top, bottom);
			return;
		}
		Identifier tex = texture(id);
		if (!Gfx.textureExists(tex)) {
			renderFallback(g, id, x, y, w, h);
			return;
		}
		// "cover": crop the 16:9 texture to the target aspect ratio
		float targetAspect = w / (float) Math.max(1, h);
		float texAspect = TEX_W / (float) TEX_H;
		float u = 0, v = 0, uw = TEX_W, vh = TEX_H;
		if (targetAspect > texAspect) {
			vh = TEX_W / targetAspect;
			v = (TEX_H - vh) / 2f;
		} else {
			uw = TEX_H * targetAspect;
			u = (TEX_W - uw) / 2f;
		}
		Gfx.textureRegion(g, tex, x, y, w, h, u, v, Math.round(uw), Math.round(vh), TEX_W, TEX_H, 0xFFFFFFFF);
	}

	/** Gradient with simple pixel hills used while a wallpaper texture is missing. */
	private static void renderFallback(GuiGraphics g, String id, int x, int y, int w, int h) {
		int[] c = switch (id) {
			case "sunset" -> new int[] {0xFFFF9A5A, 0xFF8E3B76, 0xFF3B1E4A};
			case "night" -> new int[] {0xFF0B1030, 0xFF1D2A5C, 0xFF0A0F22};
			case "ocean" -> new int[] {0xFF6FD3F7, 0xFF1E7FC2, 0xFF0B3C6E};
			case "nether" -> new int[] {0xFF5A0E0E, 0xFF8E2B12, 0xFF2A0606};
			case "the_end" -> new int[] {0xFF1A0F2E, 0xFF3D2366, 0xFFE6E2B0};
			case "cherry" -> new int[] {0xFFFFD6E8, 0xFFF59AC4, 0xFF6BA65A};
			case "snowy" -> new int[] {0xFFD9ECFF, 0xFFA9C6E8, 0xFFF4F8FF};
			case "desert" -> new int[] {0xFFFFD58A, 0xFFF2A65A, 0xFFE3C07A};
			case "aurora" -> new int[] {0xFF0C1B33, 0xFF1F8A70, 0xFF0A1424};
			default -> new int[] {0xFF8FD3FF, 0xFFCFEFFF, 0xFF5DBB4C};
		};
		Gfx.gradientV(g, x, y, w, h * 2 / 3, c[0], c[1]);
		Gfx.gradientV(g, x, y + h * 2 / 3, w, h - h * 2 / 3, c[1], Gfx.darken(c[1], 0.2f));
		// blocky hills
		int step = Math.max(8, w / 24);
		for (int i = 0; i * step < w; i++) {
			double n = Math.sin(i * 0.55 + id.length()) * 0.5 + Math.sin(i * 0.23 + 1.7) * 0.5;
			int hh = (int) (h * 0.18 + n * h * 0.07);
			Gfx.rect(g, x + i * step, y + h - hh, Math.min(step, w - i * step), hh, c[2]);
			Gfx.rect(g, x + i * step, y + h - hh, Math.min(step, w - i * step), 2, Gfx.lighten(c[2], 0.15f));
		}
	}
}
