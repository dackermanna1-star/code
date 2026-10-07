package com.laptopcraft.client.os.apps.kit;

import com.laptopcraft.client.os.App;
import com.laptopcraft.client.os.Theme;
import com.laptopcraft.client.os.ui.Gfx;
import com.laptopcraft.client.os.ui.UI;
import com.laptopcraft.client.os.ui.WidgetGroup;
import com.mojang.blaze3d.platform.cursor.CursorTypes;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.client.gui.GuiGraphics;

/**
 * Immediate-mode helper base for apps: register click regions while drawing ({@link #region},
 * {@link #button}); widgets in {@link #ui} receive events first.
 */
public abstract class KitApp extends App {
	protected final WidgetGroup ui = new WidgetGroup();
	private final List<Hit> hits = new ArrayList<>();
	protected int mx, my;

	private record Hit(int x, int y, int w, int h, int button, Runnable action) {
	}

	@Override
	public final void render(GuiGraphics g, int width, int height, int mouseX, int mouseY, float partialTick) {
		hits.clear();
		mx = mouseX;
		my = mouseY;
		draw(g, width, height, partialTick);
		ui.render(g, mouseX, mouseY, partialTick);
		drawOverlay(g, width, height, partialTick);
	}

	protected abstract void draw(GuiGraphics g, int w, int h, float partialTick);

	protected void drawOverlay(GuiGraphics g, int w, int h, float partialTick) {
	}

	protected Theme t() {
		return ctx.theme();
	}

	protected boolean hover(int x, int y, int w, int h) {
		return Gfx.hovered(mx, my, x, y, w, h);
	}

	protected boolean region(GuiGraphics g, int x, int y, int w, int h, Runnable action) {
		hits.add(new Hit(x, y, w, h, 0, action));
		boolean hov = hover(x, y, w, h);
		if (hov) {
			g.requestCursor(CursorTypes.POINTING_HAND);
		}
		return hov;
	}

	/** Region reacting to the right mouse button. */
	protected void rightRegion(int x, int y, int w, int h, Runnable action) {
		hits.add(new Hit(x, y, w, h, 1, action));
	}

	/** Theme-aware button; {@code primary} uses the accent color. */
	protected boolean button(GuiGraphics g, int x, int y, int w, int h, String label, boolean primary, Runnable action) {
		boolean hov = region(g, x, y, w, h, () -> {
			UI.playClick();
			action.run();
		});
		Theme t = t();
		int bg = primary ? (hov ? Gfx.lighten(t.accent(), 0.1f) : t.accent()) : (hov ? t.hover() : t.surface());
		Gfx.roundRect(g, x, y, w, h, Math.min(4, h / 3), bg);
		if (!primary) {
			Gfx.roundBorder(g, x, y, w, h, Math.min(4, h / 3), t.border());
		}
		Gfx.textCentered(g, Gfx.ellipsize(label, w - 6), x + w / 2, y + (h - 8) / 2, primary ? t.accentText() : t.text());
		return hov;
	}

	@Override
	public boolean mouseClicked(double x, double y, int button) {
		if (ui.mouseClicked(x, y, button)) {
			return true;
		}
		for (int i = hits.size() - 1; i >= 0; i--) {
			Hit h = hits.get(i);
			if (h.button == button && Gfx.hovered(x, y, h.x, h.y, h.w, h.h)) {
				h.action.run();
				return true;
			}
		}
		return false;
	}

	@Override
	public boolean mouseReleased(double x, double y, int button) {
		return ui.mouseReleased(x, y, button);
	}

	@Override
	public boolean mouseDragged(double x, double y, int button, double dragX, double dragY) {
		return ui.mouseDragged(x, y, button, dragX, dragY);
	}

	@Override
	public boolean mouseScrolled(double x, double y, double amount) {
		return ui.mouseScrolled(x, y, amount);
	}

	@Override
	public boolean keyPressed(int keyCode, int scanCode, int modifiers) {
		return ui.keyPressed(keyCode, scanCode, modifiers);
	}

	@Override
	public boolean charTyped(int codePoint, int modifiers) {
		return ui.charTyped(codePoint, modifiers);
	}

	@Override
	public void tick() {
		ui.tick();
	}
}
