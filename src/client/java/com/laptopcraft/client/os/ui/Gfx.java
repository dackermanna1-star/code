package com.laptopcraft.client.os.ui;

import com.mojang.blaze3d.platform.cursor.CursorTypes;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.resources.Identifier;
import net.minecraft.world.item.ItemStack;
import org.joml.Vector2f;

/**
 * Static drawing helpers used by the whole OS. All coordinates are in the current pose space
 * (inside an app: local content coordinates). Colors are ARGB — always include alpha.
 *
 * <p>Rounded rectangles are "pixel rounded" (no anti aliasing) which matches the Minecraft look.
 * Text helpers draw without shadow unless the name says otherwise. Missing icon textures are
 * replaced by a generated letter tile, so a missing PNG never shows the magenta checkerboard.
 */
public final class Gfx {
	/** Corner pixel insets per radius (index = radius). */
	private static final int[][] CORNERS = {
			{},
			{1},
			{2, 1},
			{3, 1, 1},
			{4, 2, 1, 1},
			{5, 3, 2, 1, 1},
			{6, 4, 3, 2, 1, 1},
	};

	/** Corner masks for {@link #roundRect(GuiGraphics, int, int, int, int, int, int, int)}. */
	public static final int TOP_LEFT = 1, TOP_RIGHT = 2, BOTTOM_LEFT = 4, BOTTOM_RIGHT = 8;
	public static final int TOP = TOP_LEFT | TOP_RIGHT, BOTTOM = BOTTOM_LEFT | BOTTOM_RIGHT, ALL = TOP | BOTTOM;

	/** 9×9 emerald glyph texture. */
	public static final Identifier EMERALD_TEXTURE = Identifier.fromNamespaceAndPath("laptopcraft", "textures/gui/os/emerald.png");

	private static final Map<Identifier, Boolean> EXISTS = new HashMap<>();
	private static final Map<Identifier, int[]> SIZES = new HashMap<>();
	private static final Map<String, List<String>> WRAP_CACHE = lru(512);
	private static final Map<String, String> ELLIPSIS_CACHE = lru(1024);
	private static final Vector2f TMP = new Vector2f();

	/** Pixel map of the fallback emerald glyph (9x9). */
	private static final String[] EMERALD_PIXELS = {
			"...aaa...",
			"..abbba..",
			".abccbba.",
			"abccbbbda",
			"abcbbbbda",
			"abbbbbdda",
			".abbbdda.",
			"..addda..",
			"...aaa...",
	};

	private static final int[] FALLBACK_COLORS = {
			0xFF3D8BFD, 0xFF22B55E, 0xFF9B5CF6, 0xFFE5484D, 0xFFE8803A, 0xFF1FB5A8, 0xFFEC6FA9, 0xFF6B7A90, 0xFFF2B33D,
	};

	private Gfx() {
	}

	private static <V> Map<String, V> lru(int max) {
		return new LinkedHashMap<>(64, 0.75f, true) {
			@Override
			protected boolean removeEldestEntry(Map.Entry<String, V> eldest) {
				return size() > max;
			}
		};
	}

	private static Font font() {
		return Minecraft.getInstance().font;
	}

	// ------------------------------------------------------------------------------------------ shapes

	/** Filled rectangle (skipped if fully transparent). */
	public static void rect(GuiGraphics g, int x, int y, int w, int h, int color) {
		if (w > 0 && h > 0 && (color >>> 24) != 0) {
			g.fill(x, y, x + w, y + h, color);
		}
	}

	/** 1px outline inside the rectangle. */
	public static void border(GuiGraphics g, int x, int y, int w, int h, int color) {
		if (w <= 0 || h <= 0) {
			return;
		}
		rect(g, x, y, w, 1, color);
		rect(g, x, y + h - 1, w, 1, color);
		rect(g, x, y + 1, 1, h - 2, color);
		rect(g, x + w - 1, y + 1, 1, h - 2, color);
	}

