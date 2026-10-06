package com.laptopcraft.client.os;

import com.laptopcraft.client.os.ui.Ease;
import com.laptopcraft.client.os.ui.Gfx;
import com.laptopcraft.client.os.ui.Glyphs;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import net.minecraft.client.gui.GuiGraphics;
import org.jspecify.annotations.Nullable;

/**
 * Bottom bar: start button + pinned/running app buttons (centered, Windows 11 style) and the tray
 * (wallet, mail badge, sound toggle, notification bell, clock). Display coordinates; the bar
 * occupies [deskH, deskH + HEIGHT).
 */
public final class Taskbar {
	public static final int HEIGHT = 22;
	private static final int BTN = 24;
	/** Apps pinned by default. */
	public static final List<String> PINNED = List.of("browser", "files", "notepad", "mail", "settings");

	private record Slot(String kind, @Nullable String appId, int x, int w) {
	}

	private final CubeOS os;
	private final List<Slot> slots = new ArrayList<>();
	private final Map<String, Long> bounce = new HashMap<>();
	private final Map<String, Integer> slotCenters = new HashMap<>();
	private int top;
	private int startX;
	private long hoverSince = -1;
	private @Nullable String hoverKey;
	private @Nullable Slot pressed;

	Taskbar(CubeOS os) {
		this.os = os;
	}

	/** Makes the app's taskbar icon hop (on launch). */
	void bounce(String appId) {
		bounce.put(appId, Ease.now());
	}

	/** Center of the app's button (minimize animation target). */
	int[] slotCenter(String appId) {
		Integer cx = slotCenters.get(appId);
		return new int[] {cx == null ? os.width() / 2 : cx, top + HEIGHT / 2};
	}

	int startButtonX() {
		return startX;
	}

	private List<String> appOrder() {
		Set<String> ids = new LinkedHashSet<>();
		for (String p : PINNED) {
			if (AppRegistry.get(p) != null) {
				ids.add(p);
			}
		}
		for (OSWindow w : os.windows().all()) {
			if (!w.dead) {
				ids.add(w.info.id());
			}
		}
		return new ArrayList<>(ids);
	}

	void render(GuiGraphics g, int width, int deskH, int mouseX, int mouseY) {
		Theme t = os.theme();
		top = deskH;
		slots.clear();
		slotCenters.clear();
		int bg = t.dark() ? 0xE0191A1E : 0xE6F3F4F6;
		Gfx.rect(g, 0, top, width, HEIGHT, bg);
		Gfx.rect(g, 0, top, width, 1, t.dark() ? 0x33FFFFFF : 0x22000000);

		// ---- tray (right to left); the thin sliver at the edge is "Show desktop"
		slots.add(new Slot("peek", null, width - 6, 6));
		int rx = width - 8;
		boolean h24 = OSSettings.clock24h(os.data());
		String time = os.clockText();
		String day = "Day " + OSClock.day(os.dayTime());
		int clockW = Math.max(Gfx.width(time), Gfx.width(day)) + 10;
		rx -= clockW;
		slots.add(new Slot("clock", null, rx, clockW));
		rx -= 2;
		rx -= 18;
		slots.add(new Slot("bell", null, rx, 18));
		rx -= 18;
		slots.add(new Slot("sound", null, rx, 18));
		rx -= 18;
		slots.add(new Slot("mail", null, rx, 18));
		String bal = Gfx.formatNumber(os.account().balance());
		int walletW = Gfx.width(bal) + 20;
		rx -= walletW + 2;
		slots.add(new Slot("wallet", null, rx, walletW));
		int trayLeft = rx;

		// ---- start + apps (centered group)
		List<String> apps = appOrder();
		int groupW = BTN + 4 + apps.size() * BTN;
		int gx = Math.max(4, (width - groupW) / 2);
		if (gx + groupW > trayLeft - 6) {
			gx = Math.max(4, trayLeft - 6 - groupW);
		}
		startX = gx;
		slots.add(new Slot("start", null, gx, BTN));
		int ax = gx + BTN + 4;
		for (String id : apps) {
			slots.add(new Slot("app", id, ax, BTN));
			slotCenters.put(id, ax + BTN / 2);
			ax += BTN;
		}

		// ---- draw
		Slot hov = slotAt(mouseX, mouseY);
		String key = hov == null ? null : hov.kind() + ":" + hov.appId();
		if (!java.util.Objects.equals(key, hoverKey)) {
			hoverKey = key;
			hoverSince = Ease.now();
		}
		for (Slot s : slots) {
			boolean h = s == hov;
			boolean down = h && pressed != null && pressed.kind().equals(s.kind()) && java.util.Objects.equals(pressed.appId(), s.appId());
			switch (s.kind()) {
				case "start" -> drawStart(g, s, h, down, t);
				case "app" -> drawApp(g, s, h, down, t);
				case "wallet" -> {
					hoverBg(g, s, h, down, t);
					Gfx.emerald(g, s.x() + 5, top + 7);
					Gfx.text(g, bal, s.x() + 16, top + 8, t.text());
				}
				case "mail" -> {
					hoverBg(g, s, h, down, t);
					Glyphs.mail(g, s.x() + 4, top + 8, t.text());
					int unread = os.account().unreadMail();
					if (unread > 0) {
						badge(g, s.x() + 10, top + 1, unread, t.danger());
					}
				}
				case "sound" -> {
					hoverBg(g, s, h, down, t);
					Glyphs.speaker(g, s.x() + 4, top + 7, OSSettings.sounds(os.data()), t.text());
				}
				case "bell" -> {
					hoverBg(g, s, h, down, t);
					Glyphs.bell(g, s.x() + 5, top + 6, os.popupAnchor("bell") ? t.accent() : t.text());
					int n = os.notifications().unseen();
					if (n > 0) {
						badge(g, s.x() + 10, top + 1, n, t.accent());
					}
				}
				case "peek" -> {
					Gfx.rect(g, s.x(), top + 5, 1, HEIGHT - 10, t.dark() ? 0x40FFFFFF : 0x30000000);
					if (h) {
						Gfx.rect(g, s.x() + 1, top + 1, s.w() - 1, HEIGHT - 1, t.hover());
					}
				}
				case "clock" -> {
					hoverBg(g, s, h, down, t);
					int cx = s.x() + s.w() / 2;
					Gfx.textCentered(g, time, cx, top + 2, t.text());
					Gfx.textCentered(g, day, cx, top + 12, t.textDim());
				}
				default -> {
				}
			}
		}
		// tooltips
		if (hov != null && Ease.now() - hoverSince > 500 && pressed == null) {
			String tip = tooltip(hov, h24);
			if (tip != null) {
				Gfx.tooltip(g, tip, mouseX, top - 30);
			}
		}
	}

