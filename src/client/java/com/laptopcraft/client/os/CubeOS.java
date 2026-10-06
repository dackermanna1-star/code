package com.laptopcraft.client.os;

import com.laptopcraft.client.os.ui.Ease;
import com.laptopcraft.client.os.ui.Gfx;
import com.laptopcraft.client.os.ui.UI;
import com.laptopcraft.network.ModPayloads;
import java.util.ArrayDeque;
import java.util.Deque;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.world.attribute.EnvironmentAttributes;
import org.jspecify.annotations.Nullable;
import org.lwjgl.glfw.GLFW;

/**
 * The running operating system of one laptop session: boot/lock/desktop phases, windows, taskbar,
 * start menu, notifications, menus, popups and system dialogs. It outlives the {@link LaptopScreen}
 * (closing the screen = sleep), so windows survive closing and reopening the laptop.
 * All coordinates are display coordinates ((0,0) = top-left of the laptop display).
 */
public final class CubeOS {
	/** Version shown in "About". */
	public static final String VERSION = "1.0 \"Bedrock\"";

	enum Phase {
		BOOT,
		LOCK,
		UNLOCKING,
		DESKTOP,
		SHUTDOWN,
		RESTART
	}

	private enum Press {
		NONE,
		MENU,
		POPUP,
		DIALOG,
		START,
		TASKBAR,
		WINDOWS,
		DESKTOP,
		LOCK
	}

	private static final long UNLOCK_MS = 420;

	private final ClientLaptopSession session;
	private final WindowManager windows = new WindowManager(this);
	private final Desktop desktop = new Desktop(this);
	private final Taskbar taskbar = new Taskbar(this);
	private final StartMenu startMenu = new StartMenu(this);
	private final Notifications notifications = new Notifications();
	private final LockScreen lockScreen = new LockScreen(this);
	private final Deque<Dialog> systemDialogs = new ArrayDeque<>();
	private @Nullable ContextMenu contextMenu;
	private @Nullable Popup popup;
	private @Nullable LaptopScreen screen;
	private Phase phase = Phase.BOOT;
	private long phaseStart = Ease.now();
	private long bootedAt = Ease.now();
	private boolean lockFromBoot;
	private Theme theme = Themes.dark(Themes.DEFAULT_ACCENT);
	private int settingsSeen = -1;
	private int width = 400;
	private int height = 240;
	private Press press = Press.NONE;
	private long lastClickTime;
	private double lastClickX;
	private double lastClickY;
	private int lastClickButton = -1;
	private boolean bootSoundPlayed;

	CubeOS(ClientLaptopSession session) {
		this.session = session;
		notifications.setOnActivate(e -> {
			if ("mail".equals(e.icon())) {
				openApp("mail", null);
			}
		});
		session.account().setNotifier(this::notify);
		session.data().setOnTooLarge(() -> notify("error", "Couldn't save", "A file or app's data is too large to store on the laptop."));
		refreshSettings();
	}

	// ------------------------------------------------------------------ accessors

	/** The laptop session. */
	public ClientLaptopSession session() {
		return session;
	}

	/** Laptop storage. */
	public OSData data() {
		return session.data();
	}

	OSDataImpl dataImpl() {
		return session.data();
	}

	/** The player's account. */
	public AccountView account() {
		return session.account();
	}

	/** Current theme (from settings). */
	public Theme theme() {
		return theme;
	}

	/** The window manager. */
	public WindowManager windows() {
		return windows;
	}

	Taskbar taskbar() {
		return taskbar;
	}

	StartMenu startMenu() {
		return startMenu;
	}

	/** Toasts and notification history. */
	public Notifications notifications() {
		return notifications;
	}

	/** Display width. */
	public int width() {
		return width;
	}

	/** Display height (including the taskbar). */
	public int height() {
		return height;
	}

	/** Height of the desktop area (display minus taskbar). */
	public int desktopHeight() {
		return Math.max(40, height - Taskbar.HEIGHT);
	}

	Phase phase() {
		return phase;
	}

	/** True while the laptop screen is the active Minecraft screen. */
	boolean screenFocused() {
		return screen != null && Minecraft.getInstance().screen == screen;
	}

	/** User name shown by the OS. */
	public String username() {
		return OSSettings.username(data(), session.ownerName());
	}

	/** Milliseconds since the last boot. */
	public long uptimeMillis() {
		return Ease.now() - bootedAt;
	}

	// ------------------------------------------------------------------ time & world

