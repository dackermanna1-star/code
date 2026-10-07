package com.laptopcraft.client.os;

import com.laptopcraft.client.os.ui.Ease;
import com.laptopcraft.client.os.ui.Gfx;
import com.laptopcraft.client.os.ui.Glyphs;
import net.minecraft.client.gui.GuiGraphics;

/** Boot, restart and shutdown visuals. Stateless; times are milliseconds since the phase started. */
final class BootScreen {
	/** Total boot time before the lock screen appears. */
	static final long BOOT_MS = 2600;
	static final long SHUTDOWN_MS = 1700;
	static final long RESTART_MS = 1500;

	private static final String[] BOOT_MESSAGES = {
			"Starting CubeOS…",
			"Loading chunks…",
			"Feeding the hamsters…",
			"Polishing emeralds…",
			"Almost there…",
	};

	private BootScreen() {
	}

	static void renderBoot(GuiGraphics g, int w, int h, long t) {
		Gfx.rect(g, 0, 0, w, h, 0xFF000000);
		float logoIn = Ease.outCubic(Ease.clamp01((t - 250) / 600f));
		float out = Ease.clamp01((t - (BOOT_MS - 300)) / 300f);
		float a = logoIn * (1f - out);
		if (a <= 0f) {
			return;
		}
		int size = h >= 280 ? 64 : 48;
		int cx = w / 2;
		int ly = h / 2 - size / 2 - 22 + Math.round((1f - logoIn) * 8);
		// soft round glow behind the logo
		for (int i = 4; i >= 1; i--) {
			int d = size + i * 14;
			Glyphs.circle(g, cx - d / 2, ly + size / 2 - d / 2, d, Gfx.withAlpha(0xFF3D8BFD, Math.round(9 * a)));
		}
		CubeLogo.draw(g, cx - size / 2, ly, size, Gfx.withAlpha(0xFFFFFFFF, Math.round(255 * a)));
		Gfx.textCenteredScaled(g, "CubeOS", cx, ly + size + 8, 2f, Gfx.withAlpha(0xFFFFFFFF, Math.round(255 * a)));
		// progress bar
		float prog = Ease.inOutCubic(Ease.clamp01((t - 500) / (float) (BOOT_MS - 800)));
		int bw = Math.min(140, w / 3);
		int by = ly + size + 32;
		Gfx.progressBar(g, cx - bw / 2, by, bw, 3, prog, Gfx.withAlpha(0xFF2A2D33, Math.round(255 * a)), Gfx.withAlpha(0xFF3D8BFD, Math.round(255 * a)));
		int idx = Math.min(BOOT_MESSAGES.length - 1, (int) (prog * BOOT_MESSAGES.length));
		Gfx.textCentered(g, BOOT_MESSAGES[idx], cx, by + 10, Gfx.withAlpha(0xFF8A9099, Math.round(255 * a)));
		Gfx.spinner(g, cx, h - 24, 7, Gfx.withAlpha(0xFFFFFFFF, Math.round(220 * a)));
	}

	/** Dark overlay with spinner + message; fades to black at the end. */
	static void renderPowerOff(GuiGraphics g, int w, int h, long t, long total, String message) {
		float in = Ease.outCubic(Ease.clamp01(t / 350f));
		Gfx.rect(g, 0, 0, w, h, Gfx.withAlpha(0xFF0B1220, Math.round(235 * in)));
		float fade = Ease.clamp01((t - (total - 450)) / 450f);
		float a = in * (1f - fade);
		Gfx.spinner(g, w / 2, h / 2 - 10, 9, Gfx.withAlpha(0xFFFFFFFF, Math.round(255 * a)));
		Gfx.textCenteredShadow(g, message, w / 2, h / 2 + 10, Gfx.withAlpha(0xFFFFFFFF, Math.round(255 * a)));
		if (fade > 0f) {
			Gfx.rect(g, 0, 0, w, h, Gfx.withAlpha(0xFF000000, Math.round(255 * fade)));
		}
	}
}
