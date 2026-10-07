package com.laptopcraft.client.os.apps;

import com.laptopcraft.client.os.Icons;
import com.laptopcraft.client.os.OSData;
import com.laptopcraft.client.os.OSSettings;
import com.laptopcraft.client.os.Theme;
import com.laptopcraft.client.os.Themes;
import com.laptopcraft.client.os.Wallpapers;
import com.laptopcraft.client.os.apps.kit.KitApp;
import com.laptopcraft.client.os.ui.Ease;
import com.laptopcraft.client.os.ui.Gfx;
import com.laptopcraft.client.os.ui.ScrollState;
import com.laptopcraft.client.os.ui.TextField;
import com.laptopcraft.registry.ModSounds;
import java.util.List;
import net.minecraft.client.gui.GuiGraphics;

/** CubeOS Settings: personalization, account, date & time, sound, browser, storage and about. */
public class SettingsApp extends KitApp {
	private static final String[] SECTIONS = {"Personalization", "Account", "Date & Time", "Sound", "Browser", "Storage", "About"};
	private static final String[] ICONS = {"paint", "user", "clock", "volume", "browser", "folder", "info"};
	private int section;
	private final ScrollState scroll = new ScrollState();
	private final TextField username = new TextField("Your name");
	private final TextField password = new TextField("New password (empty = none)");
	private final TextField homepage = new TextField("bloogle.mc");
	private long updateCheck = -1;
	private int contentH;

	@Override
	public void init() {
		OSData d = ctx.data();
		username.maxLength = 24;
		username.setText(ctx.username());
		username.onEnter = this::saveName;
		password.maxLength = 32;
		password.password = true;
		homepage.maxLength = 64;
		homepage.setText(OSSettings.homepage(d));
		homepage.onEnter = s -> {
			d.setString(OSSettings.HOMEPAGE, s.isBlank() ? OSSettings.DEFAULT_HOMEPAGE : s.trim());
			ctx.notify("success", "Homepage saved", "New tabs open " + OSSettings.homepage(d));
		};
		ui.add(username);
		ui.add(password);
		ui.add(homepage);
	}

	private void saveName(String s) {
		if (!s.isBlank()) {
			ctx.data().setString(OSSettings.USERNAME, s.trim());
			ctx.notify("success", "Name changed", "Hi, " + s.trim() + "!");
		}
	}

	@Override
	public String title() {
		return "Settings — " + SECTIONS[section];
	}

	@Override
	protected void draw(GuiGraphics g, int w, int h, float pt) {
		Theme t = t();
		Gfx.rect(g, 0, 0, w, h, t.bg());
		int side = w >= 300 ? 104 : 22;
		Gfx.rect(g, 0, 0, side, h, t.surfaceAlt());
		for (int i = 0; i < SECTIONS.length; i++) {
			int y = 6 + i * 20;
			int idx = i;
			boolean hov = region(g, 3, y, side - 6, 18, () -> {
				section = idx;
				scroll.scrollTo(0);
			});
			if (i == section) {
				Gfx.roundRect(g, 3, y, side - 6, 18, 4, t.selection());
				Gfx.rect(g, 3, y + 4, 2, 10, t.accent());
			} else if (hov) {
				Gfx.roundRect(g, 3, y, side - 6, 18, 4, t.hover());
			}
			Gfx.icon(g, Icons.icon(ICONS[i]), 7, y + 3, 12);
			if (side > 30) {
				Gfx.textClipped(g, SECTIONS[i], 24, y + 5, side - 30, t.text());
			}
		}
		int x = side + 10, cw = w - side - 20;
		username.visible = section == 1;
		password.visible = section == 1;
		homepage.visible = section == 4;
		scroll.setContent(contentH, h);
		int top = 8 - scroll.offset();
		Gfx.scissor(g, side, 0, w - side, h);
		Gfx.textScaled(g, SECTIONS[section], x, top, 1.5f, t.text());
		int y = top + 20;
		y = switch (section) {
			case 0 -> personalization(g, x, y, cw);
			case 1 -> account(g, x, y, cw);
			case 2 -> dateTime(g, x, y, cw);
			case 3 -> sound(g, x, y, cw);
			case 4 -> browser(g, x, y, cw);
			case 5 -> storage(g, x, y, cw);
			default -> about(g, x, y, cw);
		};
		Gfx.endScissor(g);
		contentH = y - top + 10;
		scroll.renderScrollbar(g, w - 7, 0, h, mx, my);
	}