	private @Nullable ClientLevel level() {
		return session.offline() ? null : Minecraft.getInstance().level;
	}

	private long offlineTicks() {
		return session.offlineTicks();
	}

	/** Level game time (simulated offline). */
	public long gameTime() {
		ClientLevel l = level();
		return l != null ? l.getGameTime() : ClientLaptopSession.OFFLINE_GAME_TIME + offlineTicks();
	}

	/** Level day time (simulated offline). */
	public long dayTime() {
		ClientLevel l = level();
		return l != null ? l.getDayTime() : ClientLaptopSession.OFFLINE_DAY_TIME + offlineTicks();
	}

	/** Formatted clock respecting the 24 h setting. */
	public String clockText() {
		return OSClock.format(dayTime(), OSSettings.clock24h(data()));
	}

	/** Vanilla moon phase index 0–7 (0 = full moon). */
	public int moonPhase() {
		ClientLevel l = level();
		if (l != null) {
			try {
				return l.environmentAttributes().getDimensionValue(EnvironmentAttributes.MOON_PHASE).index();
			} catch (RuntimeException e) {
				// fall through to the simple formula
			}
		}
		return OSClock.moonPhase(dayTime());
	}

	private boolean isNight() {
		int h = OSClock.hours(dayTime());
		return h < 6 || h >= 19;
	}

	/** "Sunny", "Clear night", "Rain" or "Thunderstorm". */
	public String weatherText() {
		ClientLevel l = level();
		if (l != null && l.isThundering()) {
			return "Thunderstorm";
		}
		if (l != null && l.isRaining()) {
			return "Rain";
		}
		return isNight() ? "Clear night" : "Sunny";
	}

	/** Font glyph matching {@link #weatherText()}. */
	public String weatherGlyph() {
		ClientLevel l = level();
		if (l != null && l.isThundering()) {
			return "⚡";
		}
		if (l != null && l.isRaining()) {
			return "☂";
		}
		return isNight() ? "★" : "☀";
	}

	// ------------------------------------------------------------------ settings / theme

	private void refreshSettings() {
		OSDataImpl d = session.data();
		if (d.settingsVersion() == settingsSeen) {
			return;
		}
		settingsSeen = d.settingsVersion();
		theme = Themes.of(OSSettings.dark(d), OSSettings.accent(d));
		UI.setTheme(theme);
		OSSounds.setEnabled(OSSettings.sounds(d));
	}

	// ------------------------------------------------------------------ lifecycle

	/** Updates the display size (called on screen init/resize, and every frame by render). */
	void resize(int w, int h) {
		this.width = w;
		this.height = h;
		windows.layout(w, desktopHeight());
	}

	void attach(LaptopScreen s) {
		this.screen = s;
		refreshSettings();
		UI.setTheme(theme);
		OSSounds.setEnabled(OSSettings.sounds(data()));
		session.account().setLaptopPos(session.pos());
		session.account().setNotifier(this::notify);
		if (phase == Phase.BOOT && !bootSoundPlayed) {
			bootSoundPlayed = true;
			OSSounds.boot();
		}
	}

	void detach(LaptopScreen s) {
		if (screen == s) {
			screen = null;
		}
		windows.endInteractions();
		startMenu.close();
		contextMenu = null;
		popup = null;
		press = Press.NONE;
		session.data().flush();
		if (phase == Phase.SHUTDOWN) {
			finishShutdown();
		} else if (phase == Phase.RESTART || phase == Phase.UNLOCKING || phase == Phase.DESKTOP) {
			// sleeping: next time the lock screen greets the user
			phase = Phase.LOCK;
			phaseStart = Ease.now();
			lockFromBoot = false;
			lockScreen.reset();
		} else if (phase == Phase.BOOT) {
			phase = Phase.LOCK;
			lockFromBoot = false;
			lockScreen.reset();
		}
	}

	/** Starts a fresh boot (power on / restart). */
	void boot() {
		phase = Phase.BOOT;
		phaseStart = Ease.now();
		bootedAt = Ease.now();
		bootSoundPlayed = screen != null;
		if (screen != null) {
			OSSounds.boot();
		}
	}

	/** Skips boot and lock screen (dev hook). */
	public void skipBoot() {
		phase = Phase.DESKTOP;
		phaseStart = Ease.now() - 1000;
	}

	/** Shows the lock screen. */
	public void lock() {
		closeOverlays();
		phase = Phase.LOCK;
		phaseStart = Ease.now();
		lockFromBoot = false;
		lockScreen.reset();
	}