	private @Nullable String tooltip(Slot s, boolean h24) {
		return switch (s.kind()) {
			case "start" -> "Start";
			case "app" -> {
				AppInfo info = AppRegistry.get(s.appId());
				List<OSWindow> ws = os.windows().windowsOf(s.appId());
				if (info == null) {
					yield null;
				}
				if (ws.size() == 1) {
					yield ws.get(0).title();
				}
				yield ws.size() > 1 ? info.name() + " (" + ws.size() + " windows)" : info.name();
			}
			case "wallet" -> "EmeraldPay wallet — open Emerald Bank";
			case "mail" -> {
				int u = os.account().unreadMail();
				yield u == 0 ? "Mail — no unread messages" : "Mail — " + u + " unread";
			}
			case "sound" -> OSSettings.sounds(os.data()) ? "Sounds on (click to mute)" : "Sounds muted (click to unmute)";
			case "bell" -> "Notifications";
			case "clock" -> OSClock.format(os.dayTime(), h24) + " · " + OSClock.moonPhaseName(os.moonPhase()) + " · " + os.weatherText();
			case "peek" -> "Show desktop";
			default -> null;
		};
	}

	private void hoverBg(GuiGraphics g, Slot s, boolean h, boolean down, Theme t) {
		if (h) {
			Gfx.roundRect(g, s.x(), top + 2, s.w(), HEIGHT - 4, 3, down ? t.pressed() : t.hover());
		}
	}

	private void badge(GuiGraphics g, int x, int y, int n, int color) {
		String s = n > 9 ? "9+" : Integer.toString(n);
		int w = Math.max(9, Gfx.width(s) + 3);
		Gfx.roundRect(g, x, y, w, 10, 3, color);
		Gfx.text(g, s, x + (w - Gfx.width(s)) / 2 + 1, y + 1, 0xFFFFFFFF);
	}

	private void drawStart(GuiGraphics g, Slot s, boolean h, boolean down, Theme t) {
		boolean open = os.startMenu().isOpen();
		if (h || open) {
			Gfx.roundRect(g, s.x(), top + 2, s.w(), HEIGHT - 4, 3, open ? t.pressed() : down ? t.pressed() : t.hover());
		}
		int size = 16;
		int dy = down ? 1 : 0;
		CubeLogo.draw(g, s.x() + (s.w() - size) / 2, top + 3 + dy, size, 0xFFFFFFFF);
	}

