package com.laptopcraft.client.os;

import com.laptopcraft.LaptopCraft;
import com.laptopcraft.client.os.ui.Ease;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;
import java.util.function.Consumer;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.core.BlockPos;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.sounds.SoundEvent;
import org.jspecify.annotations.Nullable;

/**
 * One application window: geometry, state (maximized/minimized), animations, modal dialogs and the
 * {@link AppContext} given to the app. All app callbacks go through {@link #safe} so a buggy app
 * cannot crash the game.
 */
public final class OSWindow {
	/** Title bar height. */
	public static final int TITLE_H = 20;

	enum Anim {
		NONE,
		OPEN,
		CLOSE,
		MINIMIZE,
		RESTORE
	}

	private static int nextId = 1;

	final int id = nextId++;
	final AppInfo info;
	final CubeOS os;
	final App app;
	final Ctx ctx = new Ctx();
	int x;
	int y;
	int w;
	int h;
	int restoreX;
	int restoreY;
	int restoreW;
	int restoreH;
	boolean maximized;
	boolean minimized;
	Anim anim = Anim.NONE;
	long animStart;
	/** Set when the close animation finished; the WM removes the window. */
	boolean dead;
	boolean crashed;
	private String customTitle = "";
	final Deque<Dialog> dialogs = new ArrayDeque<>();
	private int lastContentW = -1;
	private int lastContentH = -1;
	final long openedAt = Ease.now();

	OSWindow(CubeOS os, AppInfo info, App app) {
		this.os = os;
		this.info = info;
		this.app = app;
	}

	// ------------------------------------------------------------------ geometry

	int contentX() {
		return maximized ? x : x + 1;
	}

	int contentY() {
		return y + TITLE_H;
	}

	int contentW() {
		return Math.max(1, maximized ? w : w - 2);
	}

	int contentH() {
		return Math.max(1, h - TITLE_H - (maximized ? 0 : 1));
	}

	boolean contains(double mx, double my) {
		return mx >= x && my >= y && mx < x + w && my < y + h;
	}

	boolean inContent(double mx, double my) {
		return mx >= contentX() && my >= contentY() && mx < contentX() + contentW() && my < contentY() + contentH();
	}

	/** Visible (rendered, hit-testable) — not minimized and not closing. */
	boolean isInteractive() {
		return !minimized && anim != Anim.CLOSE && anim != Anim.MINIMIZE && !dead;
	}

	String title() {
		String t = null;
		try {
			t = app.title();
		} catch (RuntimeException e) {
			// ignore — title is cosmetic
		}
		if (t != null && !t.isEmpty()) {
			return t;
		}
		return customTitle.isEmpty() ? info.name() : customTitle;
	}

	void checkResize() {
		int cw = contentW(), ch = contentH();
		if (cw != lastContentW || ch != lastContentH) {
			lastContentW = cw;
			lastContentH = ch;
			safe(() -> app.onResize(cw, ch));
		}
	}

	@Nullable Dialog dialog() {
		while (!dialogs.isEmpty() && dialogs.peek().isDone()) {
			dialogs.poll();
		}
		return dialogs.peek();
	}

	// ------------------------------------------------------------------ safety

	/** Runs app code; on failure the window is closed and the user is told. */
	void safe(Runnable r) {
		if (crashed) {
			return;
		}
		try {
			r.run();
		} catch (RuntimeException | LinkageError | StackOverflowError | AssertionError e) {
			crash(e);
		}
	}

	boolean safeBool(java.util.function.BooleanSupplier r) {
		if (crashed) {
			return false;
		}
		try {
			return r.getAsBoolean();
		} catch (RuntimeException | LinkageError | StackOverflowError | AssertionError e) {
			crash(e);
			return true;
		}
	}

	void crash(Throwable e) {
		if (crashed) {
			return;
		}
		crashed = true;
		LaptopCraft.LOGGER.error("CubeOS app '{}' crashed", info.id(), e);
		os.onAppCrashed(this, e);
	}

	// ------------------------------------------------------------------ context

	/** The {@link AppContext} of this window. */
	final class Ctx implements AppContext {
		private boolean doubleClick;

		void setDoubleClick(boolean dbl) {
			this.doubleClick = dbl;
		}

		@Override
		public Minecraft mc() {
			return Minecraft.getInstance();
		}

		@Override
		public Font font() {
			return Minecraft.getInstance().font;
		}

		@Override
		public Theme theme() {
			return os.theme();
		}

		@Override
		public OSData data() {
			return os.data();
		}

		@Override
		public AccountView account() {
			return os.account();
		}

		@Override
		public int width() {
			return contentW();
		}

		@Override
		public int height() {
			return contentH();
		}

		@Override
		public boolean isFocused() {
			return os.windows().focused() == OSWindow.this && os.screenFocused();
		}

		@Override
		public boolean isDoubleClick() {
			return doubleClick;
		}

		@Override
		public void setTitle(String title) {
			customTitle = title == null ? "" : title;
		}

		@Override
		public void close() {
			os.windows().requestClose(OSWindow.this);
		}

		@Override
		public void openApp(String appId, @Nullable String arg) {
			os.openApp(appId, arg);
		}

		@Override
		public void openUrl(String url) {
			os.openUrl(url);
		}

		@Override
		public void notify(String icon, String title, String message) {
			os.notify(icon, title, message);
		}

		@Override
		public void playClick() {
			OSSounds.click();
		}

		@Override
		public void playSound(SoundEvent sound, float pitch) {
			OSSounds.play(sound, pitch);
		}

		@Override
		public void confirm(String title, String message, Runnable onYes) {
			dialogs.add(Dialog.confirm(title, message, onYes));
		}

		@Override
		public void prompt(String title, String label, String initial, Consumer<String> onOk) {
			dialogs.add(Dialog.prompt(title, label, initial, onOk));
		}

		@Override
		public void alert(String title, String message) {
			dialogs.add(Dialog.alert(title, message));
		}

		@Override
		public long gameTime() {
			return os.gameTime();
		}

		@Override
		public BlockPos laptopPos() {
			return os.session().pos();
		}

		@Override
		public CompoundTag appState() {
			return os.data().appState(info.id());
		}

		@Override
		public void saveAppState() {
			os.data().saveAppState(info.id());
		}

		@Override
		public String appId() {
			return info.id();
		}

		@Override
		public void showContextMenu(double mx, double my, List<MenuItem> items) {
			os.showContextMenu(new ContextMenu(items, contentX() + mx, contentY() + my, os.width(), os.desktopHeight()));
		}

		@Override
		public void openFile(String fileName) {
			os.openFile(fileName);
		}

		@Override
		public long dayTime() {
			return os.dayTime();
		}

		@Override
		public int day() {
			return OSClock.day(os.dayTime());
		}

		@Override
		public String clockText() {
			return os.clockText();
		}

		@Override
		public boolean isOffline() {
			return os.session().offline();
		}

		@Override
		public String username() {
			return os.username();
		}

		@Override
		public long uptimeMillis() {
			return os.uptimeMillis();
		}

		@Override
		public void setMaximized(boolean max) {
			if (max != maximized) {
				os.windows().toggleMaximize(OSWindow.this);
			}
		}

		@Override
		public boolean isMaximized() {
			return maximized;
		}

		@Override
		public void minimize() {
			os.windows().minimize(OSWindow.this);
		}

		@Override
		public boolean isDialogOpen() {
			return dialog() != null;
		}
	}
}
