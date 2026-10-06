package com.laptopcraft.client.os;

import com.laptopcraft.client.os.ui.Ease;
import com.laptopcraft.client.os.ui.Gfx;
import net.minecraft.client.gui.GuiGraphics;

/**
 * Stand-in for apps that are still being built: centered icon, "&lt;App&gt; is being installed…" and an
 * animated progress bar. Real apps replace their placeholder class.
 */
public class PlaceholderApp extends App {
	private final String appId;

	public PlaceholderApp(String appId) {
		this.appId = appId;
	}

	@Override
	public void render(GuiGraphics g, int width, int height, int mouseX, int mouseY, float partialTick) {
		Theme t = ctx.theme();
		Gfx.rect(g, 0, 0, width, height, t.bg());
		AppInfo info = AppRegistry.get(appId);
		String name = info == null ? appId : info.name();
		int cy = height / 2 - 34;
		int bob = Math.round((float) Math.sin(Ease.now() / 400.0) * 2f);
		if (info != null) {
			Gfx.icon(g, info.icon(), width / 2 - 16, cy + bob, 32);
		}
		Gfx.textCentered(g, name + " is being installed…", width / 2, cy + 40, t.text());
		int bw = Math.min(140, width - 40);
		int bx = (width - bw) / 2;
		int by = cy + 54;
		Gfx.roundRect(g, bx, by, bw, 4, 2, t.surfaceAlt());
		// indeterminate bar: a segment sliding back and forth
		float p = (Ease.now() % 1600) / 1600f;
		float pos = p < 0.5f ? Ease.inOutCubic(p * 2) : 1f - Ease.inOutCubic((p - 0.5f) * 2);
		int segW = bw / 3;
		Gfx.roundRect(g, bx + Math.round((bw - segW) * pos), by, segW, 4, 2, t.accent());
		Gfx.textCentered(g, "Please keep your CubeBook plugged in.", width / 2, by + 12, t.textDim());
	}
}