	private void drawApp(GuiGraphics g, Slot s, boolean h, boolean down, Theme t) {
		String id = s.appId();
		AppInfo info = AppRegistry.get(id);
		if (info == null) {
			return;
		}
		List<OSWindow> ws = os.windows().windowsOf(id);
		OSWindow focused = os.windows().focused();
		boolean isFocused = focused != null && focused.info.id().equals(id);
		if (h || isFocused) {
			Gfx.roundRect(g, s.x() + 1, top + 2, s.w() - 2, HEIGHT - 4, 3, isFocused && !h ? t.hover() : down ? t.pressed() : t.hover());
		}
		int dy = down ? 1 : 0;
		Long b = bounce.get(id);
		if (b != null) {
			float p = Ease.progress(b, 450);
			if (p >= 1f) {
				bounce.remove(id);
			} else {
				dy -= Math.round((float) Math.sin(p * Math.PI) * 4f);
			}
		}
		Gfx.icon(g, info.icon(), s.x() + (s.w() - 16) / 2, top + 2 + dy, 16);
		if (!ws.isEmpty()) {
			int lw = isFocused ? 8 : 3;
			int col = isFocused ? t.accent() : Gfx.withAlpha(t.textDim(), 0xC0);
			Gfx.roundRect(g, s.x() + (s.w() - lw) / 2, top + HEIGHT - 3, lw, 2, 1, col);
			if (ws.size() > 1) {
				Gfx.rect(g, s.x() + (s.w() - lw) / 2 + lw + 1, top + HEIGHT - 3, 1, 2, col);
			}
		}
	}

	private @Nullable Slot slotAt(double mx, double my) {
		if (my < top || my >= top + HEIGHT) {
			return null;
		}
		for (Slot s : slots) {
			if (mx >= s.x() && mx < s.x() + s.w()) {
				return s;
			}
		}
		return null;
	}

	/** Mouse down inside the taskbar. */
	boolean mouseClicked(double mx, double my, int button) {
		if (my < top) {
			return false;
		}
		Slot s = slotAt(mx, my);
		if (s == null) {
			return true;
		}
		if (button == 1 && "app".equals(s.kind())) {
			appMenu(s, mx);
			return true;
		}
		if (button == 0) {
			pressed = s;
		}
		return true;
	}

	boolean mouseReleased(double mx, double my, int button) {
		Slot p = pressed;
		pressed = null;
		if (p == null) {
			return false;
		}
		Slot s = slotAt(mx, my);
		if (s == null || !s.kind().equals(p.kind()) || !java.util.Objects.equals(s.appId(), p.appId())) {
			return true;
		}
		activate(s);
		return true;
	}

	private void activate(Slot s) {
		OSSounds.click();
		if (!s.kind().equals("bell") && !s.kind().equals("clock")) {
			os.closePopup();
		}
		switch (s.kind()) {
			case "start" -> os.toggleStartMenu();
			case "app" -> clickApp(s.appId());
			case "wallet" -> os.openUrl("emeraldbank.mc");
			case "mail" -> os.openApp("mail", null);
			case "sound" -> {
				boolean on = !OSSettings.sounds(os.data());
				os.data().setBool(OSSettings.SOUNDS, on);
				OSSounds.setEnabled(on);
				if (on) {
					OSSounds.click();
				}
			}
			case "bell" -> os.togglePopup("bell");
			case "clock" -> os.togglePopup("clock");
			case "peek" -> os.windows().toggleShowDesktop();
			default -> {
			}
		}
	}

	private void clickApp(String id) {
		List<OSWindow> ws = os.windows().windowsOf(id);
		if (ws.isEmpty()) {
			os.openApp(id, null);
			return;
		}
		OSWindow focused = os.windows().focused();
		if (focused != null && focused.info.id().equals(id)) {
			if (ws.size() == 1) {
				os.windows().minimize(focused);
			} else {
				// cycle to the next window of this app
				int i = ws.indexOf(focused);
				os.windows().focus(ws.get((i + 1) % ws.size()));
			}
			return;
		}
		OSWindow topMost = ws.get(ws.size() - 1);
		os.windows().focus(topMost);
	}

	private void appMenu(Slot s, double mx) {
		String id = s.appId();
		AppInfo info = AppRegistry.get(id);
		if (info == null) {
			return;
		}
		List<OSWindow> ws = os.windows().windowsOf(id);
		List<MenuItem> items = new ArrayList<>();
		items.add(MenuItem.disabled(info.name()));
		items.add(MenuItem.separator());
		if (!info.singleInstance() || ws.isEmpty()) {
			items.add(MenuItem.of(ws.isEmpty() ? "Open" : "New window", info.icon(), () -> os.openApp(id, null)));
		}
		if (!ws.isEmpty()) {
			items.add(MenuItem.of(ws.size() > 1 ? "Close all windows" : "Close window", () -> {
				for (OSWindow w : ws) {
					os.windows().requestClose(w);
				}
			}).danger());
		}
		os.showContextMenu(new ContextMenu(items, mx, top, os.width(), os.desktopHeight() + HEIGHT, true));
	}

	boolean contains(double mx, double my) {
		return my >= top && my < top + HEIGHT;
	}

	/** Bounds of a tray element for anchoring popups: {x, w}. */
	int[] slotBounds(String kind) {
		for (Slot s : slots) {
			if (s.kind().equals(kind)) {
				return new int[] {s.x(), s.w()};
			}
		}
		return new int[] {os.width() - 40, 40};
	}
}
