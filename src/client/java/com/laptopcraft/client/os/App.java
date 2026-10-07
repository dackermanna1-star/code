package com.laptopcraft.client.os;

import net.minecraft.client.gui.GuiGraphics;
import org.jspecify.annotations.Nullable;

/**
 * Base class of every CubeOS application. One instance per window. See the package documentation
 * ({@link com.laptopcraft.client.os}) for a complete example.
 *
 * <h2>Lifecycle</h2>
 * <ol>
 *   <li>The factory from {@link AppInfo} creates the instance; {@link #ctx} is injected.</li>
 *   <li>{@link #init()} — build widgets, load state ({@code ctx.appState()}, {@code ctx.data()}).</li>
 *   <li>{@link #onResize(int, int)} with the initial content size, then
 *       {@link #onLaunchArgument(String)} if the app was opened with an argument.</li>
 *   <li>{@link #render} every frame, {@link #tick()} 20× per second (also while minimized).</li>
 *   <li>Closing: {@link #onCloseRequested()} (may veto), then {@link #onClose()} — persist here.
 *       {@code onClose} is also called when the laptop shuts down / restarts.</li>
 * </ol>
 *
 * <h2>Coordinates & input</h2>
 * Everything is in local content coordinates: (0,0) is the top-left of the window's content area
 * (below the title bar). The pose is translated and a scissor is active for the content rectangle.
 * Mouse events are delivered to the focused window (clicking a window focuses it and the click is
 * delivered too); the wheel goes to the window under the cursor. Key/char events go to the focused
 * window; what the app does not consume may trigger OS shortcuts (Esc closes overlays/the laptop,
 * Alt+F4 / Ctrl+W close the window). An exception thrown by an app is caught: the window is closed
 * and the user sees "&lt;app&gt; stopped working" instead of a game crash.
 */
public abstract class App {
	/** Services of the OS for this window. Injected before {@link #init()}. */
	protected AppContext ctx;

	/** Called once after {@link #ctx} is available. */
	public void init() {
	}

	/**
	 * Draws the content area. Local coords: (0,0) = top-left of the window's content area. The pose is
	 * already translated and a scissor is active for the content rect. {@code mouseX/mouseY} are local;
	 * when this window is not the top-most window under the cursor they are {@code Integer.MIN_VALUE / 2}
	 * so hover checks fail naturally.
	 */
	public abstract void render(GuiGraphics g, int width, int height, int mouseX, int mouseY, float partialTick);

	/** Local coords. Return true if consumed. Use {@code ctx.isDoubleClick()} to detect double clicks. */
	public boolean mouseClicked(double x, double y, int button) {
		return false;
	}

	/** Local coords. Delivered to the window that received the press. */
	public boolean mouseReleased(double x, double y, int button) {
		return false;
	}

	/** Drag with a button held; {@code dragX/dragY} are deltas since the last event. */
	public boolean mouseDragged(double x, double y, int button, double dragX, double dragY) {
		return false;
	}

	/** {@code amount} &gt; 0 = wheel up. */
	public boolean mouseScrolled(double x, double y, double amount) {
		return false;
	}

	/** GLFW key codes and modifier bits (see {@link com.laptopcraft.client.os.ui.UI#hasCtrl(int)}). */
	public boolean keyPressed(int keyCode, int scanCode, int modifiers) {
		return false;
	}

	/** A typed character (already filtered by GLFW; use {@code UI.isTypeable}). */
	public boolean charTyped(int codePoint, int modifiers) {
		return false;
	}

	/** 20 Hz, only while the laptop screen is open (also for minimized windows). */
	public void tick() {
	}

	/** The content area changed size (also called once right after {@link #init()}). */
	public void onResize(int width, int height) {
	}

	/** Return false to veto closing (e.g. show an "unsaved changes" dialog, then call {@code ctx.close()} again). */
	public boolean onCloseRequested() {
		return true;
	}

	/** The window is closing (or the OS shuts down). Persist state here. */
	public void onClose() {
	}

	/** File name / URL / etc.; also called when a single-instance app is launched again with an argument. */
	public void onLaunchArgument(String arg) {
	}

	/** Dynamic window title (null → app name). Polled every frame. */
	public @Nullable String title() {
		return null;
	}
}