	private int heading(GuiGraphics g, String s, int x, int y) {
		Gfx.text(g, s, x, y, t().textDim());
		return y + 12;
	}

	private int toggleRow(GuiGraphics g, String label, String desc, boolean value, int x, int y, int w, Runnable flip) {
		Theme t = t();
		boolean hov = region(g, x, y, w, 26, flip);
		Gfx.roundRect(g, x, y, w, 26, 4, hov ? t.hover() : t.surface());
		Gfx.text(g, label, x + 8, y + 4, t.text());
		Gfx.textClipped(g, desc, x + 8, y + 15, w - 50, t.textDim());
		int sx = x + w - 30;
		Gfx.roundRect(g, sx, y + 8, 22, 11, 5, value ? t.accent() : t.border());
		float k = value ? 1 : 0;
		Gfx.roundRect(g, sx + 1 + (int) (k * 11), y + 9, 9, 9, 4, 0xFFFFFFFF);
		return y + 30;
	}

	private int personalization(GuiGraphics g, int x, int y, int w) {
		Theme t = t();
		OSData d = ctx.data();
		y = heading(g, "Wallpaper", x, y);
		String cur = OSSettings.wallpaper(d);
		int tw = 72, th = 40, cols = Math.max(1, (w + 6) / (tw + 6));
		List<Wallpapers.Wallpaper> all = Wallpapers.ALL;
		int n = all.size() + Wallpapers.COLOR_PRESETS.size();
		for (int i = 0; i < n; i++) {
			String id = i < all.size() ? all.get(i).id() : Wallpapers.COLOR_PRESETS.get(i - all.size());
			int tx = x + (i % cols) * (tw + 6), ty = y + (i / cols) * (th + 6);
			boolean hov = region(g, tx, ty, tw, th, () -> d.setString(OSSettings.WALLPAPER, id));
			Gfx.scissor(g, tx, ty, tw, th);
			Wallpapers.render(g, id, tx, ty, tw, th);
			Gfx.endScissor(g);
			Gfx.border(g, tx - 1, ty - 1, tw + 2, th + 2, id.equals(cur) ? t.accent() : hov ? t.textDim() : t.border());
			if (id.equals(cur)) {
				Gfx.border(g, tx - 2, ty - 2, tw + 4, th + 4, t.accent());
			}
			if (hov && i < all.size()) {
				Gfx.tooltip(g, all.get(i).name(), mx, my);
			}
		}
		y += ((n + cols - 1) / cols) * (th + 6) + 6;
		y = heading(g, "Theme", x, y);
		boolean dark = OSSettings.dark(d);
		for (int i = 0; i < 2; i++) {
			boolean isDark = i == 0;
			int bx = x + i * 88;
			boolean hov = region(g, bx, y, 80, 46, () -> d.setString(OSSettings.THEME, isDark ? "dark" : "light"));
			Theme prev = isDark ? Themes.dark(t.accent()) : Themes.light(t.accent());
			Gfx.roundRect(g, bx, y, 80, 36, 4, prev.bg());
			Gfx.roundRect(g, bx + 6, y + 6, 48, 24, 3, prev.surface());
			Gfx.rect(g, bx + 6, y + 6, 48, 5, prev.titleBar());
			Gfx.roundRect(g, bx + 58, y + 22, 16, 8, 3, prev.accent());
			Gfx.roundBorder(g, bx - 1, y - 1, 82, 38, 4, dark == isDark ? t.accent() : hov ? t.textDim() : t.border());
			Gfx.text(g, isDark ? "Dark" : "Light", bx + 2, y + 39, t.text());
		}
		y += 54;
		y = heading(g, "Accent color", x, y);
		int ax = x;
		for (Themes.Accent a : Themes.ACCENTS) {
			if (ax + 18 > x + w) {
				ax = x;
				y += 22;
			}
			boolean sel = a.color() == t.accent();
			boolean hov = region(g, ax, y, 16, 16, () -> d.setInt(OSSettings.ACCENT, a.color()));
			Gfx.roundRect(g, ax, y, 16, 16, 8, a.color());
			if (sel || hov) {
				Gfx.roundBorder(g, ax - 2, y - 2, 20, 20, 10, sel ? t.text() : t.textDim());
			}
			if (hov) {
				Gfx.tooltip(g, a.name(), mx, my);
			}
			ax += 22;
		}
		y += 26;
		return toggleRow(g, "Desktop icons", "Show app and file icons on the desktop", OSSettings.showDesktopIcons(d), x, y, w,
				() -> d.setBool(OSSettings.SHOW_DESKTOP_ICONS, !OSSettings.showDesktopIcons(d)));
	}