	/** 1px horizontal line. */
	public static void hline(GuiGraphics g, int x, int y, int w, int color) {
		rect(g, x, y, w, 1, color);
	}

	/** 1px vertical line. */
	public static void vline(GuiGraphics g, int x, int y, int h, int color) {
		rect(g, x, y, 1, h, color);
	}

	private static int[] corner(int radius, int w, int h) {
		int r = Math.max(0, Math.min(radius, Math.min(Math.min(w, h) / 2, CORNERS.length - 1)));
		return CORNERS[r];
	}

	/** Filled rectangle with pixel-rounded corners (radius 0–6). */
	public static void roundRect(GuiGraphics g, int x, int y, int w, int h, int radius, int color) {
		roundRect(g, x, y, w, h, radius, color, ALL);
	}

	/** Filled rounded rectangle; {@code corners} is a mask of {@link #TOP_LEFT} etc. */
	public static void roundRect(GuiGraphics g, int x, int y, int w, int h, int radius, int color, int corners) {
		if (w <= 0 || h <= 0 || (color >>> 24) == 0) {
			return;
		}
		int[] c = corner(radius, w, h);
		int r = c.length;
		if (r == 0) {
			rect(g, x, y, w, h, color);
			return;
		}
		boolean tl = (corners & TOP_LEFT) != 0, tr = (corners & TOP_RIGHT) != 0;
		boolean bl = (corners & BOTTOM_LEFT) != 0, br = (corners & BOTTOM_RIGHT) != 0;
		boolean topRound = tl || tr, bottomRound = bl || br;
		int top = topRound ? r : 0;
		int bottom = bottomRound ? r : 0;
		// middle block
		rect(g, x, y + top, w, h - top - bottom, color);
		for (int i = 0; i < r; i++) {
			if (topRound) {
				int l = tl ? c[i] : 0, rr = tr ? c[i] : 0;
				rect(g, x + l, y + i, w - l - rr, 1, color);
			}
			if (bottomRound) {
				int l = bl ? c[i] : 0, rr = br ? c[i] : 0;
				rect(g, x + l, y + h - 1 - i, w - l - rr, 1, color);
			}
		}
	}

	/** 1px rounded outline matching {@link #roundRect}. */
	public static void roundBorder(GuiGraphics g, int x, int y, int w, int h, int radius, int color) {
		if (w <= 0 || h <= 0 || (color >>> 24) == 0) {
			return;
		}
		int[] c = corner(radius, w, h);
		int r = c.length;
		if (r == 0) {
			border(g, x, y, w, h, color);
			return;
		}
		// straight edges
		rect(g, x + c[0], y, w - 2 * c[0], 1, color);
		rect(g, x + c[0], y + h - 1, w - 2 * c[0], 1, color);
		rect(g, x, y + r, 1, h - 2 * r, color);
		rect(g, x + w - 1, y + r, 1, h - 2 * r, color);
		// corner runs
		for (int i = 1; i < r; i++) {
			int from = c[i];
			int to = Math.max(c[i - 1], from + 1);
			int len = to - from;
			rect(g, x + from, y + i, len, 1, color);
			rect(g, x + w - to, y + i, len, 1, color);
			rect(g, x + from, y + h - 1 - i, len, 1, color);
			rect(g, x + w - to, y + h - 1 - i, len, 1, color);
		}
	}

	/** Rounded panel: fill + 1px border. */
	public static void panel(GuiGraphics g, int x, int y, int w, int h, int radius, int fill, int borderColor) {
		roundRect(g, x, y, w, h, radius, fill);
		roundBorder(g, x, y, w, h, radius, borderColor);
	}

	/** Vertical gradient. */
	public static void gradientV(GuiGraphics g, int x, int y, int w, int h, int top, int bottom) {
		if (w > 0 && h > 0) {
			g.fillGradient(x, y, x + w, y + h, top, bottom);
		}
	}

