package com.laptopcraft.client.os.apps;

import com.laptopcraft.account.Mail;
import com.laptopcraft.client.os.Icons;
import com.laptopcraft.client.os.Theme;
import com.laptopcraft.client.os.apps.kit.KitApp;
import com.laptopcraft.client.os.ui.Gfx;
import com.laptopcraft.client.os.ui.ScrollState;
import com.laptopcraft.client.web.kit.Kit;
import java.util.List;
import java.util.Locale;
import net.minecraft.client.gui.GuiGraphics;

/** CubeMail: the inbox for order confirmations, delivery notices, bank alerts and the occasional spam. */
public class MailApp extends KitApp {
	private static final String[] FOLDERS = {"Inbox", "Orders", "Bank", "Promotions"};
	private int folder;
	private long openId = -1;
	private final ScrollState listScroll = new ScrollState();
	private final ScrollState bodyScroll = new ScrollState();
	private int bodyH;

	@Override
	public String title() {
		int unread = ctx.account().unreadMail();
		return "CubeMail" + (unread > 0 ? " (" + unread + " unread)" : "");
	}

	private boolean inFolder(Mail m) {
		String from = m.from().toLowerCase(Locale.ROOT);
		return switch (folder) {
			case 1 -> from.contains("emerazon") || from.contains("ender eats");
			case 2 -> from.contains("bank") || from.contains("emeraldpay");
			case 3 -> !from.contains("emerazon") && !from.contains("ender eats") && !from.contains("bank") && !from.contains("emeraldpay") && !from.contains("cubeos");
			default -> true;
		};
	}

	private static int avatarColor(String from) {
		String f = from.toLowerCase(Locale.ROOT);
		if (f.contains("emerazon")) {
			return 0xFFFF9900;
		}
		if (f.contains("ender")) {
			return 0xFF8E44AD;
		}
		if (f.contains("bank") || f.contains("emeraldpay")) {
			return 0xFF1B7F3B;
		}
		return Gfx.lerp(0xFF3D8BFD, 0xFFE5484D, (float) Kit.rand(from, 3));
	}

	private String ago(long time) {
		long d = Math.max(0, ctx.gameTime() - time) / 20;
		if (d < 60) {
			return "now";
		}
		if (d < 3600) {
			return (d / 60) + "m";
		}
		return (d / 3600) + "h";
	}

