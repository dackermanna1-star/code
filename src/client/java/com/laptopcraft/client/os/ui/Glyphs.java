package com.laptopcraft.client.os.ui;

import net.minecraft.client.gui.GuiGraphics;

/**
 * Tiny crisp pixel glyphs drawn with 1px fills (window buttons, chevrons, checkmarks...). They stay
 * sharp at every GUI scale, unlike scaled textures or fallback font glyphs.
 */
public final class Glyphs {
	private Glyphs() {
	}

	private static void px(GuiGraphics g, int x, int y, int color) {
		g.fill(x, y, x + 1, y + 1, color);
	}

	/** Diagonal cross, {@code size}×{@code size}. */
	public static void close(GuiGraphics g, int x, int y, int size, int color) {
		for (int i = 0; i < size; i++) {
			px(g, x + i, y + i, color);
			px(g, x + size - 1 - i, y + i, color);
		}
	}

	/** Horizontal bar (minimize). */
	public static void minimize(GuiGraphics g, int x, int y, int size, int color) {
		g.fill(x, y + size / 2, x + size, y + size / 2 + 1, color);
	}

	/** Square outline (maximize). */
	public static void maximize(GuiGraphics g, int x, int y, int size, int color) {
		Gfx.border(g, x, y, size, size, color);
	}

	/** Two overlapping squares (restore down). */
	public static void restore(GuiGraphics g, int x, int y, int size, int color) {
		int s = size - 2;
		Gfx.border(g, x, y + 2, s, s, color);
		g.fill(x + 2, y, x + size, y + 1, color);
		g.fill(x + size - 1, y, x + size, y + s, color);
	}

	/** Plus sign. */
	public static void plus(GuiGraphics g, int x, int y, int size, int color) {
		int m = size / 2;
		g.fill(x, y + m, x + size, y + m + 1, color);
		g.fill(x + m, y, x + m + 1, y + size, color);
	}

	/** Minus sign. */
	public static void minus(GuiGraphics g, int x, int y, int size, int color) {
		int m = size / 2;
		g.fill(x, y + m, x + size, y + m + 1, color);
	}

	/** Chevron pointing left; height = 2*half+1, width = half+1. */
	public static void chevronLeft(GuiGraphics g, int x, int y, int half, int color) {
		for (int i = 0; i <= half; i++) {
			px(g, x + half - i, y + i, color);
			px(g, x + half - i, y + 2 * half - i, color);
		}
	}

	/** Chevron pointing right. */
	public static void chevronRight(GuiGraphics g, int x, int y, int half, int color) {
		for (int i = 0; i <= half; i++) {
			px(g, x + i, y + i, color);
			px(g, x + i, y + 2 * half - i, color);
		}
	}

	/** Chevron pointing down; width = 2*half+1, height = half+1. */
	public static void chevronDown(GuiGraphics g, int x, int y, int half, int color) {
		for (int i = 0; i <= half; i++) {
			px(g, x + i, y + i, color);
			px(g, x + 2 * half - i, y + i, color);
		}
	}

	/** Chevron pointing up. */
	public static void chevronUp(GuiGraphics g, int x, int y, int half, int color) {
		for (int i = 0; i <= half; i++) {
			px(g, x + i, y + half - i, color);
			px(g, x + 2 * half - i, y + half - i, color);
		}
	}

	/** Filled triangle pointing down (dropdown caret), width 2*half+1. */
	public static void caretDown(GuiGraphics g, int x, int y, int half, int color) {
		for (int i = 0; i <= half; i++) {
			g.fill(x + i, y + i, x + 2 * half + 1 - i, y + i + 1, color);
		}
	}

	/** Check mark, 7×5. */
	public static void check(GuiGraphics g, int x, int y, int color) {
		px(g, x, y + 2, color);
		px(g, x + 1, y + 3, color);
		px(g, x + 2, y + 4, color);
		px(g, x + 3, y + 3, color);
		px(g, x + 4, y + 2, color);
		px(g, x + 5, y + 1, color);
		px(g, x + 6, y, color);
	}

