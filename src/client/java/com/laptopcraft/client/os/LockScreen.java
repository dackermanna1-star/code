package com.laptopcraft.client.os;

import com.laptopcraft.client.os.ui.Ease;
import com.laptopcraft.client.os.ui.Gfx;
import com.laptopcraft.client.os.ui.Glyphs;
import com.laptopcraft.client.os.ui.TextField;
import net.minecraft.client.gui.GuiGraphics;
import org.lwjgl.glfw.GLFW;

/**
 * Lock screen: dimmed wallpaper, big in-game clock, day/weather line, the user's face and name, and
 * either "Click or press Enter to unlock" or a password field (wrong password → shake + message).
 */
final class LockScreen {
	private final CubeOS os;
	private final TextField password = new TextField("Password");
	private long shakeAt = -1;
	private long errorAt = -1;
	private long shownAt = Ease.now();
	// layout (display coords, last frame)
	private int fieldX;
	private int fieldY;
	private int arrowX;

	LockScreen(CubeOS os) {
		this.os = os;
		password.password = true;
		password.maxLength = 32;
		password.onEnter = s -> tryUnlock();
	}

	void reset() {
		password.setText("");
		password.setFocused(true);
		shakeAt = -1;
		errorAt = -1;
		shownAt = Ease.now();
	}

	private boolean hasPassword() {
		return !OSSettings.password(os.data()).isEmpty();
	}

	private void tryUnlock() {
		if (!hasPassword() || password.getText().equals(OSSettings.password(os.data()))) {
			OSSounds.click();
			os.unlock();
			return;
		}
		shakeAt = Ease.now();
		errorAt = Ease.now();
		password.setText("");
		OSSounds.error();
	}

	void render(GuiGraphics g, int w, int h, int mouseX, int mouseY, int offsetY) {
		Theme t = os.theme();
		g.pose().pushMatrix();
		g.pose().translate(0, offsetY);
		Wallpapers.render(g, OSSettings.wallpaper(os.data()), 0, 0, w, h);
		Gfx.rect(g, 0, 0, w, h, 0x66000000);
		Gfx.gradientV(g, 0, h / 2, w, h - h / 2, 0x00000000, 0x99000000);
		float in = Ease.outCubic(Ease.progress(shownAt, 500));

		// clock
		long dayTime = os.dayTime();
		boolean h24 = OSSettings.clock24h(os.data());
		String time = OSClock.format(dayTime, true);
		String ampm = "";
		if (!h24) {
			String full = OSClock.format(dayTime, false);
			time = full.substring(0, full.length() - 3);
			ampm = full.substring(full.length() - 2);
		}
		int scale = h >= 300 ? 5 : 4;
		int clockY = Math.max(10, h / 5 - Math.round((1f - in) * 10));
		int tw = Gfx.width(time) * scale;
		int a = Math.round(255 * in);
		Gfx.textScaledShadow(g, time, (w - tw) / 2, clockY, scale, Gfx.withAlpha(0xFFFFFFFF, a));
		if (!ampm.isEmpty()) {
			Gfx.textScaledShadow(g, ampm, (w + tw) / 2 + 3, clockY + scale * 7 - 16, 2, Gfx.withAlpha(0xFFFFFFFF, a));
		}
		String sub = "Day " + OSClock.day(dayTime) + "  ·  " + OSClock.partOfDay(dayTime) + "  ·  " + os.weatherGlyph() + " " + os.weatherText();
		Gfx.textCenteredShadow(g, sub, w / 2, clockY + scale * 8 + 6, Gfx.withAlpha(0xFFEDEDED, a));

		// user
		int shake = 0;
		if (shakeAt >= 0) {
			float p = Ease.progress(shakeAt, 450);
			shake = Math.round((float) Math.sin(p * Math.PI * 7) * 7 * (1f - p));
		}
		int face = 32;
		int fy = Math.max(clockY + scale * 8 + 22, h * 3 / 5 - 24);
		int fx = (w - face) / 2;
		Gfx.roundRect(g, fx - 3, fy - 3, face + 6, face + 6, 4, 0x55FFFFFF);
		PlayerFace.draw(g, fx, fy, face);
		Gfx.textCenteredShadow(g, os.username(), w / 2, fy + face + 7, 0xFFFFFFFF);
		int ly = fy + face + 21;
		if (hasPassword()) {
			int fw = 126;
			fieldX = (w - fw) / 2 + shake;
			fieldY = ly;
			password.setBounds(fieldX, fieldY, fw - 20, 17);
			password.setFocused(true);
			password.render(g, mouseX, mouseY - offsetY, 0);
			arrowX = fieldX + fw - 18;
			boolean hov = Gfx.hovered(mouseX, mouseY - offsetY, arrowX, fieldY, 18, 17);
			Gfx.roundRect(g, arrowX, fieldY, 18, 17, 3, hov ? Gfx.lighten(t.accent(), 0.15f) : t.accent());
			Glyphs.arrowRight(g, arrowX + 5, fieldY + 5, t.accentText());
			if (errorAt >= 0 && Ease.now() - errorAt < 2500) {
				float fade = 1f - Ease.clamp01((Ease.now() - errorAt - 2000) / 500f);
				Gfx.textCenteredShadow(g, "Incorrect password — try again", w / 2 + shake, ly + 22, Gfx.withAlpha(0xFFFF8A8A, Math.round(255 * fade)));
			}
		} else {
			int pulse = 150 + Math.round(105 * Ease.pulse(2400));
			Gfx.textCenteredShadow(g, "Click or press Enter to unlock", w / 2, ly + 2, Gfx.withAlpha(0xFFFFFFFF, Math.round(pulse * in)));
		}

		// status corner: unread mail + sound
		int unread = os.account().unreadMail();
		int sx = 8;
		int sy = h - 16;
		if (unread > 0) {
			Glyphs.mail(g, sx, sy + 1, 0xFFFFFFFF);
			Gfx.textShadow(g, unread + " unread", sx + 13, sy, 0xFFFFFFFF);
		}
		Glyphs.speaker(g, w - 18, sy, OSSettings.sounds(os.data()), 0xFFFFFFFF);
		CubeLogo.draw(g, w - 34, sy - 3, 12, 0xC0FFFFFF);
		g.pose().popMatrix();
	}

	boolean mouseClicked(double mx, double my, int button) {
		if (!hasPassword()) {
			tryUnlock();
			return true;
		}
		if (Gfx.hovered(mx, my, arrowX, fieldY, 18, 17)) {
			tryUnlock();
			return true;
		}
		password.setFocused(true);
		password.mouseClicked(mx, my, button);
		return true;
	}

	boolean mouseDragged(double mx, double my, int button, double dx, double dy) {
		return password.mouseDragged(mx, my, button, dx, dy);
	}

	boolean mouseReleased(double mx, double my, int button) {
		return password.mouseReleased(mx, my, button);
	}

	/** Returns false for Esc (so the laptop screen can close). */
	boolean keyPressed(int key, int scan, int mods) {
		if (key == GLFW.GLFW_KEY_ESCAPE) {
			return false;
		}
		if (!hasPassword()) {
			if (key == GLFW.GLFW_KEY_ENTER || key == GLFW.GLFW_KEY_KP_ENTER || key == GLFW.GLFW_KEY_SPACE) {
				tryUnlock();
			}
			return true;
		}
		password.setFocused(true);
		password.keyPressed(key, scan, mods);
		return true;
	}

	boolean charTyped(int cp, int mods) {
		if (hasPassword()) {
			password.setFocused(true);
			password.charTyped(cp, mods);
		}
		return true;
	}
}