	private int account(GuiGraphics g, int x, int y, int w) {
		Theme t = t();
		OSData d = ctx.data();
		y = heading(g, "Display name", x, y);
		username.setBounds(x, y, Math.min(w - 70, 160), 16);
		button(g, x + Math.min(w - 70, 160) + 6, y, 56, 16, "Save", true, () -> saveName(username.getText()));
		y += 26;
		y = heading(g, "Lock screen password", x, y);
		boolean has = !OSSettings.password(d).isEmpty();
		Gfx.textClipped(g, has ? "Password is set — CubeOS asks for it on the lock screen." : "No password — anyone can unlock this laptop.", x, y, w, has ? t.success() : t.warning());
		y += 12;
		password.setBounds(x, y, Math.min(w - 70, 160), 16);
		button(g, x + Math.min(w - 70, 160) + 6, y, 56, 16, password.getText().isEmpty() ? "Remove" : "Set", true, () -> {
			d.setString(OSSettings.PASSWORD, password.getText());
			ctx.notify("success", password.getText().isEmpty() ? "Password removed" : "Password set", "Don't tell the villagers.");
			password.setText("");
		});
		y += 26;
		y = heading(g, "EmeraldPay wallet", x, y);
		Gfx.roundRect(g, x, y, w, 40, 6, t.surface());
		Gfx.emerald(g, x + 10, y + 10);
		Gfx.textScaled(g, Gfx.formatNumber(ctx.account().balance()), x + 24, y + 7, 2f, t.text());
		Gfx.text(g, "Laptop owner: " + ctx.username(), x + 10, y + 27, t.textDim());
		button(g, x + w - 96, y + 12, 88, 16, "Open Emerald Bank", false, () -> ctx.openUrl("emeraldbank.mc"));
		return y + 48;
	}

	private int dateTime(GuiGraphics g, int x, int y, int w) {
		Theme t = t();
		OSData d = ctx.data();
		Gfx.roundRect(g, x, y, w, 46, 6, t.surface());
		Gfx.textScaled(g, ctx.clockText(), x + 10, y + 8, 2f, t.text());
		Gfx.text(g, "Day " + ctx.day() + " · synced with the sun", x + 10, y + 30, t.textDim());
		y += 54;
		return toggleRow(g, "24-hour clock", "Show 17:30 instead of 5:30 PM", OSSettings.clock24h(d), x, y, w,
				() -> d.setBool(OSSettings.CLOCK_24H, !OSSettings.clock24h(d)));
	}

	private int sound(GuiGraphics g, int x, int y, int w) {
		OSData d = ctx.data();
		y = toggleRow(g, "System sounds", "Clicks, notifications, boot chime", OSSettings.sounds(d), x, y, w,
				() -> d.setBool(OSSettings.SOUNDS, !OSSettings.sounds(d)));
		button(g, x, y + 4, 80, 16, "Test sound ♪", true, () -> ctx.playSound(ModSounds.LAPTOP_NOTIFY, 1f));
		return y + 26;
	}