	void unlock() {
		phase = Phase.UNLOCKING;
		phaseStart = Ease.now();
	}

	/** Closes the laptop screen but keeps the session (windows stay open). */
	public void sleep() {
		closeOverlays();
		if (screen != null) {
			screen.closeLaptop();
		}
	}

	/** Restarts: shutdown animation, closes all windows, boots again. */
	public void restart() {
		closeOverlays();
		phase = Phase.RESTART;
		phaseStart = Ease.now();
		OSSounds.shutdown();
	}

	/** Shuts down: closes everything, closes the lid and the screen; the next open boots fresh. */
	public void shutdown() {
		closeOverlays();
		phase = Phase.SHUTDOWN;
		phaseStart = Ease.now();
		OSSounds.shutdown();
	}

	private void finishShutdown() {
		windows.closeAllImmediately();
		session.data().flush();
		if (!session.offline()) {
			try {
				if (ClientPlayNetworking.canSend(ModPayloads.LaptopLid.TYPE)) {
					ClientPlayNetworking.send(new ModPayloads.LaptopLid(session.pos(), false));
				}
			} catch (IllegalStateException ignored) {
				// not connected
			}
		}
		ClientLaptopSession.forget(session);
	}

	private void closeOverlays() {
		startMenu.close();
		contextMenu = null;
		popup = null;
	}

	// ------------------------------------------------------------------ OS services

	/** Opens an app (or focuses a single-instance one). Returns the window, or null if unknown. */
	public @Nullable OSWindow openApp(String appId, @Nullable String arg) {
		AppInfo info = AppRegistry.get(appId);
		if (info == null) {
			notify("error", "App not installed", "No app with id \"" + appId + "\".");
			return null;
		}
		if (info.singleInstance()) {
			var existing = windows.windowsOf(appId);
			if (!existing.isEmpty()) {
				OSWindow w = existing.get(existing.size() - 1);
				windows.focus(w);
				if (arg != null) {
					w.safe(() -> w.app.onLaunchArgument(arg));
				}
				return w;
			}
		}
		App app;
		try {
			app = info.factory().get();
		} catch (RuntimeException | LinkageError e) {
			com.laptopcraft.LaptopCraft.LOGGER.error("CubeOS: could not create app {}", appId, e);
			notify("error", info.name() + " failed to start", e.getClass().getSimpleName());
			return null;
		}
		OSWindow w = windows.open(info, app);
		app.ctx = w.ctx;
		w.safe(app::init);
		w.checkResize();
		if (arg != null) {
			w.safe(() -> app.onLaunchArgument(arg));
		}
		taskbar.bounce(appId);
		return w;
	}

	/** Opens the browser (or a new tab in it) at {@code url}. */
	public void openUrl(String url) {
		openApp("browser", url);
	}

	/** Opens a file with the matching app. */
	public void openFile(String name) {
		var type = data().fileType(name);
		if (type.isEmpty()) {
			notify("error", "File not found", "\"" + name + "\" does not exist.");
			return;
		}
		switch (type.get()) {
			case "text" -> openApp("notepad", name);
			case "image" -> openApp("paint", name);
			default -> openApp("files", name);
		}
	}

	/** Shows an OS notification (toast + history + sound). */
	public void notify(String icon, String title, String message) {
		notifications.push(icon, title, message);
		OSSounds.notification();
	}

	/** Shows a context menu (replaces any open one). */
	public void showContextMenu(ContextMenu menu) {
		this.contextMenu = menu;
		this.popup = null;
	}

	void togglePopup(String anchor) {
		if (popup != null && popup.anchor().equals(anchor)) {
			popup = null;
			return;
		}
		startMenu.close();
		popup = switch (anchor) {
			case "bell" -> new NotificationCenter(this);
			case "clock" -> new CalendarPopup(this);
			default -> null;
		};
	}

	/** Closes the calendar / notification center flyout. */
	void closePopup() {
		popup = null;
	}

	boolean popupAnchor(String anchor) {
		return popup != null && popup.anchor().equals(anchor);
	}

	void toggleStartMenu() {
		popup = null;
		contextMenu = null;
		startMenu.toggle();
	}

	/** Opens the start menu. */
	public void openStartMenu() {
		popup = null;
		contextMenu = null;
		startMenu.open();
	}

	/** Shows a desktop-level modal dialog. */
	public void showSystemDialog(Dialog dialog) {
		systemDialogs.add(dialog);
	}

