package com.laptopcraft.client.os;

import com.laptopcraft.client.os.ui.Gfx;
import net.minecraft.client.gui.GuiGraphics;

/**
 * The CubeOS logo: the {@code os/logo.png} texture, or a crisp procedural isometric cube when the
 * texture is not available.
 */
public final class CubeLogo {
	private CubeLogo() {
	}

	public static void draw(GuiGraphics g, int x, int y, int size, int tint) {
		if (Gfx.textureExists(Icons.LOGO)) {
			Gfx.icon(g, Icons.LOGO, x, y, size, tint);
			return;
		}
		drawProcedural(g, x, y, size, (tint >>> 24) & 0xFF);
	}

	/** Isometric cube with a glowing "screen" face. */
	public static void drawProcedural(GuiGraphics g, int x, int y, int size, int alpha) {
		int s = Math.max(8, size - size % 2);
		int half = s / 2;
		int q = s / 4;
		int top = Gfx.withAlpha(0xFF9BE8FF, alpha);
		int left = Gfx.withAlpha(0xFF3D8BFD, alpha);
		int right = Gfx.withAlpha(0xFF2456B8, alpha);
		int glow = Gfx.withAlpha(0xFFB8F6FF, alpha);
		// top rhombus: rows [0, half)
		for (int r = 0; r < half; r++) {
			float dy = Math.abs(r - (q - 0.5f));
			int hw = Math.round(half - dy * 2);
			if (hw > 0) {
				g.fill(x + half - hw, y + r, x + half + hw, y + r + 1, top);
			}
		}
		// side faces: rows [q, s)
		for (int r = q; r < s; r++) {
			int lx0 = Math.max(0, 2 * (r - 3 * q) + 1);
			int lx1 = Math.min(half, 2 * (r - q) + 1);
			if (r >= half - 0) {
				lx1 = half;
			}
			if (lx1 > lx0) {
				g.fill(x + lx0, y + r, x + lx1, y + r + 1, left);
				g.fill(x + s - lx1, y + r, x + s - lx0, y + r + 1, right);
			}
		}
		// screen glow on the right face
		int gx0 = x + half + Math.max(1, s / 8);
		int gx1 = x + s - Math.max(1, s / 8);
		for (int col = gx0; col < gx1; col++) {
			int rel = col - x - half;
			int y0 = y + half - rel / 2 + Math.max(1, s / 10);
			int y1 = y + s - q - rel / 2 + q / 2 - Math.max(1, s / 10);
			if (y1 > y0) {
				g.fill(col, y0, col + 1, y1, Gfx.withAlpha(glow, Math.round(alpha * 0.85f)));
			}
		}
	}
}
