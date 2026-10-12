package com.mineception.client.screen;

import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.network.chat.Component;

/**
 * Layout and drawing of the laptop around the GUI's monitor: a lid with a bezel, webcam and status light, and a
 * keyboard deck seen slightly from above, all in plain GUI fills so it scales with any window.
 */
final class LaptopFrame {
	/** Width / height of the monitor; the same as the laptop screens inside the dream levels. */
	static final double MONITOR_ASPECT = 1.6;
	/** Height of the breadcrumb band above the laptop. */
	static final int CRUMB_BAND = 16;

	private static final int LID = 0xFF2A2C31;
	private static final int LID_LIGHT = 0xFF4B4F58;
	private static final int LID_EDGE = 0xFF3A3D44;
	private static final int LID_SHADOW = 0xFF17181B;
	private static final int BEZEL_INNER = 0xFF0A0B0D;
	private static final int DECK_FAR = 0xFF3A3D44;
	private static final int DECK_NEAR = 0xFF50545D;
	private static final int DECK_FRONT = 0xFF26282D;
	private static final int KEY = 0xFF1E2024;
	private static final int KEY_TOP = 0xFF2B2E33;
	private static final int TOUCHPAD = 0xFF5A5E68;

	private LaptopFrame() {
	}

	/**
	 * Where everything goes for a window of {@code width x height} GUI units.
	 *
	 * @param lidX     left of the lid
	 * @param lidY     top of the lid
	 * @param lidW     lid width
	 * @param lidH     lid height
	 * @param monX     left of the monitor (the live picture)
	 * @param monY     top of the monitor
	 * @param monW     monitor width
	 * @param monH     monitor height
	 * @param deckH    height of the keyboard deck below the lid
	 * @param deckWide how far the deck's front edge reaches beyond the lid on each side
	 */
	record Layout(int lidX, int lidY, int lidW, int lidH, int monX, int monY, int monW, int monH, int deckH, int deckWide,
				  int bezelTop, int bezelBottom) {
		int deckY() {
			return lidY + lidH;
		}

		boolean insideMonitor(double x, double y) {
			return x >= monX && y >= monY && x < monX + monW && y < monY + monH;
		}

		int monCenterX() {
			return monX + monW / 2;
		}

		int monCenterY() {
			return monY + monH / 2;
		}
	}

	static Layout layout(int width, int height) {
		int deckH = clamp(height / 16, 6, 20);
		int deckWide = deckH;
		int side = clamp(Math.min(width, height) / 45, 4, 10);
		int top = side + 3;
		int bottom = Math.max(side + 3, 12);
		int availW = width - 2 * (4 + side + deckWide);
		int availH = height - CRUMB_BAND - 2 - top - bottom - deckH - 4;
		int monW = Math.max(32, Math.min(availW, (int) Math.floor(availH * MONITOR_ASPECT)));
		int monH = Math.max(20, (int) Math.round(monW / MONITOR_ASPECT));
		int lidW = monW + 2 * side;
		int lidH = monH + top + bottom;
		int totalH = lidH + deckH;
		int lidX = (width - lidW) / 2;
		int free = height - CRUMB_BAND - 2 - totalH;
		int lidY = CRUMB_BAND + 2 + Math.max(0, free / 2);
		return new Layout(lidX, lidY, lidW, lidH, lidX + side, lidY + top, monW, monH, deckH, deckWide, top, bottom);
	}

	/** A soft glow of the picture's colour around the laptop, as if the screen lit the room. */
	static void drawGlow(GuiGraphics graphics, Layout l, int rgb) {
		for (int i = 6; i >= 1; i--) {
			int alpha = Math.max(0, 0x22 - i * 5);
			int grow = i * 4;
			graphics.fill(l.lidX() - grow, l.lidY() - grow, l.lidX() + l.lidW() + grow, l.deckY() + l.deckH() + grow / 2,
				alpha << 24 | rgb & 0xFFFFFF);
		}
	}