	private @Nullable Dialog systemDialog() {
		while (!systemDialogs.isEmpty() && systemDialogs.peek().isDone()) {
			systemDialogs.poll();
		}
		return systemDialogs.peek();
	}

	/** Opens the "New text file" prompt (desktop menu). */
	public void newTextFileDialog() {
		desktop.newTextFile();
	}

	void showAbout() {
		long up = uptimeMillis() / 1000;
		String uptime = up >= 3600 ? (up / 3600) + "h " + (up % 3600 / 60) + "m" : (up / 60) + "m " + (up % 60) + "s";
		showSystemDialog(Dialog.about("About CubeOS",
				"CubeOS " + VERSION + "\n"
						+ "Running on a CubeBook (Redstone R1 @ 20 TPS)\n"
						+ "Memory: 640 KB — ought to be enough for anybody\n"
						+ "Apps installed: " + AppRegistry.all().size() + "\n"
						+ "Uptime: " + uptime + "\n\n"
						+ "Made with love, blocks and a little bit of redstone."));
	}

	void onAppCrashed(OSWindow w, Throwable e) {
		windows.closeNow(w);
		String msg = e.getMessage() == null ? "" : ": " + e.getMessage();
		if (msg.length() > 120) {
			msg = msg.substring(0, 120) + "…";
		}
		notify("error", w.info.name() + " stopped working", e.getClass().getSimpleName() + msg);
		showSystemDialog(Dialog.alert(w.info.name() + " has stopped working",
				"The app ran into a problem and was closed. Your other windows are fine.\n\n" + e.getClass().getSimpleName() + msg,
				Icons.ERROR, null));
	}

	int[] taskbarSlotCenter(String appId) {
		return taskbar.slotCenter(appId);
	}

	// ------------------------------------------------------------------ tick

	void tick() {
		session.data().tick();
		session.account().tick();
		windows.tick();
		long t = Ease.now() - phaseStart;
		switch (phase) {
			case BOOT -> {
				if (t >= BootScreen.BOOT_MS) {
					phase = Phase.LOCK;
					phaseStart = Ease.now();
					lockFromBoot = true;
					lockScreen.reset();
				}
			}
			case UNLOCKING -> {
				if (t >= UNLOCK_MS) {
					phase = Phase.DESKTOP;
					phaseStart = Ease.now();
				}
			}
			case RESTART -> {
				if (t >= BootScreen.RESTART_MS) {
					windows.closeAllImmediately();
					session.data().flush();
					systemDialogs.clear();
					boot();
				}
			}
			case SHUTDOWN -> {
				if (t >= BootScreen.SHUTDOWN_MS && screen != null) {
					screen.closeLaptop();
				}
			}
			default -> {
			}
		}
	}

	// ------------------------------------------------------------------ render

	void render(GuiGraphics g, int w, int h, int mouseX, int mouseY, float partialTick) {
		this.width = w;
		this.height = h;
		refreshSettings();
		windows.layout(w, desktopHeight());
		long t = Ease.now() - phaseStart;
		switch (phase) {
			case BOOT -> BootScreen.renderBoot(g, w, h, t);
			case LOCK -> {
				lockScreen.render(g, w, h, mouseX, mouseY, 0);
				if (lockFromBoot) {
					float f = 1f - Ease.clamp01(t / 450f);
					if (f > 0f) {
						g.nextStratum();
						Gfx.rect(g, 0, 0, w, h, Gfx.withAlpha(0xFF000000, Math.round(255 * f)));
					}
				}
			}
			case UNLOCKING -> {
				renderDesktop(g, w, h, Integer.MIN_VALUE / 2, Integer.MIN_VALUE / 2, partialTick);
				g.nextStratum();
				float p = Ease.inOutCubic(Ease.clamp01(t / (float) UNLOCK_MS));
				lockScreen.render(g, w, h, Integer.MIN_VALUE / 2, Integer.MIN_VALUE / 2, -Math.round(h * p));
			}
			case DESKTOP -> renderDesktop(g, w, h, mouseX, mouseY, partialTick);
			case SHUTDOWN, RESTART -> {
				renderDesktop(g, w, h, Integer.MIN_VALUE / 2, Integer.MIN_VALUE / 2, partialTick);
				g.nextStratum();
				BootScreen.renderPowerOff(g, w, h, t, phase == Phase.SHUTDOWN ? BootScreen.SHUTDOWN_MS : BootScreen.RESTART_MS,
						phase == Phase.SHUTDOWN ? "Shutting down…" : "Restarting…");
			}
		}
	}