	/** Horizontal gradient (approximated with vertical strips; fine for backgrounds and bars). */
	public static void gradientH(GuiGraphics g, int x, int y, int w, int h, int left, int right) {
		if (w <= 0 || h <= 0) {
			return;
		}
		int steps = Math.min(w, 48);
		for (int i = 0; i < steps; i++) {
			int x0 = x + w * i / steps;
			int x1 = x + w * (i + 1) / steps;
			rect(g, x0, y, x1 - x0, h, lerp(left, right, steps == 1 ? 0f : i / (float) (steps - 1)));
		}
	}

	/** Soft drop shadow around (outside) the rectangle; {@code size} 2–10 px. */
	public static void shadow(GuiGraphics g, int x, int y, int w, int h, int size) {
		shadow(g, x, y, w, h, size, 0x50);
	}

	/**
	 * Soft drop shadow with a custom maximum alpha (0–255), offset 1px downwards. Drawn as stacked
	 * translucent rounded layers so corners stay round; draw it before the (opaque) shape itself.
	 */
	public static void shadow(GuiGraphics g, int x, int y, int w, int h, int size, int maxAlpha) {
		if (w <= 0 || h <= 0 || size <= 0 || maxAlpha <= 0) {
			return;
		}
		int oy = 1;
		float max = Math.min(255, maxAlpha) / 255f;
		float nextTotal = 0f;
		for (int d = size; d >= 1; d--) {
			float f = (size - d + 1) / (float) (size + 1);
			float total = max * f * f;
			// alpha of this layer so that the composited coverage at distance d equals "total"
			float a = 1f - (1f - total) / Math.max(0.0001f, 1f - nextTotal);
			nextTotal = total;
			int ai = Math.round(a * 255f);
			if (ai <= 0) {
				continue;
			}
			roundRect(g, x - d, y - d + oy, w + 2 * d, h + 2 * d, Math.min(6, 2 + d / 2), ai << 24);
		}
	}

	/** Horizontal progress bar with rounded ends. {@code progress} 0..1. */
	public static void progressBar(GuiGraphics g, int x, int y, int w, int h, float progress, int track, int fill) {
		int r = Math.min(h / 2, 3);
		roundRect(g, x, y, w, h, r, track);
		int fw = Math.round(w * Ease.clamp01(progress));
		if (fw > 0) {
			roundRect(g, x, y, Math.max(fw, Math.min(w, r * 2)), h, r, fill);
		}
	}

	/** Animated ring of 8 dots (loading spinner) centered at (cx, cy). */
	public static void spinner(GuiGraphics g, int cx, int cy, int radius, int color) {
		long t = Ease.now();
		int head = (int) ((t / 90) % 8);
		int dot = radius >= 8 ? 2 : 1;
		for (int i = 0; i < 8; i++) {
			double ang = Math.PI * 2 * i / 8.0 - Math.PI / 2;
			int px = cx + (int) Math.round(Math.cos(ang) * radius) - dot / 2;
			int py = cy + (int) Math.round(Math.sin(ang) * radius) - dot / 2;
			int age = Math.floorMod(head - i, 8);
			float a = Math.max(0.15f, 1f - age / 7f);
			rect(g, px, py, dot, dot, withAlpha(color, Math.round(((color >>> 24) & 0xFF) * a)));
		}
	}

	// ------------------------------------------------------------------------------------------ text

	/** Pixel width of a string in the Minecraft font. */
	public static int width(String str) {
		return font().width(str);
	}

	/** Text without shadow. */
	public static void text(GuiGraphics g, String str, int x, int y, int color) {
		g.drawString(font(), str, x, y, color, false);
	}

	/** Text with the vanilla drop shadow. */
	public static void textShadow(GuiGraphics g, String str, int x, int y, int color) {
		g.drawString(font(), str, x, y, color, true);
	}

	/** Text centered on {@code cx}. */
	public static void textCentered(GuiGraphics g, String str, int cx, int y, int color) {
		g.drawString(font(), str, cx - font().width(str) / 2, y, color, false);
	}

