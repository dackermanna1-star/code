package com.laptopcraft.client.os;

import com.laptopcraft.client.os.ui.Ease;
import com.laptopcraft.client.os.ui.Gfx;
import com.laptopcraft.client.os.ui.Glyphs;
import com.laptopcraft.client.os.ui.UI;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Iterator;
import java.util.List;
import java.util.function.Consumer;
import net.minecraft.client.gui.GuiGraphics;
import org.jspecify.annotations.Nullable;

/**
 * OS notifications: a stack of toasts in the top-right corner of the display (slide in, auto-dismiss
 * after 5 s, paused while hovered, click to dismiss/open) and the session history shown by the
 * notification center.
 */
public final class Notifications {
	/** A notification as stored in the history. */
	public record Entry(String icon, String title, String message, long createdAt) {
	}

	private static final int MAX_HISTORY = 50;
	private static final int MAX_TOASTS = 4;
	private static final long LIFETIME = 5000;
	private static final long ANIM_IN = 260;
	private static final long ANIM_OUT = 200;
	private static final int GAP = 6;

	private static final class Toast {
		final Entry entry;
		final long shownAt = Ease.now();
		long visibleMs;
		long lastFrame = -1;
		long closingAt = -1;
		float y = -1;
		int height;

		Toast(Entry e) {
			this.entry = e;
		}
	}

	private final List<Toast> toasts = new ArrayList<>();
	private final List<Entry> history = new ArrayList<>();
	private int unseen;
	private @Nullable Consumer<Entry> onActivate;
	// layout of last frame
	private int areaW;

	/** Called when a toast is clicked (e.g. open Mail for mail notifications). */
	public void setOnActivate(@Nullable Consumer<Entry> handler) {
		this.onActivate = handler;
	}

	/** Shows a toast and adds it to the history. */
	public void push(String icon, String title, String message) {
		Entry e = new Entry(icon == null ? "info" : icon, title == null ? "" : title, message == null ? "" : message, Ease.now());
		history.add(0, e);
		while (history.size() > MAX_HISTORY) {
			history.remove(history.size() - 1);
		}
		unseen++;
		toasts.add(0, new Toast(e));
		int open = 0;
		for (Toast t : toasts) {
			if (t.closingAt < 0 && ++open > MAX_TOASTS) {
				t.closingAt = Ease.now();
			}
		}
	}

	/** Notification history of this session, newest first. */
	public List<Entry> history() {
		return Collections.unmodifiableList(history);
	}

	/** Clears the history (notification center "Clear all"). */
	public void clearHistory() {
		history.clear();
		unseen = 0;
	}

	/** Number of notifications since the notification center was last opened. */
	public int unseen() {
		return unseen;
	}

	/** Resets {@link #unseen()}. */
	public void markSeen() {
		unseen = 0;
	}

	/** Hides all toasts immediately (e.g. when the notification center opens). */
	public void dismissAllToasts() {
		long now = Ease.now();
		for (Toast t : toasts) {
			if (t.closingAt < 0) {
				t.closingAt = now;
			}
		}
	}

	private static int toastWidth(int displayW) {
		return Math.min(190, Math.max(120, displayW / 3));
	}

	private static int toastHeight(Entry e, int w) {
		int lines = e.message().isEmpty() ? 0 : Math.min(2, Gfx.wrap(e.message(), w - 34).size());
		return 18 + lines * 10 + 4;
	}

