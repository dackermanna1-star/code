package com.laptopcraft.client.os.ui;

import com.laptopcraft.client.os.Theme;
import java.util.function.BiConsumer;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.resources.Identifier;
import org.jspecify.annotations.Nullable;

/**
 * Square, flat button showing only an icon (texture or custom painter), with hover/pressed
 * background and an optional tooltip and "toggled" state (accent tint).
 *
 * <pre>{@code
 * IconButton star = new IconButton(Icons.STAR, "Bookmark this page", this::toggleBookmark);
 * star.setBounds(x, y, 18, 18);
 * // or a pixel glyph:
 * new IconButton((g, c) -> Glyphs.plus(g, 0, 0, 7, c), "New tab", this::newTab);
 * }</pre>
 */
public class IconButton extends Widget {
	public @Nullable Identifier icon;
	/** Alternative to {@link #icon}: paints at local (0,0) — pose is pre-translated — with the given color. */
	public @Nullable BiConsumer<GuiGraphics, Integer> painter;
	/** Size of the painter's drawing (used for centering). */
	public int painterW = 8;
	public int painterH = 8;
	public @Nullable Runnable onClick;
	/** Highlighted (e.g. active bookmark star). */
	public boolean toggled;
	/** Icon size inside the button (default: 16 if it fits, else h - 4). */
	public int iconSize = -1;
	/** Round (circle-ish) background instead of rounded square. */
	public boolean round;
	private boolean pressed;

	public IconButton(@Nullable Identifier icon, @Nullable String tooltip, @Nullable Runnable onClick) {
		this.icon = icon;
		this.tooltip = tooltip;
		this.onClick = onClick;
	}

	public IconButton(BiConsumer<GuiGraphics, Integer> painter, int painterW, int painterH, @Nullable String tooltip, @Nullable Runnable onClick) {
		this.painter = painter;
		this.painterW = painterW;
		this.painterH = painterH;
		this.tooltip = tooltip;
		this.onClick = onClick;
	}

	@Override
	public void render(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
		Theme t = theme();
		boolean hov = enabled && isHovered(mouseX, mouseY);
		int r = round ? Math.min(6, Math.min(w, h) / 2) : 3;
		if (toggled) {
			Gfx.roundRect(g, x, y, w, h, r, Gfx.withAlpha(t.accent(), 0x40));
		}
		if (hov) {
			Gfx.roundRect(g, x, y, w, h, r, pressed ? t.pressed() : t.hover());
		}
		int dy = pressed && hov ? 1 : 0;
		int color = !enabled ? Gfx.fade(t.textDim(), 0.5f) : toggled ? t.accent() : t.text();
		if (icon != null) {
			int s = iconSize > 0 ? iconSize : (Math.min(w, h) >= 20 ? 16 : Math.max(8, Math.min(w, h) - 4));
			Gfx.icon(g, icon, x + (w - s) / 2, y + (h - s) / 2 + dy, s, enabled ? 0xFFFFFFFF : 0x70FFFFFF);
		} else if (painter != null) {
			g.pose().pushMatrix();
			g.pose().translate(x + (w - painterW) / 2, y + (h - painterH) / 2 + dy);
			painter.accept(g, color);
			g.pose().popMatrix();
		}
	}

	@Override
	public boolean mouseClicked(double mx, double my, int button) {
		if (!enabled || button != 0 || !contains(mx, my)) {
			return false;
		}
		pressed = true;
		return true;
	}

	@Override
	public boolean mouseReleased(double mx, double my, int button) {
		boolean was = pressed;
		pressed = false;
		if (was && enabled && contains(mx, my)) {
			UI.playClick();
			if (onClick != null) {
				onClick.run();
			}
			return true;
		}
		return was;
	}
}
