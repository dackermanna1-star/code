package com.laptopcraft.client.web;

import com.laptopcraft.client.os.ui.Ease;
import com.laptopcraft.client.os.ui.Gfx;
import java.util.List;
import net.minecraft.client.gui.GuiGraphics;

/** The browser's 404 page for unknown hosts: a hissing pixel creeper and links to real sites. */
public class NotFoundPage extends WebPage {
	private static final String[] CREEPER = {
			"gggggggg",
			"gggggggg",
			"gBBggBBg",
			"gBBggBBg",
			"gggBBggg",
			"ggBBBBgg",
			"ggBBBBgg",
			"ggBggBgg",
	};
	private static final int[] GREENS = {0xFF5DBB4C, 0xFF4CA83E, 0xFF6FD25B, 0xFF3F9234, 0xFF58B248};

	private final WebUrl url;
	private int linksY;

	public NotFoundPage(WebUrl url) {
		this.url = url;
	}

	@Override
	public String title() {
		return "404 — Not found";
	}

	@Override
	public int contentHeight(int width, int viewportHeight) {
		return Math.max(viewportHeight, 260 + SiteRegistry.all().size() * 16);
	}

	@Override
	public void render(GuiGraphics g, int width, int viewportHeight, int scrollY, int mouseX, int mouseY, float partialTick) {
		int cx = width / 2;
		int top = 18;
		// creeper with a "about to explode" pulse every few seconds
		long t = Ease.now() % 3200;
		float swell = t > 2600 ? (float) Math.sin((t - 2600) / 600.0 * Math.PI) : 0f;
		boolean flash = t > 2600 && (t / 100) % 2 == 0;
		int cell = 8 + Math.round(swell * 1.5f);
		int size = cell * 8;
		int ox = cx - size / 2;
		int oy = top + 36 - size / 2;
		for (int r = 0; r < 8; r++) {
			for (int c = 0; c < 8; c++) {
				char ch = CREEPER[r].charAt(c);
				int col = ch == 'B' ? 0xFF101010 : GREENS[Math.floorMod(r * 31 + c * 17 + r * c, GREENS.length)];
				if (flash) {
					col = Gfx.lerp(col, 0xFFFFFFFF, 0.65f);
				}
				Gfx.rect(g, ox + c * cell, oy + r * cell, cell, cell, col);
			}
		}
		int ty = top + 82;
		Gfx.textCenteredScaled(g, "Ssss… 404", cx, ty, 3f, 0xFF1D2127);
		Gfx.textCentered(g, "This page blew up.", cx, ty + 30, 0xFF3C434D);
		String host = url.host().isEmpty() ? "(empty address)" : url.host();
		Gfx.textCentered(g, Gfx.ellipsize("We couldn't find \"" + host + "\" anywhere in the Overworld.", width - 20), cx, ty + 44, 0xFF6A727E);
		Gfx.textCentered(g, "Maybe you were looking for:", cx, ty + 66, 0xFF3C434D);
		linksY = ty + 80;
		List<Site> sites = SiteRegistry.all();
		int colW = Math.min(200, width - 40);
		int lx = cx - colW / 2;
		for (int i = 0; i < sites.size(); i++) {
			Site s = sites.get(i);
			int ly = linksY + i * 16;
			boolean hov = Gfx.hovered(mouseX, mouseY, lx, ly - 2, colW, 14);
			if (hov) {
				Gfx.roundRect(g, lx - 2, ly - 2, colW + 4, 14, 3, 0xFFEFF3F8);
				page.hoverLink(s.host());
			}
			Gfx.icon(g, s.favicon(), lx, ly - 1, 12);
			Gfx.text(g, s.name(), lx + 16, ly + 1, hov ? 0xFF0B57D0 : 0xFF1A5FD6);
			if (hov) {
				Gfx.rect(g, lx + 16, ly + 10, Gfx.width(s.name()), 1, 0xFF0B57D0);
			}
			Gfx.textRight(g, s.host(), lx + colW, ly + 1, 0xFF8A919C);
		}
	}

	@Override
	public boolean mouseClicked(double x, double y, int button) {
		List<Site> sites = SiteRegistry.all();
		int colW = Math.min(200, page.viewportWidth() - 40);
		int lx = page.viewportWidth() / 2 - colW / 2;
		for (int i = 0; i < sites.size(); i++) {
			int ly = linksY + i * 16;
			if (Gfx.hovered(x, y, lx, ly - 2, colW, 14)) {
				if (button == 2) {
					page.openInNewTab(sites.get(i).host());
				} else {
					page.navigate(sites.get(i).host());
				}
				return true;
			}
		}
		return false;
	}
}