	/** Centered text with shadow. */
	public static void textCenteredShadow(GuiGraphics g, String str, int cx, int y, int color) {
		g.drawString(font(), str, cx - font().width(str) / 2, y, color, true);
	}

	/** Right-aligned text ending at {@code rx}. */
	public static void textRight(GuiGraphics g, String str, int rx, int y, int color) {
		g.drawString(font(), str, rx - font().width(str), y, color, false);
	}

	/** Draws text cut to {@code maxW} pixels with a trailing ellipsis. */
	public static void textClipped(GuiGraphics g, String str, int x, int y, int maxW, int color) {
		g.drawString(font(), ellipsize(str, maxW), x, y, color, false);
	}

	/** Clipped text with shadow. */
	public static void textClippedShadow(GuiGraphics g, String str, int x, int y, int maxW, int color) {
		g.drawString(font(), ellipsize(str, maxW), x, y, color, true);
	}

	/** Text scaled around its top-left corner. Prefer integer scales for crisp text. */
	public static void textScaled(GuiGraphics g, String str, int x, int y, float scale, int color) {
		g.pose().pushMatrix();
		g.pose().translate(x, y);
		g.pose().scale(scale, scale);
		g.drawString(font(), str, 0, 0, color, false);
		g.pose().popMatrix();
	}

	/** Scaled text with shadow. */
	public static void textScaledShadow(GuiGraphics g, String str, int x, int y, float scale, int color) {
		g.pose().pushMatrix();
		g.pose().translate(x, y);
		g.pose().scale(scale, scale);
		g.drawString(font(), str, 0, 0, color, true);
		g.pose().popMatrix();
	}

	/** Scaled text centered on {@code cx}. */
	public static void textCenteredScaled(GuiGraphics g, String str, int cx, int y, float scale, int color) {
		int w = Math.round(font().width(str) * scale);
		textScaled(g, str, cx - w / 2, y, scale, color);
	}

	/** Scaled centered text with shadow. */
	public static void textCenteredScaledShadow(GuiGraphics g, String str, int cx, int y, float scale, int color) {
		int w = Math.round(font().width(str) * scale);
		textScaledShadow(g, str, cx - w / 2, y, scale, color);
	}

	/** Draws word-wrapped text and returns the height used (lines × lineHeight). */
	public static int textWrapped(GuiGraphics g, String str, int x, int y, int width, int lineHeight, int color) {
		List<String> lines = wrap(font(), str, width);
		for (int i = 0; i < lines.size(); i++) {
			g.drawString(font(), lines.get(i), x, y + i * lineHeight, color, false);
		}
		return lines.size() * lineHeight;
	}

	/**
	 * Draws a text link: underlined + pointing-hand cursor while hovered. Returns true if hovered
	 * (so the caller can handle the click with the same hit box: x, y-1, width(text), 11).
	 */
	public static boolean link(GuiGraphics g, String str, int x, int y, int color, int mouseX, int mouseY) {
		int w = width(str);
		boolean hov = hovered(mouseX, mouseY, x, y - 1, w, 11);
		text(g, str, x, y, color);
		if (hov) {
			rect(g, x, y + 9, w, 1, color);
			g.requestCursor(CursorTypes.POINTING_HAND);
		}
		return hov;
	}

	/** Cut {@code str} to {@code maxW} pixels, appending "…" if it had to be shortened (cached). */
	public static String ellipsize(String str, int maxW) {
		if (str == null || str.isEmpty()) {
			return "";
		}
		Font f = font();
		if (f.width(str) <= maxW) {
			return str;
		}
		String key = maxW + "\u0000" + str;
		String cached = ELLIPSIS_CACHE.get(key);
		if (cached != null) {
			return cached;
		}
		int ew = f.width("…");
		String cut = maxW <= ew ? "" : f.plainSubstrByWidth(str, maxW - ew);
		String out = cut.stripTrailing() + "…";
		ELLIPSIS_CACHE.put(key, out);
		return out;
	}

