package com.laptopcraft.client.os;

import com.laptopcraft.client.os.ui.Ease;
import com.laptopcraft.client.os.ui.Gfx;
import net.minecraft.client.gui.GuiGraphics;

/** A flyout anchored to the taskbar (calendar, notification center). Display coordinates. */
abstract class Popup {
	protected final CubeOS os;
	protected final String anchor;
	protected int x;
	protected int y;
	protected int w;
	protected int h;
	protected final long openedAt = Ease.now();

	Popup(CubeOS os, String anchor) {
		this.os = os;
		this.anchor = anchor;
	}

	/** Which taskbar element opened it (clicking it again closes the popup). */
	String anchor() {
		return anchor;
	}

	/** Computes the rectangle for the given display size (bottom-right, above the taskbar). */
	void layout(int displayW, int deskH, int width, int height) {
		w = Math.min(width, displayW - 8);
		h = Math.min(height, deskH - 8);
		x = displayW - w - 4;
		y = deskH - h - 4;
	}

	boolean contains(double mx, double my) {
		return Gfx.hovered(mx, my, x, y, w, h);
	}

	/** Slide-up offset for the opening animation. */
	protected int slide() {
		return Math.round((1f - Ease.outCubic(Ease.progress(openedAt, 180))) * 10);
	}

	abstract void render(GuiGraphics g, int mouseX, int mouseY);

	boolean mouseClicked(double mx, double my, int button) {
		return contains(mx, my);
	}

	boolean mouseScrolled(double mx, double my, double amount) {
		return contains(mx, my);
	}

	boolean mouseDragged(double mx, double my, int button, double dx, double dy) {
		return false;
	}

	boolean mouseReleased(double mx, double my, int button) {
		return false;
	}
}