	/** Magnifying glass, 8×8. */
	public static void search(GuiGraphics g, int x, int y, int color) {
		g.fill(x + 1, y, x + 4, y + 1, color);
		g.fill(x + 1, y + 4, x + 4, y + 5, color);
		g.fill(x, y + 1, x + 1, y + 4, color);
		g.fill(x + 4, y + 1, x + 5, y + 4, color);
		px(g, x + 5, y + 5, color);
		px(g, x + 6, y + 6, color);
		px(g, x + 7, y + 7, color);
	}

	/** Small padlock, 7×8. */
	public static void padlock(GuiGraphics g, int x, int y, int color) {
		g.fill(x + 2, y, x + 5, y + 1, color);
		g.fill(x + 1, y + 1, x + 2, y + 3, color);
		g.fill(x + 5, y + 1, x + 6, y + 3, color);
		g.fill(x, y + 3, x + 7, y + 8, color);
	}

	/** Bell, 8×9. */
	public static void bell(GuiGraphics g, int x, int y, int color) {
		g.fill(x + 3, y, x + 5, y + 1, color);
		g.fill(x + 2, y + 1, x + 6, y + 2, color);
		g.fill(x + 1, y + 2, x + 7, y + 6, color);
		g.fill(x, y + 6, x + 8, y + 7, color);
		g.fill(x + 3, y + 8, x + 5, y + 9, color);
	}

	/** Speaker; {@code on} adds sound waves, otherwise a small x. 9×8. */
	public static void speaker(GuiGraphics g, int x, int y, boolean on, int color) {
		g.fill(x, y + 2, x + 2, y + 6, color);
		g.fill(x + 2, y + 1, x + 3, y + 7, color);
		g.fill(x + 3, y, x + 4, y + 8, color);
		if (on) {
			g.fill(x + 5, y + 3, x + 6, y + 5, color);
			g.fill(x + 7, y + 1, x + 8, y + 2, color);
			g.fill(x + 8, y + 2, x + 9, y + 6, color);
			g.fill(x + 7, y + 6, x + 8, y + 7, color);
		} else {
			close(g, x + 5, y + 2, 4, color);
		}
	}

	/** Envelope, 9×7. */
	public static void mail(GuiGraphics g, int x, int y, int color) {
		Gfx.border(g, x, y, 9, 7, color);
		px(g, x + 1, y + 1, color);
		px(g, x + 2, y + 2, color);
		px(g, x + 3, y + 3, color);
		px(g, x + 4, y + 4, color);
		px(g, x + 5, y + 3, color);
		px(g, x + 6, y + 2, color);
		px(g, x + 7, y + 1, color);
	}

	/** Star outline/filled, 9×9 approximation. */
	public static void star(GuiGraphics g, int x, int y, boolean filled, int color) {
		String[] rows = {
				"....#....",
				"...#.#...",
				"###...###",
				".#.....#.",
				"..#...#..",
				"..#...#..",
				".#..#..#.",
				".#.#.#.#.",
				"##.....##",
		};
		String[] full = {
				"....#....",
				"...###...",
				"#########",
				".#######.",
				"..#####..",
				"..#####..",
				".#######.",
				".###.###.",
				"##.....##",
		};
		String[] use = filled ? full : rows;
		for (int r = 0; r < use.length; r++) {
			for (int c = 0; c < use[r].length(); c++) {
				if (use[r].charAt(c) == '#') {
					px(g, x + c, y + r, color);
				}
			}
		}
	}

	/** Hamburger menu, 8×7. */
	public static void menu(GuiGraphics g, int x, int y, int color) {
		g.fill(x, y, x + 8, y + 1, color);
		g.fill(x, y + 3, x + 8, y + 4, color);
		g.fill(x, y + 6, x + 8, y + 7, color);
	}