	/**
	 * Greedy word wrap. Honors '\n'. Words longer than the width are broken. Results are cached, so
	 * calling this every frame is cheap. The returned list must not be modified.
	 */
	public static List<String> wrap(Font font, String str, int width) {
		if (str == null) {
			return List.of();
		}
		String key = width + "\u0000" + str;
		List<String> cached = WRAP_CACHE.get(key);
		if (cached != null) {
			return cached;
		}
		List<String> out = new ArrayList<>();
		width = Math.max(width, 8);
		for (String para : str.split("\n", -1)) {
			wrapParagraph(font, para, width, out);
		}
		List<String> result = List.copyOf(out);
		WRAP_CACHE.put(key, result);
		return result;
	}

	private static void wrapParagraph(Font font, String para, int width, List<String> out) {
		if (para.isEmpty()) {
			out.add("");
			return;
		}
		StringBuilder line = new StringBuilder();
		int lineW = 0;
		int spaceW = font.width(" ");
		for (String word : para.split(" ", -1)) {
			int ww = font.width(word);
			if (line.length() > 0 && lineW + spaceW + ww <= width) {
				line.append(' ').append(word);
				lineW += spaceW + ww;
				continue;
			}
			if (line.length() > 0 || (lineW > 0)) {
				out.add(line.toString());
				line.setLength(0);
				lineW = 0;
			}
			// word alone on a new line; break it if too long
			String rest = word;
			while (font.width(rest) > width) {
				String head = font.plainSubstrByWidth(rest, width);
				if (head.isEmpty()) {
					head = rest.substring(0, 1);
				}
				out.add(head);
				rest = rest.substring(head.length());
			}
			line.append(rest);
			lineW = font.width(rest);
		}
		out.add(line.toString());
	}

	/** Convenience: {@link #wrap(Font, String, int)} with the Minecraft font. */
	public static List<String> wrap(String str, int width) {
		return wrap(font(), str, width);
	}

	// ------------------------------------------------------------------------------------------ textures

	/** True if a resource exists for the texture id (cached until {@link #clearTextureCache()}). */
	public static boolean textureExists(Identifier id) {
		Boolean b = EXISTS.get(id);
		if (b == null) {
			b = Minecraft.getInstance().getResourceManager().getResource(id).isPresent();
			EXISTS.put(id, b);
		}
		return b;
	}

	/** Forget cached texture existence (called when the laptop screen opens). */
	public static void clearTextureCache() {
		EXISTS.clear();
		SIZES.clear();
	}

	/**
	 * Pixel size {width, height} of a texture (loads it if needed); {0, 0} if it does not exist.
	 * Useful to keep the aspect ratio of logos: {@code int[] s = Gfx.textureSize(id);}.
	 */
	public static int[] textureSize(Identifier id) {
		int[] cached = SIZES.get(id);
		if (cached != null) {
			return cached;
		}
		int[] size = {0, 0};
		if (textureExists(id)) {
			try {
				var tex = Minecraft.getInstance().getTextureManager().getTexture(id).getTexture();
				size = new int[] {tex.getWidth(0), tex.getHeight(0)};
			} catch (RuntimeException e) {
				size = new int[] {0, 0};
			}
		}
		SIZES.put(id, size);
		return size;
	}

	/** Draws a texture scaled to fit inside (x, y, maxW, maxH) keeping its aspect ratio (left/top aligned). Returns drawn width. */
	public static int textureFit(GuiGraphics g, Identifier id, int x, int y, int maxW, int maxH) {
		int[] s = textureSize(id);
		if (s[0] <= 0 || s[1] <= 0) {
			return 0;
		}
		float scale = Math.min(maxW / (float) s[0], maxH / (float) s[1]);
		int w = Math.max(1, Math.round(s[0] * scale));
		int h = Math.max(1, Math.round(s[1] * scale));
		texture(g, id, x, y + (maxH - h) / 2, w, h, 0xFFFFFFFF);
		return w;
	}

	/** Draws a square texture (e.g. a 32×32 icon) scaled to {@code size}. Missing textures get a letter tile. */
	public static void icon(GuiGraphics g, Identifier id, int x, int y, int size) {
		icon(g, id, x, y, size, 0xFFFFFFFF);
	}

