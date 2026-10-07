package com.laptopcraft.client.os.ui;

import com.laptopcraft.client.os.Theme;
import net.minecraft.client.gui.GuiGraphics;

/**
 * Vertical scrolling model with smooth (animated) wheel scrolling and a draggable scrollbar.
 *
 * <pre>{@code
 * private final ScrollState scroll = new ScrollState();
 * // render:
 * scroll.setContent(contentHeight, viewportHeight);
 * Gfx.scissor(g, 0, top, width, viewportHeight);
 * int y = top - scroll.offset();   // draw rows starting here
 * ...
 * Gfx.endScissor(g);
 * scroll.renderScrollbar(g, width - ScrollState.BAR_WIDTH, top, viewportHeight, mouseX, mouseY);
 * // input:
 * mouseScrolled → return scroll.mouseScrolled(amount);
 * mouseClicked  → if (scroll.mouseClicked(x, y, width - ScrollState.BAR_WIDTH, top, viewportHeight)) return true;
 * mouseDragged  → if (scroll.mouseDragged(y)) return true;
 * mouseReleased → scroll.mouseReleased();
 * }</pre>
 */
public class ScrollState {
	/** Width of the scrollbar gutter. */
	public static final int BAR_WIDTH = 6;

	private float offset;
	private float target;
	private int contentHeight;
	private int viewportHeight;
	/** Pixels per wheel notch. */
	public int step = 27;
	/** Animate wheel scrolling. */
	public boolean smooth = true;
	private long lastUpdate = -1;
	private boolean dragging;
	private double dragStartMouse;
	private float dragStartOffset;
	private int barY;
	private int barH;
	private int trackH;

	/** Updates content/viewport heights (call every frame before rendering) and clamps the offset. */
	public void setContent(int contentHeight, int viewportHeight) {
		this.contentHeight = Math.max(0, contentHeight);
		this.viewportHeight = Math.max(0, viewportHeight);
		target = clamp(target);
		offset = clamp(offset);
		update();
	}

	private void update() {
		long now = Ease.now();
		if (lastUpdate < 0 || !smooth) {
			offset = target;
		} else {
			float dt = Math.min(0.1f, (now - lastUpdate) / 1000f);
			float k = 1f - (float) Math.exp(-dt * 20f);
			offset += (target - offset) * k;
			if (Math.abs(target - offset) < 0.5f) {
				offset = target;
			}
		}
		lastUpdate = now;
	}

	private float clamp(float v) {
		return Math.max(0, Math.min(v, maxOffset()));
	}

	/** Current scroll offset in pixels (rounded). */
	public int offset() {
		return Math.round(offset);
	}

	/** The offset the animation is heading to. */
	public int targetOffset() {
		return Math.round(target);
	}

	/** Largest valid offset. */
	public int maxOffset() {
		return Math.max(0, contentHeight - viewportHeight);
	}

	/** Content height set by {@link #setContent}. */
	public int contentHeight() {
		return contentHeight;
	}

	/** Viewport height set by {@link #setContent}. */
	public int viewportHeight() {
		return viewportHeight;
	}

	/** True if the content is taller than the viewport. */
	public boolean canScroll() {
		return contentHeight > viewportHeight;
	}

	/** Jump immediately (no animation). */
	public void scrollTo(int y) {
		target = clamp(y);
		offset = target;
	}

	/** Animated scroll to {@code y}. */
	public void animateTo(int y) {
		target = clamp(y);
	}

	/** Animated relative scroll. */
	public void scrollBy(double delta) {
		target = clamp((float) (target + delta));
	}

	/** Scrolls minimally so that [top, bottom) (content coordinates) is visible. */
	public void ensureVisible(int top, int bottom) {
		if (top < target) {
			target = clamp(top);
		} else if (bottom > target + viewportHeight) {
			target = clamp(bottom - viewportHeight);
		}
	}

	/** Jumps to the top. */
	public void scrollToTop() {
		scrollTo(0);
	}

	/** Jumps to the bottom. */
	public void scrollToBottom() {
		scrollTo(maxOffset());
	}

	/** Wheel input ({@code amount} &gt; 0 = up). Returns true if the content could scroll. */
	public boolean mouseScrolled(double amount) {
		if (!canScroll()) {
			return false;
		}
		target = clamp((float) (target - amount * step));
		return true;
	}

	/** True while the thumb is dragged. */
	public boolean isDragging() {
		return dragging;
	}

	/**
	 * Renders the scrollbar in the gutter {@code [x, x+BAR_WIDTH) × [y, y+h)}. Nothing is drawn when the
	 * content fits.
	 */
	public void renderScrollbar(GuiGraphics g, int x, int y, int h, int mouseX, int mouseY) {
		if (!canScroll() || h <= 4) {
			barH = 0;
			return;
		}
		Theme t = UI.theme();
		int thumbH = Math.max(16, (int) ((long) h * viewportHeight / Math.max(1, contentHeight)));
		thumbH = Math.min(thumbH, h);
		int travel = h - thumbH;
		int thumbY = y + (maxOffset() == 0 ? 0 : Math.round(travel * (offset / maxOffset())));
		barY = thumbY;
		barH = thumbH;
		trackH = h;
		boolean hov = Gfx.hovered(mouseX, mouseY, x - 2, y, BAR_WIDTH + 2, h);
		int bw = hov || dragging ? 4 : 3;
		int bx = x + (BAR_WIDTH - bw) / 2 + (hov || dragging ? 0 : 1);
		if (hov || dragging) {
			Gfx.roundRect(g, x + 1, y, BAR_WIDTH - 2, h, 2, Gfx.withAlpha(t.text(), 0x12));
		}
		int col = dragging ? t.accent()
				: hov ? (t.dark() ? Gfx.lighten(t.scrollbar(), 0.25f) : Gfx.darken(t.scrollbar(), 0.2f))
				: t.scrollbar();
		Gfx.roundRect(g, bx, thumbY + 1, bw, thumbH - 2, Math.min(2, bw / 2), col);
	}

	/**
	 * Handles a click on the scrollbar gutter: starts dragging on the thumb, pages up/down on the track.
	 * Returns true if the click was on the gutter.
	 */
	public boolean mouseClicked(double mx, double my, int gutterX, int gutterY, int gutterH) {
		if (!canScroll() || !Gfx.hovered(mx, my, gutterX - 2, gutterY, BAR_WIDTH + 2, gutterH)) {
			return false;
		}
		if (barH > 0 && my >= barY && my < barY + barH) {
			dragging = true;
			dragStartMouse = my;
			dragStartOffset = offset;
		} else if (barH > 0) {
			// jump so the thumb centers on the click, then allow dragging
			float ratio = (float) ((my - gutterY - barH / 2.0) / Math.max(1, gutterH - barH));
			scrollTo(Math.round(ratio * maxOffset()));
			dragging = true;
			dragStartMouse = my;
			dragStartOffset = offset;
		}
		return true;
	}

	/** Continues a thumb drag; returns true while dragging. */
	public boolean mouseDragged(double my) {
		if (!dragging) {
			return false;
		}
		int travel = Math.max(1, trackH - barH);
		float perPixel = maxOffset() / (float) travel;
		scrollTo(Math.round(dragStartOffset + (float) (my - dragStartMouse) * perPixel));
		return true;
	}

	/** Ends a thumb drag; returns true if one was active. */
	public boolean mouseReleased() {
		boolean was = dragging;
		dragging = false;
		return was;
	}
}