	private void renderDesktop(GuiGraphics g, int w, int h, int mouseX, int mouseY, float pt) {
		int deskH = desktopHeight();
		boolean overlay = contextMenu != null || systemDialog() != null;
		int mx = overlay ? Integer.MIN_VALUE / 2 : mouseX;
		int my = overlay ? Integer.MIN_VALUE / 2 : mouseY;
		boolean startHit = startMenu.contains(mouseX, mouseY);
		boolean popupHit = popup != null && popup.contains(mouseX, mouseY);
		int deskMx = startHit || popupHit || windows.windowAt(mx, my) != null || my >= deskH ? Integer.MIN_VALUE / 2 : mx;
		boolean showIcons = OSSettings.showDesktopIcons(data());
		desktop.render(g, w, deskH, deskMx, my, showIcons);
		Gfx.scissor(g, 0, 0, w, deskH);
		windows.render(g, startHit || popupHit ? Integer.MIN_VALUE / 2 : mx, startHit || popupHit ? Integer.MIN_VALUE / 2 : my, pt);
		Gfx.endScissor(g);
		g.nextStratum();
		taskbar.render(g, w, deskH, startHit ? Integer.MIN_VALUE / 2 : mx, my);
		g.nextStratum();
		startMenu.render(g, overlay ? Integer.MIN_VALUE / 2 : mouseX, overlay ? Integer.MIN_VALUE / 2 : mouseY);
		if (popup != null) {
			g.nextStratum();
			popup.render(g, overlay ? Integer.MIN_VALUE / 2 : mouseX, overlay ? Integer.MIN_VALUE / 2 : mouseY);
		}
		g.nextStratum();
		notifications.render(g, w, 6, overlay ? Integer.MIN_VALUE / 2 : mouseX, overlay ? Integer.MIN_VALUE / 2 : mouseY);
		Dialog sys = systemDialog();
		if (sys != null) {
			g.nextStratum();
			sys.render(g, 0, 0, w, h, contextMenu == null ? mouseX : Integer.MIN_VALUE / 2, contextMenu == null ? mouseY : Integer.MIN_VALUE / 2);
		}
		if (contextMenu != null) {
			g.nextStratum();
			contextMenu.render(g, mouseX, mouseY);
		}
	}

	// ------------------------------------------------------------------ input

	private boolean computeDoubleClick(double mx, double my, int button, boolean vanilla) {
		long now = Ease.now();
		boolean dbl = vanilla || (button == lastClickButton && now - lastClickTime < 350
				&& Math.abs(mx - lastClickX) < 5 && Math.abs(my - lastClickY) < 5);
		lastClickTime = dbl ? 0 : now;
		lastClickX = mx;
		lastClickY = my;
		lastClickButton = button;
		return dbl;
	}

	boolean mouseClicked(double mx, double my, int button, boolean vanillaDouble) {
		boolean dbl = computeDoubleClick(mx, my, button, vanillaDouble);
		press = Press.NONE;
		switch (phase) {
			case LOCK -> {
				press = Press.LOCK;
				return lockScreen.mouseClicked(mx, my, button);
			}
			case DESKTOP -> {
			}
			default -> {
				return true;
			}
		}
		if (contextMenu != null) {
			ContextMenu menu = contextMenu;
			if (menu.contains(mx, my)) {
				MenuItem item = menu.itemAt(mx, my);
				if (item != null && button == 0) {
					contextMenu = null;
					OSSounds.click();
					if (item.action() != null) {
						item.action().run();
					}
				}
				press = Press.MENU;
				return true;
			}
			contextMenu = null;
			press = Press.MENU;
			return true;
		}
		Dialog sys = systemDialog();
		if (sys != null) {
			press = Press.DIALOG;
			return sys.mouseClicked(mx, my, button);
		}
		if (popup != null) {
			if (popup.contains(mx, my)) {
				press = Press.POPUP;
				return popup.mouseClicked(mx, my, button);
			}
			boolean onAnchor = taskbar.contains(mx, my);
			if (!onAnchor) {
				popup = null;
				press = Press.POPUP;
				return true;
			}
			// clicking the taskbar: let it handle (toggle or another flyout)
		}
		if (startMenu.isOpen()) {
			if (startMenu.contains(mx, my)) {
				press = Press.START;
				return startMenu.mouseClicked(mx, my, button);
			}
			int sx = taskbar.startButtonX();
			boolean onStart = taskbar.contains(mx, my) && mx >= sx && mx < sx + 24;
			if (!onStart) {
				startMenu.close();
			}
		}
		if (notifications.mouseClicked(mx, my, width)) {
			return true;
		}
		if (taskbar.contains(mx, my)) {
			press = Press.TASKBAR;
			return taskbar.mouseClicked(mx, my, button);
		}
		if (windows.mouseClicked(mx, my, button, dbl)) {
			press = Press.WINDOWS;
			return true;
		}
		windows.unfocusAll();
		press = Press.DESKTOP;
		return desktop.mouseClicked(mx, my, button, dbl, OSSettings.showDesktopIcons(data()));
	}

