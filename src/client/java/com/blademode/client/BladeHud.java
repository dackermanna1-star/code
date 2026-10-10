package com.blademode.client;

import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.network.chat.Component;
import org.joml.Matrix3x2fStack;

/** Draws the blade-mode overlay and the cut line while it is being stretched. */
public final class BladeHud {
	private static final float FLASH_SECONDS = 0.22F;

	private BladeHud() {
	}

	public static void render(GuiGraphics g, DeltaTracker delta) {
		Minecraft mc = Minecraft.getInstance();
		if (mc.options.hideGui) {
			return;
		}
		int w = g.guiWidth();
		int h = g.guiHeight();
		if (BladeInput.isDrawing()) {
			// Cold blue tint with a dark vignette: the world is "paused" while you aim.
			g.fill(0, 0, w, h, 0x22102848);
			int band = Math.max(8, h / 5);
			g.fillGradient(0, 0, w, band, 0x88000000, 0x00000000);
			g.fillGradient(0, h - band, w, h, 0x00000000, 0x88000000);

			double[] l = BladeInput.line();
			float ax = toGuiX(l[0], w), ay = toGuiY(l[1], h);
			float bx = toGuiX(l[2], w), by = toGuiY(l[3], h);
			line(g, ax, ay, bx, by, 3, 0x5526B8FF);
			line(g, ax, ay, bx, by, 1, 0xFFE6FAFF);
			dot(g, ax, ay, 0xFFFFFFFF);
			dot(g, bx, by, 0xFF7FE3FF);

			Component hint = Component.translatable(BladeInput.mode() == BladeInput.LineMode.CENTERED
				? "hud.blademode.hint.centered" : "hud.blademode.hint.crosshair");
			g.drawCenteredString(mc.font, hint, w / 2, h - band + 4, 0xFFBFE9FF);
		} else {
			float age = BladeInput.lastSlashAge();
			if (age < FLASH_SECONDS) {
				float a = 1.0F - age / FLASH_SECONDS;
				double[] l = BladeInput.lastLine();
				// Extend the flash beyond the drawn line, like the blade overshooting.
				double ex = l[2] - l[0], ey = l[3] - l[1];
				float ax = toGuiX(l[0] - ex * 0.15, w), ay = toGuiY(l[1] - ey * 0.15, h);
				float bx = toGuiX(l[2] + ex * 0.15, w), by = toGuiY(l[3] + ey * 0.15, h);
				line(g, ax, ay, bx, by, 4, ((int) (a * 120) << 24) | 0x40C8FF);
				line(g, ax, ay, bx, by, 1, ((int) (a * 255) << 24) | 0xFFFFFF);
			}
		}
	}

	private static float toGuiX(double ndcX, int w) {
		return (float) ((ndcX + 1.0) * 0.5 * w);
	}

	private static float toGuiY(double ndcY, int h) {
		return (float) ((1.0 - ndcY) * 0.5 * h);
	}

	private static void line(GuiGraphics g, float x0, float y0, float x1, float y1, int halfWidth, int color) {
		float dx = x1 - x0;
		float dy = y1 - y0;
		float len = (float) Math.sqrt(dx * dx + dy * dy);
		if (len < 0.5F) {
			return;
		}
		Matrix3x2fStack pose = g.pose();
		pose.pushMatrix();
		pose.translate(x0, y0);
		pose.rotate((float) Math.atan2(dy, dx));
		g.fill(0, -halfWidth + (halfWidth > 1 ? 0 : 1), Math.round(len), halfWidth, color);
		pose.popMatrix();
	}

	private static void dot(GuiGraphics g, float x, float y, int color) {
		int ix = Math.round(x);
		int iy = Math.round(y);
		g.fill(ix - 2, iy - 2, ix + 2, iy + 2, color);
	}
}