	/** Icon tinted/faded with an ARGB multiplier (use {@code withAlpha(0xFFFFFFFF, a)} to fade). */
	public static void icon(GuiGraphics g, Identifier id, int x, int y, int size, int tint) {
		if (textureExists(id)) {
			g.blit(RenderPipelines.GUI_TEXTURED, id, x, y, 0f, 0f, size, size, size, size, size, size, tint);
		} else {
			fallbackIcon(g, id, x, y, size, (tint >>> 24) & 0xFF);
		}
	}

	/** Generated replacement for a missing icon: colored rounded tile with the first letter. */
	public static void fallbackIcon(GuiGraphics g, Identifier id, int x, int y, int size, int alpha) {
		String path = id.getPath();
		int slash = path.lastIndexOf('/');
		String name = path.substring(slash + 1).replace(".png", "");
		int col = FALLBACK_COLORS[Math.floorMod(name.hashCode(), FALLBACK_COLORS.length)];
		int inset = Math.max(0, size / 16);
		roundRect(g, x + inset, y + inset, size - inset * 2, size - inset * 2, Math.max(1, size / 6), withAlpha(col, alpha));
		String letter = name.isEmpty() ? "?" : name.substring(0, 1).toUpperCase(Locale.ROOT);
		int scale = size >= 28 ? 2 : 1;
		int tw = font().width(letter) * scale;
		if (size >= 10) {
			textScaled(g, letter, x + (size - tw) / 2 + (scale == 1 ? 1 : 0), y + (size - 8 * scale) / 2, scale, withAlpha(0xFFFFFFFF, alpha));
		}
	}

	/** Draws the whole texture stretched to w×h ({@code texW/texH} are the texture's pixel size). */
	public static void texture(GuiGraphics g, Identifier id, int x, int y, int w, int h, int texW, int texH) {
		g.blit(RenderPipelines.GUI_TEXTURED, id, x, y, 0f, 0f, w, h, texW, texH, texW, texH);
	}

	/** Whole texture stretched to w×h with an ARGB tint/alpha. */
	public static void texture(GuiGraphics g, Identifier id, int x, int y, int w, int h, int tint) {
		g.blit(RenderPipelines.GUI_TEXTURED, id, x, y, 0f, 0f, w, h, 1, 1, 1, 1, tint);
	}

	/** Part of a texture: region (u, v, uw, vh) of a texW×texH texture drawn into w×h. */
	public static void textureRegion(GuiGraphics g, Identifier id, int x, int y, int w, int h, float u, float v, int uw, int vh, int texW, int texH, int tint) {
		g.blit(RenderPipelines.GUI_TEXTURED, id, x, y, u, v, w, h, uw, vh, texW, texH, tint);
	}

	/** Renders an item stack (16×16). */
	public static void item(GuiGraphics g, ItemStack stack, int x, int y) {
		g.renderItem(stack, x, y);
	}

	/** Item scaled around (x, y); size on screen is 16 × scale. */
	public static void itemScaled(GuiGraphics g, ItemStack stack, int x, int y, float scale) {
		g.pose().pushMatrix();
		g.pose().translate(x, y);
		g.pose().scale(scale, scale);
		g.renderItem(stack, 0, 0);
		g.pose().popMatrix();
	}

	/** 9×9 emerald glyph used next to prices. */
	public static void emerald(GuiGraphics g, int x, int y) {
		if (textureExists(EMERALD_TEXTURE)) {
			g.blit(RenderPipelines.GUI_TEXTURED, EMERALD_TEXTURE, x, y, 0f, 0f, 9, 9, 9, 9);
			return;
		}
		for (int row = 0; row < 9; row++) {
			String line = EMERALD_PIXELS[row];
			for (int col = 0; col < 9; col++) {
				int c = switch (line.charAt(col)) {
					case 'a' -> 0xFF0B5E2A;
					case 'b' -> 0xFF2FD16A;
					case 'c' -> 0xFFB8FFD0;
					case 'd' -> 0xFF17994A;
					default -> 0;
				};
				if (c != 0) {
					rect(g, x + col, y + row, 1, 1, c);
				}
			}
		}
	}

