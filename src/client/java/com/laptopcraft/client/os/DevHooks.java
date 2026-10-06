package com.laptopcraft.client.os;

import com.laptopcraft.LaptopCraft;
import java.util.List;
import java.util.Locale;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import org.jspecify.annotations.Nullable;

/**
 * Developer hooks used by the screenshot harness ({@code dev:<command>} steps). If no laptop screen is
 * open, {@code open}, {@code url}, {@code skipboot} and {@code boot} open the offline dev laptop
 * (in-memory data, fake account) — also inside a world, which then shows dimmed behind the laptop.
 *
 * <p>Commands: {@code open <appId> [arg]}, {@code url <url>}, {@code skipboot}, {@code boot}, {@code maximize},
 * {@code close-all}, {@code notify <title>|<msg>}, {@code notifyicon <icon> <title>|<msg>}, {@code wallpaper <id>},
 * {@code theme dark|light}, {@code accent <AARRGGBB>}, {@code password <pw>|none}, {@code lock}, {@code startmenu},
 * {@code focus <appId>}, {@code size <w> <h>}, {@code move <x> <y>}, {@code alert|confirm|prompt} (dialog in the
 * focused window), {@code sysdialog}, {@code notifcenter}, {@code calendar}, {@code about}, {@code newfile},
 * {@code sleep}, {@code restart}, {@code shutdown}, {@code crashtest}, {@code toast <icon> <title>|<msg>} (vanilla toast).
 */
public final class DevHooks {
	private DevHooks() {
	}

	/** Runs a dev command on the client thread. Never throws. */
	public static void run(String command) {
		try {
			exec(command.trim());
		} catch (RuntimeException e) {
			LaptopCraft.LOGGER.error("DevHooks command failed: {}", command, e);
		}
	}

	private static @Nullable CubeOS current() {
		return Minecraft.getInstance().screen instanceof LaptopScreen ls ? ls.os() : null;
	}

	private static CubeOS ensureLaptop() {
		CubeOS os = current();
		if (os != null) {
			return os;
		}
		Minecraft mc = Minecraft.getInstance();
		ClientLaptopSession session = ClientLaptopSession.openOffline();
		LaptopScreen screen = new LaptopScreen(session, mc.screen);
		mc.setScreen(screen);
		return screen.os();
	}

