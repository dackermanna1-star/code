package com.laptopcraft.client.os;

import com.laptopcraft.client.os.ui.Ease;
import com.laptopcraft.client.os.ui.Gfx;
import com.laptopcraft.client.os.ui.Glyphs;
import com.laptopcraft.client.os.ui.UI;
import java.util.List;
import net.minecraft.client.gui.GuiGraphics;
import org.jspecify.annotations.Nullable;
import org.lwjgl.glfw.GLFW;

/**
 * A popup menu (right-click menu, power menu...). Coordinates are display coordinates; the menu
 * flips/clamps to stay inside the given bounds. Apps open one with {@code ctx.showContextMenu}.
 */
public final class ContextMenu {
	private static final int ITEM_H = 16;
	private static final int SEP_H = 7;
	private static final int PAD = 3;

	private final List<MenuItem> items;
	private final int x;
	private final int y;
	private final int w;
	private final int h;
	private final boolean openUp;
	private final long openedAt = Ease.now();
	private int keyIndex = -1;

	/** Menu anchored at (ax, ay), kept inside [0, boundsW) × [0, boundsH). */
	public ContextMenu(List<MenuItem> items, double ax, double ay, int boundsW, int boundsH) {
		this(items, ax, ay, boundsW, boundsH, false);
	}

	/** @param preferUp open above the anchor (e.g. from the taskbar) */
	public ContextMenu(List<MenuItem> items, double ax, double ay, int boundsW, int boundsH, boolean preferUp) {
		this.items = List.copyOf(items);
		boolean anyIcon = false;
		int maxLabel = 0;
		int maxShortcut = 0;
		int height = PAD * 2;
		for (MenuItem it : this.items) {
			if (it.divider()) {
				height += SEP_H;
				continue;
			}
			height += ITEM_H;
			anyIcon |= it.icon() != null || it.checked();
			maxLabel = Math.max(maxLabel, Gfx.width(it.label()));
			if (it.shortcut() != null) {
				maxShortcut = Math.max(maxShortcut, Gfx.width(it.shortcut()));
			}
		}
		int width = 8 + (anyIcon ? 16 : 0) + maxLabel + (maxShortcut > 0 ? maxShortcut + 16 : 0) + 10;
		width = Math.max(110, Math.min(width, Math.max(60, boundsW - 8)));
		this.w = width;
		this.h = Math.min(height, Math.max(20, boundsH - 4));
		int px = (int) ax;
		int py = (int) ay;
		if (px + w > boundsW - 2) {
			px = Math.max(2, px - w);
		}
		boolean up = preferUp || py + h > boundsH - 2;
		if (up) {
			py = py - h;
			if (py < 2) {
				py = Math.max(2, Math.min((int) ay, boundsH - h - 2));
				up = false;
			}
		}
		this.x = Math.max(2, Math.min(px, boundsW - w - 2));
		this.y = Math.max(2, Math.min(py, boundsH - h - 2));
		this.openUp = up;
	}

	/** True if the point is inside the menu. */
	public boolean contains(double mx, double my) {
		return Gfx.hovered(mx, my, x, y, w, h);
	}

	/** Draws the menu (display coordinates). */
	public void render(GuiGraphics g, int mouseX, int mouseY) {
		Theme t = UI.theme();
		float a = Ease.outCubic(Ease.progress(openedAt, 110));
		int slide = Math.round((1f - a) * 5) * (openUp ? 1 : -1);
		int yy = y + slide;
		Gfx.shadow(g, x, yy, w, h, 6, Math.round(0x55 * a));
		Gfx.panel(g, x, yy, w, h, 4, Gfx.fade(t.surface(), 0.75f + 0.25f * a), Gfx.fade(t.border(), a));
		boolean anyIcon = items.stream().anyMatch(i -> i.icon() != null || i.checked());
		int cy = yy + PAD;
		int index = 0;
		for (MenuItem it : items) {
			if (it.divider()) {
				Gfx.rect(g, x + 6, cy + SEP_H / 2, w - 12, 1, t.border());
				cy += SEP_H;
				index++;
				continue;
			}
			boolean hov = it.enabled() && (Gfx.hovered(mouseX, mouseY, x + 2, cy, w - 4, ITEM_H) || index == keyIndex);
			if (hov) {
				Gfx.roundRect(g, x + 3, cy, w - 6, ITEM_H, 3, it.destructive() ? Gfx.withAlpha(t.danger(), 0x30) : t.hover());
			}
			int tx = x + 8;
			if (anyIcon) {
				if (it.icon() != null) {
					Gfx.icon(g, it.icon(), tx - 2, cy + 2, 12, it.enabled() ? 0xFFFFFFFF : 0x60FFFFFF);
				} else if (it.checked()) {
					Glyphs.check(g, tx - 1, cy + 6, t.accent());
				}
				tx += 16;
			}
			int col = !it.enabled() ? Gfx.fade(t.textDim(), 0.6f) : it.destructive() ? t.danger() : t.text();
			int labelMax = w - (tx - x) - 8 - (it.shortcut() != null ? Gfx.width(it.shortcut()) + 10 : 0);
			Gfx.textClipped(g, it.label(), tx, cy + 4, labelMax, Gfx.fade(col, a));
			if (it.shortcut() != null) {
				Gfx.textRight(g, it.shortcut(), x + w - 8, cy + 4, Gfx.fade(t.textDim(), a));
			}
			cy += ITEM_H;
			index++;
		}
	}

	/** Returns the action of the clicked item (null if none/disabled). */
	public @Nullable MenuItem itemAt(double mx, double my) {
		if (!contains(mx, my)) {
			return null;
		}
		int cy = y + PAD;
		for (MenuItem it : items) {
			int ih = it.divider() ? SEP_H : ITEM_H;
			if (my >= cy && my < cy + ih) {
				return it.divider() || !it.enabled() ? null : it;
			}
			cy += ih;
		}
		return null;
	}

	/** Keyboard navigation. Returns the item to activate on Enter, or null. */
	public @Nullable MenuItem keyPressed(int key) {
		if (key == GLFW.GLFW_KEY_DOWN || key == GLFW.GLFW_KEY_UP) {
			int dir = key == GLFW.GLFW_KEY_DOWN ? 1 : -1;
			for (int n = 0; n < items.size(); n++) {
				keyIndex = Math.floorMod(keyIndex + dir, items.size());
				MenuItem it = items.get(keyIndex);
				if (!it.divider() && it.enabled()) {
					break;
				}
			}
			return null;
		}
		if ((key == GLFW.GLFW_KEY_ENTER || key == GLFW.GLFW_KEY_KP_ENTER) && keyIndex >= 0 && keyIndex < items.size()) {
			MenuItem it = items.get(keyIndex);
			return it.divider() || !it.enabled() ? null : it;
		}
		return null;
	}
}