	/** Draws the emerald glyph followed by the amount; returns the total width. */
	public static int price(GuiGraphics g, int amount, int x, int y, int color) {
		emerald(g, x, y);
		String s = formatNumber(amount);
		g.drawString(font(), s, x + 11, y + 1, color, false);
		return 11 + font().width(s);
	}

	/** Width that {@link #price} will use. */
	public static int priceWidth(int amount) {
		return 11 + font().width(formatNumber(amount));
	}

	/** 1234567 → "1,234,567". */
	public static String formatNumber(long n) {
		return String.format(Locale.ROOT, "%,d", n);
	}

	// ------------------------------------------------------------------------------------------ colors

	/** Replaces the alpha channel (0–255). */
	public static int withAlpha(int color, int alpha) {
		return (Math.max(0, Math.min(255, alpha)) << 24) | (color & 0xFFFFFF);
	}

	/** Multiplies the existing alpha by {@code f} (0..1). */
	public static int fade(int color, float f) {
		int a = (color >>> 24) & 0xFF;
		return withAlpha(color, Math.round(a * Ease.clamp01(f)));
	}

	/** Linear interpolation of two ARGB colors (all channels). */
	public static int lerp(int a, int b, float t) {
		t = Ease.clamp01(t);
		int aa = (a >>> 24) & 0xFF, ar = (a >> 16) & 0xFF, ag = (a >> 8) & 0xFF, ab = a & 0xFF;
		int ba = (b >>> 24) & 0xFF, br = (b >> 16) & 0xFF, bg = (b >> 8) & 0xFF, bb = b & 0xFF;
		return (Math.round(aa + (ba - aa) * t) << 24) | (Math.round(ar + (br - ar) * t) << 16)
				| (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
	}

	/** Darker color, {@code amount} 0..1. */
	public static int darken(int color, float amount) {
		return lerp(color, color & 0xFF000000, amount);
	}

	/** Lighter color, {@code amount} 0..1. */
	public static int lighten(int color, float amount) {
		return lerp(color, color | 0x00FFFFFF, amount);
	}

	/** Relative luminance 0..1 (sRGB approximation). */
	public static float luminance(int color) {
		float r = ((color >> 16) & 0xFF) / 255f, g = ((color >> 8) & 0xFF) / 255f, b = (color & 0xFF) / 255f;
		return 0.2126f * r + 0.7152f * g + 0.0722f * b;
	}

	/** Black or white, whichever reads better on {@code background}. */
	public static int contrastText(int background) {
		return luminance(background) > 0.6f ? 0xFF111111 : 0xFFFFFFFF;
	}

	// ------------------------------------------------------------------------------------------ misc

	/** Point-in-rectangle test. */
	public static boolean hovered(double mx, double my, int x, int y, int w, int h) {
		return mx >= x && my >= y && mx < x + w && my < y + h;
	}

	/** Starts a scissor for the rectangle (in current pose space). Pair with {@link #endScissor}. */
	public static void scissor(GuiGraphics g, int x, int y, int w, int h) {
		g.enableScissor(x, y, x + Math.max(0, w), y + Math.max(0, h));
	}

	/** Ends the scissor started by {@link #scissor}. */
	public static void endScissor(GuiGraphics g) {
		g.disableScissor();
	}

	/**
	 * Queues a CubeOS-styled tooltip; it is drawn above everything at the end of the frame.
	 * Coordinates are in the current pose space (e.g. local app coords) and are converted automatically.
	 */
	public static void tooltip(GuiGraphics g, String text, int x, int y) {
		TMP.set(x, y);
		g.pose().transformPosition(TMP);
		Tooltips.set(text, Math.round(TMP.x), Math.round(TMP.y));
	}
}
