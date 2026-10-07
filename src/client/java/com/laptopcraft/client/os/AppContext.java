package com.laptopcraft.client.os;

import java.util.List;
import java.util.function.Consumer;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.core.BlockPos;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.sounds.SoundEvent;
import org.jspecify.annotations.Nullable;

/**
 * Everything an {@link App} may ask from CubeOS. One context per window ({@code ctx} field of the app).
 */
public interface AppContext {
	Minecraft mc();

	Font font();

	/** Current theme (changes live with the settings — don't cache colors). */
	Theme theme();

	/** Laptop storage (settings, files, app state); automatically synced to the server. */
	OSData data();

	/** The player's EmeraldPay account (balance, orders, mail). */
	AccountView account();

	/** Current content width. */
	int width();

	/** Current content height. */
	int height();

	/** True if this window is the focused (front-most) window. */
	boolean isFocused();

	/** True if the click being processed is a double click (same button, &lt;350 ms, &lt;5 px apart). */
	boolean isDoubleClick();

	/** Overrides the window title (null-safe: empty resets to the app name). {@link App#title()} wins if non-null. */
	void setTitle(String title);

	/** Requests closing this window (the app may veto via {@link App#onCloseRequested()}). */
	void close();

	/** Opens (or focuses, for single-instance apps) another app, optionally with a launch argument. */
	void openApp(String appId, @Nullable String arg);

	/** Opens the browser (or focuses it) at {@code url}, e.g. {@code "emerazon.mc/orders"}. */
	void openUrl(String url);

	/** OS notification (toast + notification center). Icon keys as in {@code ModPayloads.Notify}. */
	void notify(String icon, String title, String message);

	/** Plays the UI click sound (respects the sound setting). */
	void playClick();

	/** Plays any sound event as a UI sound (respects the sound setting). */
	void playSound(SoundEvent sound, float pitch);

	/** Modal Yes/No dialog in this window. */
	void confirm(String title, String message, Runnable onYes);

	/** Modal text prompt in this window; {@code onOk} receives the entered text. */
	void prompt(String title, String label, String initial, Consumer<String> onOk);

	/** Modal message box with an OK button. */
	void alert(String title, String message);

	/** Client level game time (simulated in offline dev mode). */
	long gameTime();

	/** Position of the laptop block (offline dev laptop: 0, -1000, 0). */
	BlockPos laptopPos();

	/** This app's persistent compound (same as {@code data().appState(appId())}). Mutate, then {@link #saveAppState()}. */
	CompoundTag appState();

	/** Marks the app state dirty so it is synced to the server. */
	void saveAppState();

	/** Id of this app (e.g. "notepad"). */
	String appId();

	// ---------------------------------------------------------------- additions (beyond the original contract)

	/**
	 * Shows a context menu at local coordinates (x, y) of this window's content area. The menu is
	 * kept inside the laptop display. Closes on click outside or Esc.
	 */
	void showContextMenu(double x, double y, List<MenuItem> items);

	/** Opens a file in the matching app: "text" → notepad, "image" → paint, otherwise files. */
	void openFile(String fileName);

	/** Level day time (0 = 6:00, 24000 per day; simulated offline). Use for clocks. */
	long dayTime();

	/** In-game day number, starting at 1. */
	int day();

	/** "HH:MM" (or "h:MM AM") for the current day time, respecting the clock24h setting. */
	String clockText();

	/** True for the offline dev laptop (no world, nothing is sent to a server). */
	boolean isOffline();

	/** Display name of the laptop user (settings "username", default the owner's name). */
	String username();

	/** Milliseconds since the laptop booted. */
	long uptimeMillis();

	/** Maximizes or restores this window. */
	void setMaximized(boolean maximized);

	boolean isMaximized();

	/** Minimizes this window to the taskbar. */
	void minimize();

	/** True while one of this window's modal dialogs is open. */
	boolean isDialogOpen();
}