	private int browser(GuiGraphics g, int x, int y, int w) {
		y = heading(g, "Homepage", x, y);
		homepage.setBounds(x, y, Math.min(w - 70, 180), 16);
		button(g, x + Math.min(w - 70, 180) + 6, y, 56, 16, "Save", true, () -> homepage.onEnter.accept(homepage.getText()));
		y += 28;
		y = heading(g, "Privacy", x, y);
		button(g, x, y, 130, 16, "Clear browsing data", false, () -> ctx.confirm("Clear browsing data?",
				"Removes bookmarks, history, carts and site data stored by the browser.", () -> {
					var st = ctx.data().appState("browser");
					for (String k : List.copyOf(st.keySet())) {
						st.remove(k);
					}
					ctx.data().saveAppState("browser");
					ctx.notify("success", "Browsing data cleared", "Fresh as a new world.");
				}));
		return y + 24;
	}

	private int storage(GuiGraphics g, int x, int y, int w) {
		Theme t = t();
		List<OSData.FileEntry> files = ctx.data().listFiles();
		int text = 0, image = 0, other = 0;
		for (OSData.FileEntry f : files) {
			switch (f.type()) {
				case "text" -> text += f.size();
				case "image" -> image += f.size();
				default -> other += f.size();
			}
		}
		int total = text + image + other;
		int cap = 1024 * 1024;
		Gfx.text(g, files.size() + " files · " + kb(total) + " of " + kb(cap) + " used", x, y, t.text());
		y += 14;
		Gfx.roundRect(g, x, y, w, 12, 6, t.surfaceAlt());
		int tx = x;
		int[][] parts = {{text, 0xFF3D8BFD}, {image, 0xFFF2B33D}, {other, 0xFF9B5CF6}};
		for (int[] p : parts) {
			int pw = (int) ((long) p[0] * w / cap);
			if (pw > 0) {
				Gfx.rect(g, tx, y, Math.max(2, pw), 12, p[1]);
				tx += Math.max(2, pw);
			}
		}
		y += 20;
		String[] names = {"Documents", "Pictures", "Other"};
		for (int i = 0; i < 3; i++) {
			Gfx.roundRect(g, x, y + 1, 8, 8, 2, parts[i][1]);
			Gfx.text(g, names[i] + " — " + kb(parts[i][0]), x + 12, y + 1, t.textDim());
			y += 12;
		}
		return y + 6;
	}

	private static String kb(int bytes) {
		return bytes < 1024 ? bytes + " B" : String.format("%.1f KB", bytes / 1024.0);
	}

	private int about(GuiGraphics g, int x, int y, int w) {
		Theme t = t();
		Gfx.icon(g, Icons.LOGO, x, y, 40);
		Gfx.textScaled(g, "CubeOS 21.11", x + 48, y + 4, 1.5f, t.text());
		Gfx.text(g, "\"Copper Golem\" · build 2611.4671", x + 48, y + 20, t.textDim());
		y += 50;
		String[][] specs = {{"Device", "CubeBook Pro 16\""}, {"Processor", "Redstone R9 9950X @ 4.2 GHz"}, {"Memory", "64 GB (stored in chests)"},
				{"Graphics", "Glowstone RTX 4090"}, {"Storage", "1 MB EnderDrive"}, {"User", ctx.username()}, {"World day", String.valueOf(ctx.day())},
				{"Uptime", (ctx.uptimeMillis() / 60000) + " min " + (ctx.uptimeMillis() / 1000 % 60) + " s"}};
		for (String[] s : specs) {
			Gfx.text(g, s[0], x, y, t.textDim());
			Gfx.textClipped(g, s[1], x + 70, y, w - 70, t.text());
			y += 12;
		}
		y += 6;
		if (updateCheck < 0) {
			button(g, x, y, 110, 16, "Check for updates", true, () -> updateCheck = Ease.now());
		} else if (Ease.now() - updateCheck < 2200) {
			Gfx.spinner(g, x + 8, y + 8, 6, t.accent());
			Gfx.text(g, "Checking for updates…", x + 20, y + 4, t.textDim());
		} else {
			Gfx.text(g, "✔ You're up to date! (Probably. Who knows with Endermen.)", x, y + 4, t.success());
		}
		return y + 24;
	}

	@Override
	public boolean mouseScrolled(double x, double y, double amount) {
		return super.mouseScrolled(x, y, amount) || scroll.mouseScrolled(amount);
	}
}
