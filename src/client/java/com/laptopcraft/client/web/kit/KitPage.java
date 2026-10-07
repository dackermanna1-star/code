package com.laptopcraft.client.web.kit;

import com.laptopcraft.client.os.ui.Gfx;
import com.laptopcraft.client.os.ui.WidgetGroup;
import com.laptopcraft.client.web.WebPage;
import com.mojang.blaze3d.platform.cursor.CursorTypes;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.client.gui.GuiGraphics;

/**
 * Immediate-mode helper base for web pages: during {@link #draw} a page registers clickable
 * regions ({@link #region}, {@link #linkTo}, {@link #button}) right where it draws them, and clicks
 * are dispatched to those regions afterwards. Widgets added to {@link #ui} get events first.
 */
public abstract class KitPage extends WebPage {
	protected final WidgetGroup ui = new WidgetGroup();
	private final List<Hit> hits = new ArrayList<>();
	/** Mouse position in document coordinates for the frame being drawn. */
	protected int mx, my;
	protected int scrollY;

	private record Hit(int x, int y, int w, int h, Runnable action) {
	}

	@Override
	public final void render(GuiGraphics g, int width, int viewportHeight, int scrollY, int mouseX, int mouseY, float partialTick) {
		hits.clear();
		this.mx = mouseX;
		this.my = mouseY;
		this.scrollY = scrollY;
		draw(g, width, viewportHeight, scrollY, partialTick);
		ui.render(g, mouseX, mouseY, partialTick);
		drawOverlay(g, width, viewportHeight, scrollY, partialTick);
	}

	/** Draws the page in document coordinates (sticky elements at {@code y = scrollY}). */
	protected abstract void draw(GuiGraphics g, int width, int viewportHeight, int scrollY, float partialTick);

	/** Drawn after widgets (popups, sticky headers that must cover widgets). */
	protected void drawOverlay(GuiGraphics g, int width, int viewportHeight, int scrollY, float partialTick) {
	}

	protected boolean hover(int x, int y, int w, int h) {
		return Gfx.hovered(mx, my, x, y, w, h);
	}

	/** Registers a clickable region; returns true while hovered (and shows the hand cursor). */
	protected boolean region(GuiGraphics g, int x, int y, int w, int h, Runnable action) {
		hits.add(new Hit(x, y, w, h, action));
		boolean hov = hover(x, y, w, h);
		if (hov) {
			g.requestCursor(CursorTypes.POINTING_HAND);
		}
		return hov;
	}

	/** Clickable region that navigates to {@code url} (shown in the browser status bar on hover). */
	protected boolean linkTo(GuiGraphics g, int x, int y, int w, int h, String url) {
		boolean hov = region(g, x, y, w, h, () -> page.navigate(url));
		if (hov) {
			page.hoverLink(url);
		}
		return hov;
	}

	/** A text link; returns its width. */
	protected int textLink(GuiGraphics g, String text, int x, int y, int color, String url) {
		int w = Gfx.width(text);
		if (linkTo(g, x, y - 1, w, 11, url)) {
			Gfx.rect(g, x, y + 9, w, 1, color);
		}
		Gfx.text(g, text, x, y, color);
		return w;
	}

	/** Rounded button with hover/press feedback. Returns true if hovered. */
	protected boolean button(GuiGraphics g, int x, int y, int w, int h, String label, int bg, int fg, Runnable action) {
		boolean hov = region(g, x, y, w, h, () -> {
			com.laptopcraft.client.os.ui.UI.playClick();
			action.run();
		});
		int c = hov ? Gfx.lighten(bg, 0.10f) : bg;
		Gfx.roundRect(g, x, y, w, h, Math.min(4, h / 3), c);
		String s = Gfx.ellipsize(label, w - 6);
		Gfx.textCentered(g, s, x + w / 2, y + (h - 8) / 2, fg);
		return hov;
	}

	/** Outlined button variant. */
	protected boolean outlineButton(GuiGraphics g, int x, int y, int w, int h, String label, int border, int fg, int bgHover, Runnable action) {
		boolean hov = region(g, x, y, w, h, () -> {
			com.laptopcraft.client.os.ui.UI.playClick();
			action.run();
		});
		if (hov) {
			Gfx.roundRect(g, x, y, w, h, Math.min(4, h / 3), bgHover);
		}
		Gfx.roundBorder(g, x, y, w, h, Math.min(4, h / 3), border);
		Gfx.textCentered(g, Gfx.ellipsize(label, w - 6), x + w / 2, y + (h - 8) / 2, fg);
		return hov;
	}

	@Override
	public boolean mouseClicked(double x, double y, int button) {
		if (ui.mouseClicked(x, y, button)) {
			return true;
		}
		if (button != 0) {
			return false;
		}
		for (int i = hits.size() - 1; i >= 0; i--) {
			Hit h = hits.get(i);
			if (Gfx.hovered(x, y, h.x, h.y, h.w, h.h)) {
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
