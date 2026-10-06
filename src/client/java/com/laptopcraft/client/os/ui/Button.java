package com.laptopcraft.client.os.ui;

import com.laptopcraft.client.os.Theme;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.resources.Identifier;
import org.jspecify.annotations.Nullable;
import org.lwjgl.glfw.GLFW;

/**
 * Push button with an optional icon. Recommended height: 16 (compact) to 20 px.
 *
 * <pre>{@code
 * Button buy = new Button("Buy now", this::buy).style(Button.Style.PRIMARY);
 * buy.setBounds(10, 40, 70, 18);
 * }</pre>
 */
public class Button extends Widget {
	/** Visual styles. */
	public enum Style {
		/** Filled with the accent color — the main action. */
		PRIMARY,
		/** Neutral surface with border. */
		SECONDARY,
		/** No background until hovered (toolbars, links). */
		FLAT,
		/** Filled red — destructive actions. */
		DANGER
	}

	public String label;
	public @Nullable Identifier icon;
	public Style style = Style.SECONDARY;
	public @Nullable Runnable onClick;
	/** Optional fixed text color (FLAT buttons); 0 = theme default. */
	public int textColor;
	/** Play the click sound on press. */
	public boolean clickSound = true;
	private boolean pressed;

	/** Text button (style SECONDARY). */
	public Button(String label, @Nullable Runnable onClick) {
		this.label = label;
		this.onClick = onClick;
	}

	/** Button with icon and label. */
	public Button(String label, @Nullable Identifier icon, @Nullable Runnable onClick) {
		this(label, onClick);
		this.icon = icon;
	}

	/** Sets the style; returns this. */
	public Button style(Style style) {
		this.style = style;
		return this;
	}

	/** Sets the icon; returns this. */
	public Button icon(@Nullable Identifier icon) {
		this.icon = icon;
		return this;
	}

	/** Sets the hover tooltip; returns this. */
	public Button tooltip(@Nullable String tooltip) {
		this.tooltip = tooltip;
		return this;
	}

	/** Width that fits the label (+icon) with standard padding. */
	public int preferredWidth() {
		int iw = icon != null ? iconSize() + (label.isEmpty() ? 0 : 4) : 0;
		return Gfx.width(label) + iw + 16;
	}

	private int iconSize() {
		return h >= 20 ? 16 : Math.max(8, h - 6);
	}

	@Override
	public void render(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
		Theme t = theme();
		boolean hov = enabled && isHovered(mouseX, mouseY);
		boolean down = pressed && hov;
		int bg;
		int fg;
		int border = 0;
		switch (style) {
			case PRIMARY -> {
				bg = down ? Gfx.darken(t.accent(), 0.15f) : hov ? Gfx.lighten(t.accent(), 0.12f) : t.accent();
				fg = t.accentText();
			}
			case DANGER -> {
				bg = down ? Gfx.darken(t.danger(), 0.15f) : hov ? Gfx.lighten(t.danger(), 0.12f) : t.danger();
				fg = 0xFFFFFFFF;
			}
			case FLAT -> {
				bg = down ? t.pressed() : hov ? t.hover() : 0;
				fg = textColor != 0 ? textColor : t.text();
			}
			default -> {
				bg = t.surface();
				border = t.border();
				fg = textColor != 0 ? textColor : t.text();
			}
		}
		if (!enabled) {
			bg = Gfx.fade(bg, 0.5f);
			border = Gfx.fade(border, 0.5f);
			fg = Gfx.fade(fg, 0.45f);
		}
		int r = Math.min(4, h / 4);
		Gfx.roundRect(g, x, y, w, h, r, bg);
		if (border != 0) {
			Gfx.roundBorder(g, x, y, w, h, r, border);
			if (hov) {
				Gfx.roundRect(g, x + 1, y + 1, w - 2, h - 2, Math.max(0, r - 1), down ? t.pressed() : t.hover());
			}
		}
		int is = icon != null ? iconSize() : 0;
		int gap = icon != null && !label.isEmpty() ? 4 : 0;
		String text = Gfx.ellipsize(label, Math.max(0, w - 8 - is - gap));
		int contentW = is + gap + Gfx.width(text);
		int cx = x + (w - contentW) / 2;
		int dy = down ? 1 : 0;
		if (icon != null) {
			Gfx.icon(g, icon, cx, y + (h - is) / 2 + dy, is, enabled ? 0xFFFFFFFF : 0x80FFFFFF);
		}
		if (!text.isEmpty()) {
			Gfx.text(g, text, cx + is + gap, y + (h - 8) / 2 + dy, fg);
		}
		if (focused && enabled) {
			Gfx.roundBorder(g, x - 1, y - 1, w + 2, h + 2, r + 1, Gfx.withAlpha(t.accent(), 0xAA));
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
			press();
			return true;
		}
		return was;
	}

	/** Triggers the button programmatically (plays the click sound and runs onClick). */
	public void press() {
		if (clickSound) {
			UI.playClick();
		}
		if (onClick != null) {
			onClick.run();
		}
	}

	@Override
	public boolean keyPressed(int keyCode, int scanCode, int modifiers) {
		if (focused && enabled && (keyCode == GLFW.GLFW_KEY_ENTER || keyCode == GLFW.GLFW_KEY_SPACE || keyCode == GLFW.GLFW_KEY_KP_ENTER)) {
			press();
			return true;
		}
		return false;
	}
}
