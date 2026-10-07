package com.laptopcraft.client.os.ui;

import com.laptopcraft.client.os.OSSounds;
import com.laptopcraft.client.os.Theme;
import com.laptopcraft.client.os.Themes;
import com.mojang.blaze3d.platform.InputConstants;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.input.InputQuirks;
import org.lwjgl.glfw.GLFW;

/**
 * Static access to the ambient UI environment of the running CubeOS: current {@link Theme}, font,
 * modifier keys, clipboard and click sounds. Widgets use this so they don't need an {@code AppContext}.
 * Inside apps prefer {@code ctx.theme()} — it returns the same object.
 */
public final class UI {
	private static Theme theme = Themes.dark(Themes.DEFAULT_ACCENT);

	private UI() {
	}

	/** The theme of the currently running CubeOS (dark theme with the default accent when none runs). */
	public static Theme theme() {
		return theme;
	}

	/** Set by the OS whenever the user changes theme/accent. */
	public static void setTheme(Theme newTheme) {
		theme = newTheme;
	}

	/** The Minecraft client. */
	public static Minecraft mc() {
		return Minecraft.getInstance();
	}

	/** The Minecraft font. */
	public static Font font() {
		return Minecraft.getInstance().font;
	}

	/** Font line height (9 px). */
	public static int lineHeight() {
		return Minecraft.getInstance().font.lineHeight;
	}

	private static boolean down(int key) {
		return InputConstants.isKeyDown(Minecraft.getInstance().getWindow(), key);
	}

	/** Live state of the shift keys (use event modifiers where available). */
	public static boolean shiftDown() {
		return down(GLFW.GLFW_KEY_LEFT_SHIFT) || down(GLFW.GLFW_KEY_RIGHT_SHIFT);
	}

	/** Live state of the control keys (also accepts the command key on macOS). */
	public static boolean ctrlDown() {
		return down(GLFW.GLFW_KEY_LEFT_CONTROL) || down(GLFW.GLFW_KEY_RIGHT_CONTROL)
				|| (InputQuirks.REPLACE_CTRL_KEY_WITH_CMD_KEY && (down(GLFW.GLFW_KEY_LEFT_SUPER) || down(GLFW.GLFW_KEY_RIGHT_SUPER)));
	}

	/** Live state of the alt keys. */
	public static boolean altDown() {
		return down(GLFW.GLFW_KEY_LEFT_ALT) || down(GLFW.GLFW_KEY_RIGHT_ALT);
	}

	/**
	 * GLFW modifier bits from the live keyboard state (shift=1, ctrl=2, alt=4, super=8). Merged into
	 * key events by the laptop screen so shortcuts also work with synthetic input.
	 */
	public static int liveModifiers() {
		int m = 0;
		if (shiftDown()) {
			m |= GLFW.GLFW_MOD_SHIFT;
		}
		if (down(GLFW.GLFW_KEY_LEFT_CONTROL) || down(GLFW.GLFW_KEY_RIGHT_CONTROL)) {
			m |= GLFW.GLFW_MOD_CONTROL;
		}
		if (altDown()) {
			m |= GLFW.GLFW_MOD_ALT;
		}
		if (down(GLFW.GLFW_KEY_LEFT_SUPER) || down(GLFW.GLFW_KEY_RIGHT_SUPER)) {
			m |= GLFW.GLFW_MOD_SUPER;
		}
		return m;
	}

	/** True if the GLFW modifier bits contain shift. */
	public static boolean hasShift(int modifiers) {
		return (modifiers & GLFW.GLFW_MOD_SHIFT) != 0;
	}

	/** True if the GLFW modifier bits contain control (or command on macOS). */
	public static boolean hasCtrl(int modifiers) {
		return (modifiers & GLFW.GLFW_MOD_CONTROL) != 0 || (InputQuirks.REPLACE_CTRL_KEY_WITH_CMD_KEY && (modifiers & GLFW.GLFW_MOD_SUPER) != 0);
	}

	/** True if the GLFW modifier bits contain alt. */
	public static boolean hasAlt(int modifiers) {
		return (modifiers & GLFW.GLFW_MOD_ALT) != 0;
	}

	/** System clipboard text ("" if empty). */
	public static String getClipboard() {
		String s = Minecraft.getInstance().keyboardHandler.getClipboard();
		return s == null ? "" : s;
	}

	/** Copies text to the system clipboard (ignored if empty). */
	public static void setClipboard(String text) {
		if (text != null && !text.isEmpty()) {
			Minecraft.getInstance().keyboardHandler.setClipboard(text);
		}
	}

	/** Plays the CubeOS click sound (respects the "sounds" setting). */
	public static void playClick() {
		OSSounds.click();
	}

	/**
	 * Removes characters that cannot be typed into CubeOS text inputs: control characters and the
	 * section sign (a Minecraft formatting code). Newlines are kept only if {@code allowNewlines}.
	 */
	public static String sanitize(String text, boolean allowNewlines) {
		StringBuilder sb = new StringBuilder(text.length());
		for (int i = 0; i < text.length(); i++) {
			char c = text.charAt(i);
			if (c == '\r') {
				continue;
			}
			if (c == '\n') {
				if (allowNewlines) {
					sb.append(c);
				} else {
					sb.append(' ');
				}
				continue;
			}
			if (c == '\t') {
				sb.append("    ");
				continue;
			}
			if (c == '§' || c < 32 || c == 127) {
				continue;
			}
			sb.append(c);
		}
		return sb.toString();
	}

	/** True if the code point may be typed into a text input. */
	public static boolean isTypeable(int codePoint) {
		return codePoint >= 32 && codePoint != 127 && codePoint != 0xA7;
	}
}