	private static void exec(String command) {
		String[] parts = command.split("\\s+", 2);
		String op = parts[0].toLowerCase(Locale.ROOT);
		String rest = parts.length > 1 ? parts[1].trim() : "";
		switch (op) {
			case "open" -> {
				String[] a = rest.split("\\s+", 2);
				ensureLaptop().openApp(a[0], a.length > 1 ? a[1] : null);
			}
			case "url" -> ensureLaptop().openUrl(rest);
			case "skipboot" -> ensureLaptop().skipBoot();
			case "boot" -> ensureLaptop();
			case "maximize" -> withFocused(w -> {
				if (!w.maximized) {
					w.os.windows().toggleMaximize(w);
				}
			});
			case "close-all" -> {
				CubeOS os = current();
				if (os != null) {
					for (OSWindow w : List.copyOf(os.windows().all())) {
						os.windows().closeNow(w);
					}
				}
			}
			case "notify" -> notify(ensureLaptop(), "info", rest);
			case "toast" -> {
				// vanilla toast as shown while the laptop is closed: toast <icon> <title>|<msg>
				String[] a = rest.split("\\s+", 2);
				String spec = a.length > 1 ? a[1] : "";
				int bar = spec.indexOf('|');
				Minecraft.getInstance().getToastManager().addToast(new com.laptopcraft.client.net.LaptopToast(a[0],
						bar < 0 ? spec : spec.substring(0, bar), bar < 0 ? "" : spec.substring(bar + 1)));
			}
			case "notifyicon" -> {
				String[] a = rest.split("\\s+", 2);
				notify(ensureLaptop(), a[0], a.length > 1 ? a[1] : "");
			}
			case "wallpaper" -> ensureLaptop().data().setString(OSSettings.WALLPAPER, rest);
			case "theme" -> ensureLaptop().data().setString(OSSettings.THEME, rest.equalsIgnoreCase("light") ? "light" : "dark");
			case "accent" -> ensureLaptop().data().setInt(OSSettings.ACCENT, (int) Long.parseLong(rest.replace("#", "").replace("0x", ""), 16));
			case "password" -> ensureLaptop().data().setString(OSSettings.PASSWORD, rest.equalsIgnoreCase("none") ? "" : rest);
			case "lock" -> ensureLaptop().lock();
			case "startmenu" -> ensureLaptop().toggleStartMenu();
			case "focus" -> {
				CubeOS os = ensureLaptop();
				var ws = os.windows().windowsOf(rest);
				if (!ws.isEmpty()) {
					os.windows().focus(ws.get(ws.size() - 1));
				}
			}
			case "size" -> withFocused(w -> {
				String[] a = rest.split("\\s+");
				w.maximized = false;
				w.w = Math.max(w.info.minWidth(), Integer.parseInt(a[0]));
				w.h = Math.max(w.info.minHeight(), Integer.parseInt(a[1]));
				w.checkResize();
			});
			case "move" -> withFocused(w -> {
				String[] a = rest.split("\\s+");
				w.maximized = false;
				w.x = Integer.parseInt(a[0]);
				w.y = Integer.parseInt(a[1]);
			});
			case "alert" -> withFocused(w -> w.ctx.alert("Heads up!", "This is an alert dialog. It has a single OK button and closes with Enter or Esc."));
			case "confirm" -> withFocused(w -> w.ctx.confirm("Delete \"Diary.txt\"?", "The file will be gone forever. Are you sure?", () -> { }));
			case "prompt" -> withFocused(w -> w.ctx.prompt("Rename file", "New name:", "Shopping list.txt", s -> { }));
			case "sysdialog" -> ensureLaptop().showSystemDialog(Dialog.confirm("Restart now?", "Updates are ready to install. CubeOS needs to restart.", () -> { }));
			case "notifcenter" -> ensureLaptop().togglePopup("bell");
			case "calendar" -> ensureLaptop().togglePopup("clock");
			case "about" -> ensureLaptop().showAbout();
			case "newfile" -> ensureLaptop().newTextFileDialog();
			case "sleep" -> ensureLaptop().sleep();
			case "restart" -> ensureLaptop().restart();
			case "shutdown" -> ensureLaptop().shutdown();
			case "crashtest" -> {
				CubeOS os = ensureLaptop();
				if (AppRegistry.get("crashtest") == null) {
					AppRegistry.register(new AppInfo("crashtest", "Crash Test", Icons.ERROR, CrashTestApp::new, 200, 120, 120, 80, false, AppCategory.SYSTEM));
				}
				os.openApp("crashtest", null);
			}
			default -> LaptopCraft.LOGGER.warn("Unknown DevHooks command: {}", command);
		}
	}

	private static void notify(CubeOS os, String icon, String spec) {
		int bar = spec.indexOf('|');
		String title = bar < 0 ? spec : spec.substring(0, bar);
		String msg = bar < 0 ? "" : spec.substring(bar + 1);
		os.notify(icon, title.trim(), msg.trim());
	}

	private static void withFocused(java.util.function.Consumer<OSWindow> action) {
		CubeOS os = current();
		if (os == null) {
			return;
		}
		OSWindow w = os.windows().focused();
		if (w != null) {
			action.accept(w);
		}
	}

	/** Throws while rendering after a moment — exercises the crash handling. */
	private static final class CrashTestApp extends App {
		private int ticks;

		@Override
		public void render(GuiGraphics g, int width, int height, int mouseX, int mouseY, float partialTick) {
			com.laptopcraft.client.os.ui.Gfx.textCentered(g, "Crashing in " + Math.max(0, 20 - ticks) + "…", width / 2, height / 2, ctx.theme().text());
			if (ticks > 20) {
				throw new IllegalStateException("Simulated crash for testing");
			}
		}

		@Override
		public void tick() {
			ticks++;
		}
	}
}
