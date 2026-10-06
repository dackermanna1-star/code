package com.laptopcraft.client.os.ui;

import com.laptopcraft.client.os.Theme;
import net.minecraft.client.gui.GuiGraphics;
import org.jspecify.annotations.Nullable;

/**
 * Base class of all CubeOS widgets. Widgets are plain stateful objects: you own them, position them
 * with {@link #setBounds} and forward events to them (or let a {@link WidgetGroup} do it). All
 * coordinates are in the caller's local space (inside an app: content coordinates).
 *
 * <p>Event methods return {@code true} when the event was consumed.
 */
public abstract class Widget {
	public int x;
	public int y;
	public int w;
	public int h;
	/** Hidden widgets neither render nor receive events. */
	public boolean visible = true;
	/** Disabled widgets render dimmed and ignore input. */
	public boolean enabled = true;
	/** Optional hover tooltip (shown after a short delay). */
	public @Nullable String tooltip;

	protected boolean focused;
	private long hoverSince = -1;

	/** Sets position and size; returns this for chaining. */
	public Widget setBounds(int x, int y, int w, int h) {
		this.x = x;
		this.y = y;
		this.w = w;
		this.h = h;
		onBoundsChanged();
		return this;
	}

	/** Called after {@link #setBounds}. */
	protected void onBoundsChanged() {
	}

	public boolean contains(double mx, double my) {
		return visible && mx >= x && my >= y && mx < x + w && my < y + h;
	}

	/** Renders the widget. {@code mouseX/mouseY} are local coords (MIN_VALUE/2 when not hovered). */
	public abstract void render(GuiGraphics g, int mouseX, int mouseY, float partialTick);

	public boolean mouseClicked(double mx, double my, int button) {
		return false;
	}

	public boolean mouseReleased(double mx, double my, int button) {
		return false;
	}

	public boolean mouseDragged(double mx, double my, int button, double dx, double dy) {
		return false;
	}

	/** {@code amount} &gt; 0 = wheel up. */
	public boolean mouseScrolled(double mx, double my, double amount) {
		return false;
	}

	public boolean keyPressed(int keyCode, int scanCode, int modifiers) {
		return false;
	}

	public boolean charTyped(int codePoint, int modifiers) {
		return false;
	}

	/**
	 * Second render pass for popups that must appear above sibling widgets (e.g. an open
	 * {@link Dropdown} list). Receives the real mouse position. Default: nothing.
	 */
	public void renderOverlay(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
	}

	/** True while the widget shows an overlay that should get mouse events first (open dropdown). */
	public boolean hasOverlay() {
		return false;
	}

	/** True if the overlay covers the point (siblings then don't get hover). */
	public boolean capturesOverlay(double mx, double my) {
		return false;
	}

	/** Called 20 times per second by {@link WidgetGroup#tick()}. */
	public void tick() {
	}

	/** Whether the widget can take keyboard focus (text inputs, lists...). */
	public boolean isFocusable() {
		return false;
	}

	public boolean isFocused() {
		return focused;
	}

	public void setFocused(boolean focused) {
		this.focused = focused;
	}

	protected Theme theme() {
		return UI.theme();
	}

	/** True if the mouse is over this widget (and it is visible). */
	protected boolean isHovered(int mouseX, int mouseY) {
		return contains(mouseX, mouseY);
	}

	/**
	 * Call from render with the hover state to show {@link #tooltip} after 600 ms of hovering.
	 * {@link WidgetGroup} does this automatically.
	 */
	public void renderTooltip(GuiGraphics g, int mouseX, int mouseY) {
		boolean hov = isHovered(mouseX, mouseY);
		if (!hov || tooltip == null || tooltip.isEmpty()) {
			hoverSince = -1;
			return;
		}
		long now = Ease.now();
		if (hoverSince < 0) {
			hoverSince = now;
		}
		if (now - hoverSince > 600) {
			Gfx.tooltip(g, tooltip, mouseX, mouseY);
		}
	}
}
