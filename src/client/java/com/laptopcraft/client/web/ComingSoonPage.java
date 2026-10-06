package com.laptopcraft.client.web;

import com.laptopcraft.client.os.ui.Ease;
import com.laptopcraft.client.os.ui.Gfx;
import net.minecraft.client.gui.GuiGraphics;

/** "Coming soon" page in the site's brand color (used by {@link PlaceholderSite}). */
public class ComingSoonPage extends WebPage {
	private final PlaceholderSite site;
	private final WebUrl url;

	/** Page for {@code url} of a placeholder site. */
	public ComingSoonPage(PlaceholderSite site, WebUrl url) {
		this.site = site;
		this.url = url;
	}

	@Override
	public String title() {
		return site.name();
	}

	@Override
	public int background() {
		return 0xFFF7F7F9;
	}

	@Override
	public void render(GuiGraphics g, int width, int viewportHeight, int scrollY, int mouseX, int mouseY, float partialTick) {
		int color = site.themeColor();
		int headerH = 44;
		Gfx.rect(g, 0, 0, width, headerH, color);
		Gfx.gradientV(g, 0, headerH - 8, width, 8, 0x00000000, 0x22000000);
		int textCol = Gfx.contrastText(color);
		if (Gfx.textureExists(site.logo())) {
			Gfx.textureFit(g, site.logo(), 12, 6, 160, 32);
		} else {
			Gfx.icon(g, site.favicon(), 12, 12, 20);
			Gfx.textScaled(g, site.name(), 38, 14, 2f, textCol);
		}
		int cy = headerH + Math.max(20, (viewportHeight - headerH) / 2 - 50);
		float in = Ease.outCubic(Ease.progress(page.shownAt(), 400));
		int dy = Math.round((1f - in) * 8);
		Gfx.icon(g, site.favicon(), width / 2 - 16, cy + dy, 32);
		Gfx.textCenteredScaled(g, "Coming soon", width / 2, cy + 40 + dy, 2f, 0xFF1D2127);
		Gfx.textCentered(g, site.description(), width / 2, cy + 62 + dy, 0xFF5F6874);
		Gfx.textCentered(g, "We're still stacking the blocks for " + url, width / 2, cy + 76 + dy, 0xFF8A919C);
		int bw = Math.min(120, width - 40);
		float p = (Ease.now() % 2000) / 2000f;
		Gfx.roundRect(g, (width - bw) / 2, cy + 94 + dy, bw, 4, 2, 0xFFE3E6EA);
		int seg = bw / 4;
		Gfx.roundRect(g, (width - bw) / 2 + Math.round((bw - seg) * (0.5f + 0.5f * (float) Math.sin(p * Math.PI * 2))), cy + 94 + dy, seg, 4, 2, color);
	}
}