	boolean mouseReleased(double mx, double my, int button) {
		Press p = press;
		press = Press.NONE;
		return switch (p) {
			case LOCK -> lockScreen.mouseReleased(mx, my, button);
			case DIALOG -> {
				Dialog sys = systemDialog();
				yield sys != null && sys.mouseReleased(mx, my, button);
			}
			case POPUP -> popup != null && popup.mouseReleased(mx, my, button);
			case START -> startMenu.mouseReleased(mx, my, button);
			case TASKBAR -> taskbar.mouseReleased(mx, my, button);
			case WINDOWS -> windows.mouseReleased(mx, my, button);
			default -> true;
		};
	}

	boolean mouseDragged(double mx, double my, int button, double dx, double dy) {
		return switch (press) {
			case LOCK -> lockScreen.mouseDragged(mx, my, button, dx, dy);
			case DIALOG -> {
				Dialog sys = systemDialog();
				yield sys != null && sys.mouseDragged(mx, my, button, dx, dy);
			}
			case POPUP -> popup != null && popup.mouseDragged(mx, my, button, dx, dy);
			case START -> startMenu.mouseDragged(mx, my, button, dx, dy);
			case WINDOWS -> windows.mouseDragged(mx, my, button, dx, dy);
			default -> true;
		};
	}

	boolean mouseScrolled(double mx, double my, double amount) {
		if (phase != Phase.DESKTOP || contextMenu != null || systemDialog() != null) {
			return true;
		}
		if (popup != null && popup.mouseScrolled(mx, my, amount)) {
			return true;
		}
		if (startMenu.isOpen() && startMenu.mouseScrolled(mx, my, amount)) {
			return true;
		}
		return windows.mouseScrolled(mx, my, amount);
	}

	/** Returns false only for an unhandled Escape (the screen then closes = sleep). */
	boolean keyPressed(int key, int scan, int mods) {
		boolean esc = key == GLFW.GLFW_KEY_ESCAPE;
		switch (phase) {
			case LOCK -> {
				return lockScreen.keyPressed(key, scan, mods);
			}
			case DESKTOP -> {
			}
			default -> {
				return !esc;
			}
		}
		if (contextMenu != null) {
			if (esc) {
				contextMenu = null;
				return true;
			}
			MenuItem item = contextMenu.keyPressed(key);
			if (item != null) {
				contextMenu = null;
				if (item.action() != null) {
					item.action().run();
				}
			}
			return true;
		}
		Dialog sys = systemDialog();
		if (sys != null) {
			return sys.keyPressed(key, scan, mods);
		}
		if (popup != null && esc) {
			popup = null;
			return true;
		}
		if (startMenu.isOpen()) {
			return startMenu.keyPressed(key, scan, mods);
		}
		if (windows.keyPressed(key, scan, mods)) {
			return true;
		}
		if (esc) {
			return false;
		}
		if (windows.handleShortcut(key, mods)) {
			return true;
		}
		if (key == GLFW.GLFW_KEY_LEFT_SUPER || key == GLFW.GLFW_KEY_RIGHT_SUPER) {
			toggleStartMenu();
			return true;
		}
		if (windows.focused() == null) {
			desktop.keyPressed(key, mods, OSSettings.showDesktopIcons(data()));
		}
		return true;
	}

	boolean charTyped(int cp, int mods) {
		switch (phase) {
			case LOCK -> {
				return lockScreen.charTyped(cp, mods);
			}
			case DESKTOP -> {
			}
			default -> {
				return true;
			}
		}
		if (contextMenu != null) {
			return true;
		}
		Dialog sys = systemDialog();
		if (sys != null) {
			return sys.charTyped(cp, mods);
		}
		if (startMenu.isOpen()) {
			return startMenu.charTyped(cp, mods);
		}
		windows.charTyped(cp, mods);
		return true;
	}
}
