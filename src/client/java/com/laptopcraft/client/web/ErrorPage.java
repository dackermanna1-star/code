package com.laptopcraft.client.web;

import com.laptopcraft.client.os.ui.Gfx;
import net.minecraft.client.gui.GuiGraphics;

/** Shown when a site's page throws: "Aw, Snap!" with the error and a reload hint. */
final class ErrorPage extends WebPage {
	private final WebUrl url;
	private final String error;

	ErrorPage(WebUrl url, Throwable t) {
		this.url = url;
		String msg = t.getMessage() == null ? "" : ": " + t.getMessage();
		this.error = t.getClass().getSimpleName() + (msg.length() > 140 ? msg.substring(0, 140) + "…" : msg);
	}

	@Override
	public String title() {
		return "Aw, Snap!";
	}

	@Override
	public int background() {
		return 0xFFF4F5F7;
	}

	@Override
	public void render(GuiGraphics g, int width, int viewportHeight, int scrollY, int mouseX, int mouseY, float partialTick) {
		int cx = width / 2;
		int cy = Math.max(20, viewportHeight / 2 - 50);
		// sad page glyph
		Gfx.roundRect(g, cx - 14, cy, 28, 34, 3, 0xFFB9C0CA);
		Gfx.rect(g, cx - 7, cy + 10, 3, 3, 0xFFFFFFFF);
		Gfx.rect(g, cx + 4, cy + 10, 3, 3, 0xFFFFFFFF);
		Gfx.rect(g, cx - 6, cy + 22, 12, 2, 0xFFFFFFFF);
		Gfx.rect(g, cx - 8, cy + 24, 2, 2, 0xFFFFFFFF);
		Gfx.rect(g, cx + 6, cy + 24, 2, 2, 0xFFFFFFFF);
		Gfx.textCenteredScaled(g, "Aw, Snap!", cx, cy + 44, 2f, 0xFF1D2127);
		Gfx.textCentered(g, "Something went wrong while displaying " + Gfx.ellipsize(url.toString(), width / 2) + ".", cx, cy + 66, 0xFF5F6874);
		Gfx.textCentered(g, Gfx.ellipsize(error, width - 30), cx, cy + 80, 0xFFB42318);
		Gfx.textCentered(g, "Press F5 or the reload button to try again.", cx, cy + 96, 0xFF8A919C);
	}
}
