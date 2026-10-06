package com.laptopcraft.client.os.ui;

import java.util.List;
import net.minecraft.client.gui.GuiGraphics;
import org.jspecify.annotations.Nullable;

/**
 * One deferred, CubeOS-styled tooltip per frame. Set it from anywhere with
 * {@link Gfx#tooltip(GuiGraphics, String, int, int)}; the OS draws it on top of everything at the
 * end of the frame (clamped into the display).
 */
public final class Tooltips {
	private static @Nullable String text;
	private static int x;
	private static int y;

	private Tooltips() {
	}

	/** Queue a tooltip at absolute GUI coordinates (top-left anchor = mouse position). */
	public static void set(String tooltipText, int guiX, int guiY) {
		text = tooltipText;
		x = guiX;
		y = guiY;
	}

	public static void clear() {
		text = null;
	}

	/**
	 * Renders and clears the pending tooltip. Called by the OS with an identity-ish pose (absolute GUI coords).
	 * The tooltip is kept inside {@code [minX, maxX) × [minY, maxY)}.
	 */
	public static void render(GuiGraphics g, int minX, int minY, int maxX, int maxY) {
		String t = text;
		text = null;
		if (t == null || t.isEmpty()) {
			return;
		}
		int maxW = Math.min(200, Math.max(40, maxX - minX - 8));
		List<String> lines = Gfx.wrap(t, maxW);
		int w = 0;
		for (String line : lines) {
			w = Math.max(w, Gfx.width(line));
		}
		int h = lines.size() * 10 + 5;
		w += 10;
		int tx = x + 8;
		int ty = y + 12;
		if (tx + w > maxX - 2) {
			tx = Math.max(minX + 2, x - w - 4);
		}
		if (ty + h > maxY - 2) {
			ty = Math.max(minY + 2, y - h - 4);
		}
		var th = UI.theme();
		Gfx.shadow(g, tx, ty, w, h, 4, 0x40);
		Gfx.panel(g, tx, ty, w, h, 3, th.tooltipBg(), th.border());
		for (int i = 0; i < lines.size(); i++) {
			Gfx.text(g, lines.get(i), tx + 5, ty + 3 + i * 10, th.text());
		}
	}
}