	/** Draws the lid (around the monitor) and the keyboard deck. The monitor area itself is left for the picture. */
	static void draw(GuiGraphics graphics, Font font, Layout l, boolean ledOn, Component brand, int ticks) {
		int x0 = l.lidX();
		int y0 = l.lidY();
		int x1 = x0 + l.lidW();
		int y1 = y0 + l.lidH();

		// Lid with bevelled edges and slightly rounded corners
		graphics.fill(x0 + 1, y0, x1 - 1, y1, LID);
		graphics.fill(x0, y0 + 1, x0 + 1, y1 - 1, LID_EDGE);
		graphics.fill(x1 - 1, y0 + 1, x1, y1 - 1, LID_SHADOW);
		graphics.fill(x0 + 1, y0, x1 - 1, y0 + 1, LID_LIGHT);
		graphics.fill(x0 + 1, y1 - 1, x1 - 1, y1, LID_SHADOW);
		graphics.fill(x0 + 1, y0 + 1, x0 + 2, y1 - 1, 0xFF33363C);

		// Bezel lip around the monitor
		graphics.fill(l.monX() - 1, l.monY() - 1, l.monX() + l.monW() + 1, l.monY() + l.monH() + 1, BEZEL_INNER);

		// Webcam and its status light (on while the laptop has the mouse)
		int camX = x0 + l.lidW() / 2;
		int camY = y0 + Math.max(1, (l.bezelTop() - 2) / 2);
		graphics.fill(camX - 2, camY - 1, camX + 2, camY + 3, 0xFF34373D);
		graphics.fill(camX - 1, camY, camX + 1, camY + 2, 0xFF050506);
		int led = ledOn ? (ticks / 10 % 6 == 0 ? 0xFF2FC85A : 0xFF4CFF7C) : 0xFF1F2B22;
		graphics.fill(camX + 5, camY + 1, camX + 7, camY + 2, led);

		// Brand on the bottom bezel
		if (l.bezelBottom() >= font.lineHeight + 2) {
			int textY = l.monY() + l.monH() + 1 + (l.bezelBottom() - 1 - font.lineHeight) / 2 + 1;
			graphics.drawCenteredString(font, brand, camX, textY, 0xFF7A808A);
		}

		drawDeck(graphics, l);
	}

	private static void drawDeck(GuiGraphics graphics, Layout l) {
		int y = l.deckY();
		int h = l.deckH();
		int lidX0 = l.lidX();
		int lidX1 = l.lidX() + l.lidW();
		// Hinge
		graphics.fill(lidX0 + 6, y, lidX1 - 6, y + 1, 0xFF101114);
		for (int row = 1; row < h; row++) {
			int grow = row * l.deckWide() / h;
			int x0 = lidX0 - grow;
			int x1 = lidX1 + grow;
			int color = row == h - 1 ? DECK_FRONT : lerpColor(DECK_FAR, DECK_NEAR, (float) row / h);
			graphics.fill(x0, y + row, x1, y + row + 1, color);
		}
		// Keys: a few rows of small dark caps, spreading out with the perspective
		int keyRows = Math.max(1, (h - 4) / 3);
		int keysTop = y + 2;
		for (int k = 0; k < keyRows; k++) {
			int rowY = keysTop + k * 3;
			if (rowY + 2 > y + h - 2) {
				break;
			}
			int grow = (rowY - y) * l.deckWide() / h;
			int x0 = lidX0 - grow + 6;
			int x1 = lidX1 + grow - 6;
			int pitch = Math.max(4, (x1 - x0) / 28);
			int capW = Math.max(2, pitch - 1);
			for (int x = x0; x + capW <= x1; x += pitch) {
				graphics.fill(x, rowY, x + capW, rowY + 2, KEY);
				graphics.fill(x, rowY, x + capW, rowY + 1, KEY_TOP);
			}
		}
		// Touchpad
		int padRow = keysTop + keyRows * 3;
		if (padRow + 2 < y + h - 1) {
			int padW = Math.max(10, l.lidW() / 6);
			int cx = lidX0 + l.lidW() / 2;
			graphics.fill(cx - padW / 2, padRow, cx + padW / 2, y + h - 1, TOUCHPAD);
		}
	}

	static int lerpColor(int a, int b, float t) {
		int ar = a >> 16 & 0xFF;
		int ag = a >> 8 & 0xFF;
		int ab = a & 0xFF;
		int r = (int) (ar + ((b >> 16 & 0xFF) - ar) * t);
		int g = (int) (ag + ((b >> 8 & 0xFF) - ag) * t);
		int bl = (int) (ab + ((b & 0xFF) - ab) * t);
		return 0xFF000000 | r << 16 | g << 8 | bl;
	}

	private static int clamp(int value, int min, int max) {
		return Math.max(min, Math.min(max, value));
	}
}