	@Override
	protected void draw(GuiGraphics g, int w, int h, float pt) {
		Theme t = t();
		Gfx.rect(g, 0, 0, w, h, t.bg());
		List<Mail> all = ctx.account().snapshot().mail().stream().filter(this::inFolder).toList();
		int side = w >= 360 ? 78 : 0;
		if (side > 0) {
			Gfx.rect(g, 0, 0, side, h, t.surfaceAlt());
			button(g, 4, 4, side - 8, 16, "✉ Compose", true, () -> ctx.alert("Outgoing mail server is on fire",
					"Our Blaze-powered mail server overheated. Try a carrier pigeon (parrot) instead."));
			for (int i = 0; i < FOLDERS.length; i++) {
				int idx = i;
				int y = 26 + i * 18;
				boolean hov = region(g, 4, y, side - 8, 16, () -> {
					folder = idx;
					openId = -1;
					listScroll.scrollTo(0);
				});
				if (folder == i || hov) {
					Gfx.roundRect(g, 4, y, side - 8, 16, 4, folder == i ? t.selection() : t.hover());
				}
				Gfx.text(g, FOLDERS[i], 10, y + 4, t.text());
				if (i == 0 && ctx.account().unreadMail() > 0) {
					Gfx.textRight(g, String.valueOf(ctx.account().unreadMail()), side - 8, y + 4, t.accent());
				}
			}
			button(g, 4, h - 20, side - 8, 16, "Mark all read", false, () -> ctx.account().markAllRead());
		}
		int listW = Math.max(130, Math.min(200, (w - side) * 2 / 5));
		boolean split = w - side - listW >= 150;
		if (!split && openId >= 0) {
			listW = 0;
		}
		// list
		if (listW > 0) {
			int lx = side;
			int rowH = 34;
			listScroll.setContent(all.size() * rowH, h);
			Gfx.scissor(g, lx, 0, listW, h);
			int y = -listScroll.offset();
			if (all.isEmpty()) {
				Gfx.textCentered(g, "No mail here ✉", lx + listW / 2, 30, t.textDim());
			}
			for (Mail m : all) {
				if (y + rowH > 0 && y < h) {
					boolean sel = m.id() == openId;
					boolean hov = region(g, lx, y, listW, rowH, () -> {
						openId = m.id();
						bodyScroll.scrollTo(0);
						if (!m.read()) {
							ctx.account().markMailRead(m.id());
						}
					});
					Gfx.rect(g, lx, y, listW, rowH, sel ? t.selection() : hov ? t.hover() : t.bg());
					Gfx.rect(g, lx + 4, y + rowH - 1, listW - 8, 1, t.border());
					Gfx.roundRect(g, lx + 5, y + 6, 18, 18, 9, avatarColor(m.from()));
					Gfx.textCentered(g, Kit.initial(m.from()), lx + 14, y + 11, 0xFFFFFFFF);
					int tc = m.read() ? t.textDim() : t.text();
					Gfx.textClipped(g, m.from(), lx + 28, y + 4, listW - 56, tc);
					Gfx.textRight(g, ago(m.time()), lx + listW - 6, y + 4, t.textDim());
					Gfx.textClipped(g, m.subject(), lx + 28, y + 14, listW - 34, m.read() ? t.textDim() : t.accent());
					Gfx.textClipped(g, m.body().replace('\n', ' '), lx + 28, y + 24, listW - 34, t.textDim());
					if (!m.read()) {
						Gfx.roundRect(g, lx + 2, y + 14, 3, 3, 1, t.accent());
					}
				}
				y += rowH;
			}
			Gfx.endScissor(g);
			listScroll.renderScrollbar(g, lx + listW - 6, 0, h, mx, my);
			Gfx.rect(g, lx + listW, 0, 1, h, t.border());
		}
		// reading pane
		int px = side + listW + 1, pw = w - px;
		if (pw < 100) {
			return;
		}
		Mail open = all.stream().filter(m -> m.id() == openId).findFirst().orElse(null);
		if (open == null) {
			Gfx.icon(g, Icons.MAIL, px + pw / 2 - 16, h / 2 - 30, 32);
			Gfx.textCentered(g, all.isEmpty() ? "Nothing to read" : "Select a message to read it", px + pw / 2, h / 2 + 8, t.textDim());
			return;
		}
		bodyScroll.setContent(bodyH, h);
		Gfx.scissor(g, px, 0, pw, h);
		int y = 8 - bodyScroll.offset();
		if (!split) {
			if (region(g, px + 6, y, 40, 12, () -> openId = -1)) {
				Gfx.text(g, "← Back", px + 8, y + 2, t.accent());
			} else {
				Gfx.text(g, "← Back", px + 8, y + 2, t.textDim());
			}
			y += 14;
		}
		for (String line : Gfx.wrap(open.subject(), pw - 20)) {
			Gfx.text(g, line, px + 10, y, t.text());
			y += 11;
		}
		y += 4;
		Gfx.roundRect(g, px + 10, y, 20, 20, 10, avatarColor(open.from()));
		Gfx.textCentered(g, Kit.initial(open.from()), px + 20, y + 6, 0xFFFFFFFF);
		Gfx.textClipped(g, open.from(), px + 36, y + 2, pw - 120, t.text());
		Gfx.text(g, Kit.when(open.time()), px + 36, y + 12, t.textDim());
		long id = open.id();
		if (region(g, px + pw - 52, y + 2, 44, 14, () -> ctx.confirm("Delete message?", "\"" + open.subject() + "\" will be deleted.", () -> {
			ctx.account().deleteMail(id);
			openId = -1;
		}))) {
			Gfx.roundRect(g, px + pw - 52, y + 2, 44, 14, 4, t.hover());
		}
		Gfx.text(g, "Delete", px + pw - 46, y + 5, t.danger());
		y += 28;
		Gfx.rect(g, px + 10, y, pw - 20, 1, t.border());
		y += 8;
		y += Gfx.textWrapped(g, open.body(), px + 10, y, pw - 24, 11, t.text());
		if (!open.link().isEmpty()) {
			y += 10;
			String link = open.link();
			button(g, px + 10, y, Math.min(pw - 20, Gfx.width("Open " + link) + 20), 18, "Open " + link, true, () -> ctx.openUrl(link));
			y += 22;
		}
		Gfx.endScissor(g);
		bodyH = y + bodyScroll.offset() + 10;
		bodyScroll.renderScrollbar(g, w - 7, 0, h, mx, my);
	}

	@Override
	public boolean mouseScrolled(double x, double y, double amount) {
		int side = ctx.width() >= 360 ? 78 : 0;
		int listW = Math.max(130, Math.min(200, (ctx.width() - side) * 2 / 5));
		if (x < side + listW && (openId < 0 || ctx.width() - side - listW >= 150)) {
			return listScroll.mouseScrolled(amount);
		}
		return bodyScroll.mouseScrolled(amount);
	}
}