	/** Renders the toast stack at the top-right of the display. */
	public void render(GuiGraphics g, int displayW, int topY, int mouseX, int mouseY) {
		if (toasts.isEmpty()) {
			return;
		}
		Theme t = UI.theme();
		long now = Ease.now();
		int w = toastWidth(displayW);
		areaW = w;
		float targetY = topY;
		Iterator<Toast> it = toasts.iterator();
		while (it.hasNext()) {
			Toast toast = it.next();
			toast.height = toastHeight(toast.entry, w);
			if (toast.closingAt >= 0 && now - toast.closingAt > ANIM_OUT) {
				it.remove();
				continue;
			}
			if (toast.y < 0) {
				toast.y = targetY;
			}
			toast.y = Ease.approach(toast.y, targetY, 0.25f);
			int x0 = displayW - w - 8;
			int ty = Math.round(toast.y);
			boolean hov = toast.closingAt < 0 && Gfx.hovered(mouseX, mouseY, x0, ty, w, toast.height);
			// lifetime only counts while not hovered
			if (toast.lastFrame >= 0 && !hov) {
				toast.visibleMs += now - toast.lastFrame;
			}
			toast.lastFrame = now;
			if (toast.closingAt < 0 && toast.visibleMs > LIFETIME) {
				toast.closingAt = now;
			}
			float in = Ease.outCubic(Ease.progress(toast.shownAt, ANIM_IN));
			float out = toast.closingAt < 0 ? 0f : Ease.inCubic(Ease.progress(toast.closingAt, ANIM_OUT));
			int slide = Math.round((1f - in) * (w + 12)) + Math.round(out * (w + 12));
			float alpha = in * (1f - out);
			int x = x0 + slide;
			Gfx.shadow(g, x, ty, w, toast.height, 6, Math.round(0x55 * alpha));
			Gfx.panel(g, x, ty, w, toast.height, 5, Gfx.fade(t.surface(), 0.4f + 0.6f * alpha), Gfx.fade(t.border(), alpha));
			if (hov) {
				Gfx.roundRect(g, x + 1, ty + 1, w - 2, toast.height - 2, 4, t.hover());
			}
			Gfx.rect(g, x + 1, ty + 4, 2, toast.height - 8, Gfx.fade(accentFor(toast.entry.icon(), t), alpha));
			Gfx.icon(g, Icons.notification(toast.entry.icon()), x + 8, ty + 6, 16, Gfx.withAlpha(0xFFFFFFFF, Math.round(255 * alpha)));
			Gfx.textClipped(g, toast.entry.title(), x + 30, ty + 6, w - 44, Gfx.fade(t.text(), alpha));
			List<String> lines = Gfx.wrap(toast.entry.message(), w - 34);
			for (int i = 0; i < Math.min(2, lines.size()); i++) {
				String line = i == 1 && lines.size() > 2 ? Gfx.ellipsize(lines.get(i) + "…", w - 34) : lines.get(i);
				Gfx.text(g, line, x + 30, ty + 17 + i * 10, Gfx.fade(t.textDim(), alpha));
			}
			if (hov) {
				boolean ch = Gfx.hovered(mouseX, mouseY, x + w - 13, ty + 3, 10, 10);
				Glyphs.close(g, x + w - 11, ty + 5, 5, ch ? t.text() : t.textDim());
			}
			// progress of the auto-dismiss timer
			if (toast.closingAt < 0) {
				float life = Ease.clamp01(toast.visibleMs / (float) LIFETIME);
				Gfx.rect(g, x + 4, ty + toast.height - 2, Math.round((w - 8) * (1f - life)), 1, Gfx.withAlpha(t.accent(), 0x70));
			}
			targetY += toast.height + GAP;
		}
	}

	static int accentFor(String icon, Theme t) {
		return switch (icon) {
			case "error" -> t.danger();
			case "success", "bank" -> t.success();
			case "warning" -> t.warning();
			case "emerazon" -> 0xFFF59E0B;
			case "ender_eats", "endereats" -> 0xFF9B5CF6;
			default -> t.accent();
		};
	}

	/** Handles a click on a toast. Returns true if consumed. */
	public boolean mouseClicked(double mx, double my, int displayW) {
		int w = areaW > 0 ? areaW : toastWidth(displayW);
		int x0 = displayW - w - 8;
		for (Toast toast : toasts) {
			if (toast.closingAt >= 0 || toast.y < 0) {
				continue;
			}
			int ty = Math.round(toast.y);
			if (Gfx.hovered(mx, my, x0, ty, w, toast.height)) {
				toast.closingAt = Ease.now();
				boolean onClose = Gfx.hovered(mx, my, x0 + w - 13, ty + 3, 10, 10);
				if (!onClose && onActivate != null) {
					onActivate.accept(toast.entry);
				}
				UI.playClick();
				return true;
			}
		}
		return false;
	}

	/** "just now", "5m ago", "2h ago". */
	public static String ago(long createdAt) {
		long s = (Ease.now() - createdAt) / 1000;
		if (s < 45) {
			return "just now";
		}
		if (s < 3600) {
			return Math.max(1, s / 60) + "m ago";
		}
		return s / 3600 + "h ago";
	}
}
