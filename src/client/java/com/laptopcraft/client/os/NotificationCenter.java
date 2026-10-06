package com.laptopcraft.client.os;

import com.laptopcraft.client.os.ui.Gfx;
import com.laptopcraft.client.os.ui.Glyphs;
import com.laptopcraft.client.os.ui.ScrollState;
import com.laptopcraft.client.os.ui.UI;
import java.util.List;
import net.minecraft.client.gui.GuiGraphics;

/** Flyout listing this session's notifications with "Clear all". */
final class NotificationCenter extends Popup {
	private static final int HEADER = 24;
	private final ScrollState scroll = new ScrollState();

	NotificationCenter(CubeOS os) {
		super(os, "bell");
		os.notifications().markSeen();
		os.notifications().dismissAllToasts();
	}

	private int entryHeight(Notifications.Entry e) {
		int lines = e.message().isEmpty() ? 0 : Math.min(3, Gfx.wrap(e.message(), w - 44).size());
		return 20 + lines * 10 + 4;
	}

	@Override
	void render(GuiGraphics g, int mouseX, int mouseY) {
		Theme t = UI.theme();
		List<Notifications.Entry> list = os.notifications().history();
		int content = 0;
		for (Notifications.Entry e : list) {
			content += entryHeight(e) + 4;
		}
		layout(os.width(), os.desktopHeight(), 210, Math.max(110, Math.min(260, HEADER + content + 8)));
		int yy = y + slide();
		Gfx.shadow(g, x, yy, w, h, 8, 0x60);
		Gfx.panel(g, x, yy, w, h, 6, t.surface(), t.border());
		Gfx.text(g, "Notifications", x + 10, yy + 9, t.text());
		boolean any = !list.isEmpty();
		if (any) {
			String clear = "Clear all";
			int cw = Gfx.width(clear);
			boolean hov = Gfx.hovered(mouseX, mouseY, x + w - cw - 14, yy + 4, cw + 8, 16);
			if (hov) {
				Gfx.roundRect(g, x + w - cw - 14, yy + 5, cw + 8, 14, 3, t.hover());
			}
			Gfx.text(g, clear, x + w - cw - 10, yy + 9, t.accent());
		}
		Gfx.rect(g, x + 1, yy + HEADER - 1, w - 2, 1, t.border());
		int listY = yy + HEADER;
		int listH = h - HEADER - 4;
		if (!any) {
			int cx = x + w / 2;
			Glyphs.bell(g, cx - 4, listY + listH / 2 - 18, t.textDim());
			Gfx.textCentered(g, "No notifications", cx, listY + listH / 2 - 4, t.text());
			Gfx.textCentered(g, "You're all caught up ✔", cx, listY + listH / 2 + 8, t.textDim());
			return;
		}
		scroll.setContent(content + 4, listH);
		Gfx.scissor(g, x + 1, listY, w - 2, listH);
		int ey = listY + 4 - scroll.offset();
		for (Notifications.Entry e : list) {
			int eh = entryHeight(e);
			if (ey + eh >= listY && ey < listY + listH) {
				Gfx.roundRect(g, x + 6, ey, w - 12, eh, 4, t.surfaceAlt());
				Gfx.rect(g, x + 7, ey + 4, 2, eh - 8, Notifications.accentFor(e.icon(), t));
				Gfx.icon(g, Icons.notification(e.icon()), x + 13, ey + 5, 16);
				Gfx.textClipped(g, e.title(), x + 34, ey + 5, w - 44 - Gfx.width(Notifications.ago(e.createdAt())) - 4, t.text());
				Gfx.textRight(g, Notifications.ago(e.createdAt()), x + w - 10, ey + 5, t.textDim());
				List<String> lines = Gfx.wrap(e.message(), w - 44);
				for (int i = 0; i < Math.min(3, lines.size()); i++) {
					Gfx.text(g, lines.get(i), x + 34, ey + 16 + i * 10, t.textDim());
				}
			}
			ey += eh + 4;
		}
		Gfx.endScissor(g);
		scroll.renderScrollbar(g, x + w - ScrollState.BAR_WIDTH - 1, listY + 2, listH - 4, mouseX, mouseY);
	}

	@Override
	boolean mouseClicked(double mx, double my, int button) {
		if (!contains(mx, my)) {
			return false;
		}
		String clear = "Clear all";
		int cw = Gfx.width(clear);
		if (!os.notifications().history().isEmpty() && Gfx.hovered(mx, my, x + w - cw - 14, y + 4, cw + 8, 16)) {
			os.notifications().clearHistory();
			UI.playClick();
			return true;
		}
		scroll.mouseClicked(mx, my, x + w - ScrollState.BAR_WIDTH - 1, y + HEADER + 2, h - HEADER - 8);
		return true;
	}

	@Override
	boolean mouseDragged(double mx, double my, int button, double dx, double dy) {
		return scroll.mouseDragged(my);
	}

	@Override
	boolean mouseReleased(double mx, double my, int button) {
		return scroll.mouseReleased();
	}

	@Override
	boolean mouseScrolled(double mx, double my, double amount) {
		if (!contains(mx, my)) {
			return false;
		}
		scroll.mouseScrolled(amount);
		return true;
	}
}
