package com.laptopcraft.client.net;

import com.laptopcraft.client.os.Icons;
import com.laptopcraft.client.os.ui.Gfx;
import com.laptopcraft.registry.ModSounds;
import java.util.List;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.toasts.Toast;
import net.minecraft.client.gui.components.toasts.ToastManager;
import net.minecraft.sounds.SoundEvent;
import org.jspecify.annotations.Nullable;

/**
 * Vanilla toast in CubeOS style, used for laptop notifications (deliveries, mail...) while the laptop
 * screen is closed.
 */
public final class LaptopToast implements Toast {
	private static final int WIDTH = 176;
	private static final long DISPLAY_MS = 6000;

	private final String icon;
	private final String title;
	private final List<String> lines;
	private Toast.Visibility visibility = Toast.Visibility.SHOW;

	public LaptopToast(String icon, String title, String message) {
		this.icon = icon;
		this.title = title;
		List<String> wrapped = Gfx.wrap(message == null ? "" : message, WIDTH - 36);
		this.lines = wrapped.size() > 2 ? List.of(wrapped.get(0), Gfx.ellipsize(wrapped.get(1) + "…", WIDTH - 36)) : wrapped;
	}

	@Override
	public Toast.Visibility getWantedVisibility() {
		return visibility;
	}

	@Override
	public void update(ToastManager toastManager, long visibilityTime) {
		double limit = DISPLAY_MS * toastManager.getNotificationDisplayTimeMultiplier();
		visibility = visibilityTime < limit ? Toast.Visibility.SHOW : Toast.Visibility.HIDE;
	}

	@Override
	public @Nullable SoundEvent getSoundEvent() {
		return ModSounds.LAPTOP_NOTIFY;
	}

	@Override
	public int width() {
		return WIDTH;
	}

	@Override
	public int height() {
		return Math.max(32, 16 + lines.size() * 10 + 4);
	}

	@Override
	public void render(GuiGraphics g, Font font, long visibilityTime) {
		int h = height();
		Gfx.roundRect(g, 0, 0, WIDTH, h, 4, 0xF0202226);
		Gfx.roundBorder(g, 0, 0, WIDTH, h, 4, 0xFF3A3D44);
		Gfx.rect(g, 1, 4, 2, h - 8, accent());
		Gfx.icon(g, Icons.notification(icon), 8, (h - 16) / 2, 16);
		Gfx.textClipped(g, title, 30, 6, WIDTH - 36, 0xFFFFFFFF);
		for (int i = 0; i < lines.size(); i++) {
			Gfx.text(g, lines.get(i), 30, 17 + i * 10, 0xFFB5BAC2);
		}
	}

	private int accent() {
		return switch (icon) {
			case "error" -> 0xFFF2555A;
			case "success", "bank" -> 0xFF3DD68C;
			case "emerazon" -> 0xFFF59E0B;
			case "ender_eats", "endereats" -> 0xFF9B5CF6;
			default -> 0xFF3D8BFD;
		};
	}
}