	/** Circular arrow (reload), 8×8. */
	public static void reload(GuiGraphics g, int x, int y, int color) {
		g.fill(x + 2, y, x + 6, y + 1, color);
		g.fill(x + 1, y + 1, x + 2, y + 2, color);
		g.fill(x, y + 2, x + 1, y + 6, color);
		g.fill(x + 1, y + 6, x + 2, y + 7, color);
		g.fill(x + 2, y + 7, x + 6, y + 8, color);
		g.fill(x + 6, y + 6, x + 7, y + 7, color);
		g.fill(x + 7, y + 4, x + 8, y + 6, color);
		// arrow head at top right
		g.fill(x + 6, y, x + 8, y + 1, color);
		g.fill(x + 7, y + 1, x + 8, y + 3, color);
		px(g, x + 6, y + 1, color);
	}

	/** House (home), 9×8. */
	public static void home(GuiGraphics g, int x, int y, int color) {
		px(g, x + 4, y, color);
		g.fill(x + 3, y + 1, x + 6, y + 2, color);
		g.fill(x + 2, y + 2, x + 7, y + 3, color);
		g.fill(x + 1, y + 3, x + 8, y + 4, color);
		g.fill(x, y + 4, x + 9, y + 5, color);
		g.fill(x + 1, y + 5, x + 4, y + 8, color);
		g.fill(x + 5, y + 5, x + 8, y + 8, color);
	}

	/** Arrow pointing left (back), 8×7. */
	public static void arrowLeft(GuiGraphics g, int x, int y, int color) {
		g.fill(x + 1, y + 3, x + 8, y + 4, color);
		for (int i = 0; i <= 3; i++) {
			px(g, x + 3 - i + 0, y + i, color);
			px(g, x + 3 - i, y + 6 - i, color);
		}
	}

	/** Arrow pointing right (forward), 8×7. */
	public static void arrowRight(GuiGraphics g, int x, int y, int color) {
		g.fill(x, y + 3, x + 7, y + 4, color);
		for (int i = 0; i <= 3; i++) {
			px(g, x + 4 + i, y + i, color);
			px(g, x + 4 + i, y + 6 - i, color);
		}
	}

	/** Power symbol, 9×9. */
	public static void power(GuiGraphics g, int x, int y, int color) {
		g.fill(x + 4, y, x + 5, y + 4, color);
		g.fill(x + 1, y + 2, x + 2, y + 3, color);
		g.fill(x + 7, y + 2, x + 8, y + 3, color);
		g.fill(x, y + 3, x + 1, y + 7, color);
		g.fill(x + 8, y + 3, x + 9, y + 7, color);
		g.fill(x + 1, y + 7, x + 2, y + 8, color);
		g.fill(x + 7, y + 7, x + 8, y + 8, color);
		g.fill(x + 2, y + 8, x + 7, y + 9, color);
	}

	/** Moon crescent, 8×8. */
	public static void moon(GuiGraphics g, int x, int y, int color) {
		String[] rows = {
				"..####..",
				".###....",
				"###.....",
				"###.....",
				"###.....",
				"###.....",
				".###....",
				"..####..",
		};
		for (int r = 0; r < rows.length; r++) {
			for (int c = 0; c < 8; c++) {
				if (rows[r].charAt(c) == '#') {
					px(g, x + c, y + r, color);
				}
			}
		}
	}

	/** Filled circle of the given diameter (pixel approximated). */
	public static void circle(GuiGraphics g, int x, int y, int diameter, int color) {
		float r = diameter / 2f;
		for (int row = 0; row < diameter; row++) {
			float dy = row + 0.5f - r;
			int half = (int) Math.floor(Math.sqrt(Math.max(0, r * r - dy * dy)) + 0.25f);
			int cx = x + diameter / 2;
			int x0 = diameter % 2 == 0 ? cx - half : cx - half;
			int x1 = diameter % 2 == 0 ? cx + half : cx + half + 1;
			if (x1 > x0) {
				g.fill(x0, y + row, x1, y + row + 1, color);
			}
		}
	}
}
