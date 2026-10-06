package com.laptopcraft.client.os;

import com.laptopcraft.client.os.ui.Ease;
import com.laptopcraft.client.os.ui.Gfx;
import com.laptopcraft.client.os.ui.Glyphs;
import com.laptopcraft.client.os.ui.UI;
import com.mojang.blaze3d.platform.cursor.CursorTypes;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.navigation.ScreenRectangle;
import org.jspecify.annotations.Nullable;
import org.lwjgl.glfw.GLFW;

/**
 * Window manager: z-order and focus, chrome rendering (title bar, buttons, shadow, border),
 * dragging with edge snapping, resizing from edges/corners, maximize/minimize/close animations and
 * event routing to apps. Coordinates are display coordinates (desktop area = [0, width) × [0, deskH)).
 */
public final class WindowManager {
	private static final int BTN_W = 26;
	private static final int RESIZE_PAD = 3;
	private static final int CORNER = 8;
	private static final long OPEN_MS = 170;
	private static final long CLOSE_MS = 150;
	private static final long MIN_MS = 200;
	private static final int MIN_VISIBLE = 48;

	private enum Snap {
		NONE,
		MAXIMIZE,
		LEFT,
		RIGHT
	}

	private final CubeOS os;
	private final List<OSWindow> windows = new ArrayList<>();
	private @Nullable OSWindow focused;
	// interaction state
	private @Nullable OSWindow dragging;
	private double dragOffX;
	private double dragOffY;
	private double dragStartX;
	private double dragStartY;
	private boolean dragMoved;
	private Snap snap = Snap.NONE;
	private long snapSince;
	private @Nullable OSWindow resizing;
	private int resizeEdges;
	private int rsX;
	private int rsY;
	private int rsW;
	private int rsH;
	private double rsMouseX;
	private double rsMouseY;
	private @Nullable OSWindow capture;
	private @Nullable OSWindow dialogCapture;
	private @Nullable OSWindow pressedBtnWin;
	private int pressedBtn = -1;
	private int cascade;
	private int deskW = 400;
	private int deskH = 220;

	WindowManager(CubeOS os) {
		this.os = os;
	}

	// ------------------------------------------------------------------ queries

	/** All windows bottom → top (including minimized). */
	public List<OSWindow> all() {
		return Collections.unmodifiableList(windows);
	}

	public @Nullable OSWindow focused() {
		return focused != null && focused.isInteractive() ? focused : null;
	}

	public List<OSWindow> windowsOf(String appId) {
		List<OSWindow> out = new ArrayList<>();
		for (OSWindow w : windows) {
			if (w.info.id().equals(appId) && !w.dead && w.anim != OSWindow.Anim.CLOSE) {
				out.add(w);
			}
		}
		return out;
	}

	public boolean isDraggingOrResizing() {
		return dragging != null || resizing != null;
	}

	/** Top-most interactive window containing the point (incl. resize margin). */
	@Nullable OSWindow windowAt(double mx, double my) {
		for (int i = windows.size() - 1; i >= 0; i--) {
			OSWindow w = windows.get(i);
			if (!w.isInteractive()) {
				continue;
			}
			int pad = w.maximized ? 0 : RESIZE_PAD;
			if (mx >= w.x - pad && my >= w.y - pad && mx < w.x + w.w + pad && my < w.y + w.h + pad) {
				return w;
			}
		}
		return null;
	}

	// ------------------------------------------------------------------ lifecycle

	OSWindow open(AppInfo info, App app) {
		OSWindow win = new OSWindow(os, info, app);
		int w = Math.min(info.defaultWidth(), deskW - 8);
		int h = Math.min(info.defaultHeight(), deskH - 8);
		w = Math.max(w, Math.min(info.minWidth(), deskW));
		h = Math.max(h, Math.min(info.minHeight(), deskH));
		int n = (int) windows.stream().filter(OSWindow::isInteractive).count();
		if (n == 0) {
			cascade = 0;
		}
		int x = (deskW - w) / 2 - 60 + cascade * 20;
		int y = Math.max(4, (deskH - h) / 2 - 30) + cascade * 16;
		cascade = (cascade + 1) % 6;
		if (x + w > deskW - 4) {
			x = Math.max(4, deskW - w - 4 - cascade * 6);
		}
		if (y + h > deskH - 4) {
			y = Math.max(4, deskH - h - 4);
		}
		win.x = Math.max(0, x);
		win.y = Math.max(0, y);
		win.w = w;
		win.h = h;
		win.restoreX = win.x;
		win.restoreY = win.y;
		win.restoreW = w;
		win.restoreH = h;
		if (w > deskW || h > deskH) {
			win.maximized = true;
			fitMaximized(win);
		}
		win.anim = OSWindow.Anim.OPEN;
		win.animStart = Ease.now();
		windows.add(win);
		focused = win;
		return win;
	}

	/** Asks the app; closes with animation if it agrees. */
	public void requestClose(OSWindow win) {
		if (win.dead || win.anim == OSWindow.Anim.CLOSE) {
			return;
		}
		if (!win.crashed && !win.safeBool(win.app::onCloseRequested)) {
			return;
		}
		closeNow(win);
	}

	/** Closes without asking (calls onClose, plays the animation). */
	void closeNow(OSWindow win) {
		if (win.dead || win.anim == OSWindow.Anim.CLOSE) {
			return;
		}
		if (!win.crashed) {
			win.safe(win.app::onClose);
		}
		win.anim = OSWindow.Anim.CLOSE;
		win.animStart = Ease.now();
		if (capture == win) {
			capture = null;
		}
		if (dragging == win) {
			dragging = null;
		}
		if (resizing == win) {
			resizing = null;
		}
		if (focused == win) {
			focused = topInteractive(win);
		}
	}

	/** Closes everything immediately (shutdown/restart). */
	void closeAllImmediately() {
		for (OSWindow w : new ArrayList<>(windows)) {
			if (!w.crashed && !w.dead && w.anim != OSWindow.Anim.CLOSE) {
				w.safe(w.app::onClose);
			}
		}
		windows.clear();
		focused = null;
		capture = null;
		dragging = null;
		resizing = null;
	}

	/** Calls onClose-less persistence hook on screen close: nothing to do but end interactions. */
	void endInteractions() {
		capture = null;
		dragging = null;
		resizing = null;
		dialogCapture = null;
		pressedBtnWin = null;
		snap = Snap.NONE;
	}

	private @Nullable OSWindow topInteractive(@Nullable OSWindow except) {
		for (int i = windows.size() - 1; i >= 0; i--) {
			OSWindow w = windows.get(i);
			if (w != except && w.isInteractive()) {
				return w;
			}
		}
		return null;
	}

	public void focus(OSWindow win) {
		if (win.minimized) {
			restore(win);
			return;
		}
		windows.remove(win);
		windows.add(win);
		focused = win;
	}

	/** Removes focus from all windows (desktop clicked). */
	void unfocusAll() {
		focused = null;
	}

	public void minimize(OSWindow win) {
		if (win.minimized || win.anim == OSWindow.Anim.CLOSE) {
			return;
		}
		win.anim = OSWindow.Anim.MINIMIZE;
		win.animStart = Ease.now();
		if (capture == win) {
			capture = null;
		}
		if (focused == win) {
			focused = topInteractive(win);
		}
	}

	public void restore(OSWindow win) {
		win.minimized = false;
		win.anim = OSWindow.Anim.RESTORE;
		win.animStart = Ease.now();
		windows.remove(win);
		windows.add(win);
		focused = win;
	}

	public void toggleMaximize(OSWindow win) {
		if (win.maximized) {
			win.maximized = false;
			win.x = win.restoreX;
			win.y = win.restoreY;
			win.w = win.restoreW;
			win.h = win.restoreH;
			clampWindow(win);
		} else {
			win.restoreX = win.x;
			win.restoreY = win.y;
			win.restoreW = win.w;
			win.restoreH = win.h;
			win.maximized = true;
			fitMaximized(win);
		}
		win.checkResize();
	}

	private void fitMaximized(OSWindow win) {
		win.x = 0;
		win.y = 0;
		win.w = deskW;
		win.h = deskH;
	}

	private void clampWindow(OSWindow win) {
		win.w = Math.max(Math.min(win.info.minWidth(), deskW), Math.min(win.w, deskW));
		win.h = Math.max(Math.min(win.info.minHeight(), deskH), Math.min(win.h, deskH));
		win.x = Math.max(-(win.w - MIN_VISIBLE), Math.min(win.x, deskW - MIN_VISIBLE));
		win.y = Math.max(0, Math.min(win.y, deskH - OSWindow.TITLE_H));
	}

	/** Called every frame with the current desktop size. */
	void layout(int width, int height) {
		boolean changed = width != deskW || height != deskH;
		deskW = width;
		deskH = height;
		if (changed) {
			for (OSWindow w : windows) {
				if (w.maximized) {
					fitMaximized(w);
				} else {
					clampWindow(w);
				}
			}
		}
	}

	void tick() {
		for (OSWindow w : new ArrayList<>(windows)) {
			if (!w.dead && !w.crashed) {
				w.safe(w.app::tick);
			}
		}
	}

	private void updateAnimations() {
		long now = Ease.now();
		for (int i = windows.size() - 1; i >= 0; i--) {
			OSWindow w = windows.get(i);
			switch (w.anim) {
				case OPEN, RESTORE -> {
					if (now - w.animStart >= (w.anim == OSWindow.Anim.OPEN ? OPEN_MS : MIN_MS)) {
						w.anim = OSWindow.Anim.NONE;
					}
				}
				case MINIMIZE -> {
					if (now - w.animStart >= MIN_MS) {
						w.anim = OSWindow.Anim.NONE;
						w.minimized = true;
					}
				}
				case CLOSE -> {
					if (now - w.animStart >= CLOSE_MS) {
						w.dead = true;
					}
				}
				default -> {
				}
			}
			if (w.dead) {
				windows.remove(i);
			}
		}
	}

	// ------------------------------------------------------------------ rendering

	void render(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
		updateAnimations();
		OSWindow hoverWin = isDraggingOrResizing() ? null : windowAt(mouseX, mouseY);
		OSWindow top = focused();
		for (OSWindow w : windows) {
			if (w.minimized && w.anim == OSWindow.Anim.NONE) {
				continue;
			}
			g.nextStratum();
			boolean isHover = w == hoverWin && w.anim == OSWindow.Anim.NONE;
			if (capture == w || dialogCapture == w) {
				isHover = true;
			}
			renderWindow(g, w, w == top && os.screenFocused(), isHover ? mouseX : Integer.MIN_VALUE / 2, isHover ? mouseY : Integer.MIN_VALUE / 2, partialTick);
		}
		if (dragging != null && snap != Snap.NONE) {
			g.nextStratum();
			renderSnapPreview(g);
		}
		updateCursor(g, mouseX, mouseY, hoverWin);
	}

	private void renderSnapPreview(GuiGraphics g) {
		float a = Ease.outCubic(Ease.progress(snapSince, 150));
		int[] r = snapRect(snap);
		int inset = Math.round((1f - a) * 12);
		int x = r[0] + 4 + inset, y = r[1] + 4 + inset, w = r[2] - 8 - inset * 2, h = r[3] - 8 - inset * 2;
		Theme t = os.theme();
		Gfx.roundRect(g, x, y, w, h, 6, Gfx.withAlpha(t.accent(), Math.round(0x40 * a)));
		Gfx.roundBorder(g, x, y, w, h, 6, Gfx.withAlpha(t.accent(), Math.round(0xC0 * a)));
	}

	private int[] snapRect(Snap s) {
		return switch (s) {
			case LEFT -> new int[] {0, 0, deskW / 2, deskH};
			case RIGHT -> new int[] {deskW / 2, 0, deskW - deskW / 2, deskH};
			default -> new int[] {0, 0, deskW, deskH};
		};
	}

	private void renderWindow(GuiGraphics g, OSWindow w, boolean active, int mx, int my, float pt) {
		Theme t = os.theme();
		long now = Ease.now();
		float scale = 1f;
		float alpha = 1f;
		float content = 1f;
		float tx = 0, ty = 0;
		switch (w.anim) {
			case OPEN -> {
				float p = Ease.clamp01((now - w.animStart) / (float) OPEN_MS);
				scale = 0.9f + 0.1f * Ease.outCubic(p);
				alpha = Ease.outCubic(Math.min(1f, p * 1.6f));
				content = Ease.clamp01((p - 0.3f) / 0.5f);
			}
			case CLOSE -> {
				float p = Ease.clamp01((now - w.animStart) / (float) CLOSE_MS);
				scale = 1f - 0.08f * Ease.outCubic(p);
				alpha = 1f - Ease.inCubic(p);
				content = Ease.clamp01(1f - p / 0.45f);
			}
			case MINIMIZE, RESTORE -> {
				float p = Ease.clamp01((now - w.animStart) / (float) MIN_MS);
				float k = w.anim == OSWindow.Anim.MINIMIZE ? Ease.inOutCubic(p) : 1f - Ease.inOutCubic(p);
				scale = 1f - 0.85f * k;
				alpha = 1f - k * 0.9f;
				content = Ease.clamp01(1f - k * 2.2f);
				int[] target = os.taskbarSlotCenter(w.info.id());
				float cx = w.x + w.w / 2f, cy = w.y + w.h / 2f;
				tx = (target[0] - cx) * k;
				ty = (target[1] - cy) * k;
			}
			default -> {
			}
		}
		boolean animating = w.anim != OSWindow.Anim.NONE;
		if (animating) {
			g.pose().pushMatrix();
			float cx = w.x + w.w / 2f, cy = w.y + w.h / 2f;
			g.pose().translate(cx + tx, cy + ty);
			g.pose().scale(scale, scale);
			g.pose().translate(-cx, -cy);
			mx = Integer.MIN_VALUE / 2;
			my = Integer.MIN_VALUE / 2;
		}
		int r = w.maximized ? 0 : 4;
		if (!w.maximized) {
			Gfx.shadow(g, w.x, w.y, w.w, w.h, active ? 9 : 6, Math.round((active ? 0x60 : 0x40) * alpha));
		}
		Gfx.roundRect(g, w.x, w.y, w.w, w.h, r, Gfx.fade(t.bg(), alpha));
		// content
		int cx = w.contentX(), cy = w.contentY(), cw = w.contentW(), ch = w.contentH();
		w.checkResize();
		Dialog dialog = w.dialog();
		if (content > 0f) {
			int lmx = mx - cx, lmy = my - cy;
			boolean inside = Gfx.hovered(mx, my, cx, cy, cw, ch);
			if (!inside && capture != w) {
				lmx = Integer.MIN_VALUE / 2;
				lmy = Integer.MIN_VALUE / 2;
			}
			if (dialog != null) {
				lmx = Integer.MIN_VALUE / 2;
				lmy = Integer.MIN_VALUE / 2;
			}
			renderContent(g, w, cx, cy, cw, ch, lmx, lmy, pt);
			if (content < 1f) {
				Gfx.rect(g, cx, cy, cw, ch, Gfx.withAlpha(t.bg(), Math.round(255 * (1f - content))));
			}
		}
		// title bar
		int titleCol = active ? t.titleBar() : t.titleBarInactive();
		Gfx.roundRect(g, w.x, w.y, w.w, OSWindow.TITLE_H, r, Gfx.fade(titleCol, alpha), Gfx.TOP);
		Gfx.rect(g, w.x + (w.maximized ? 0 : 1), w.y + OSWindow.TITLE_H - 1, w.w - (w.maximized ? 0 : 2), 1,
				Gfx.withAlpha(t.border(), Math.round(0x90 * alpha)));
		Gfx.icon(g, w.info.icon(), w.x + 4, w.y + 2, 16, Gfx.withAlpha(0xFFFFFFFF, Math.round(255 * alpha * (active ? 1f : 0.75f))));
		int titleMax = w.w - 26 - BTN_W * 3 - 4;
		Gfx.textClipped(g, w.title(), w.x + 25, w.y + 6, titleMax, Gfx.fade(active ? t.text() : t.textDim(), alpha));
		renderButtons(g, w, mx, my, alpha, active);
		if (!w.maximized) {
			int bc = active ? Gfx.lerp(t.border(), t.accent(), 0.25f) : t.border();
			Gfx.roundBorder(g, w.x, w.y, w.w, w.h, r, Gfx.fade(bc, alpha));
		}
		if (dialog != null && content > 0f) {
			g.pose().pushMatrix();
			g.pose().translate(cx, cy);
			Gfx.scissor(g, 0, 0, cw, ch);
			int dmx = mx == Integer.MIN_VALUE / 2 ? mx : mx - cx;
			int dmy = my == Integer.MIN_VALUE / 2 ? my : my - cy;
			dialog.render(g, 0, 0, cw, ch, dmx, dmy);
			Gfx.endScissor(g);
			g.pose().popMatrix();
		}
		if (animating) {
			g.pose().popMatrix();
		}
	}

	private void renderContent(GuiGraphics g, OSWindow w, int cx, int cy, int cw, int ch, int lmx, int lmy, float pt) {
		ScreenRectangle before = g.scissorStack.peek();
		g.enableScissor(cx, cy, cx + cw, cy + ch);
		g.pose().pushMatrix();
		g.pose().translate(cx, cy);
		try {
			w.app.render(g, cw, ch, lmx, lmy, pt);
		} catch (RuntimeException | LinkageError | StackOverflowError | AssertionError e) {
			w.crash(e);
		}
		g.pose().popMatrix();
		// pop our scissor plus anything the app forgot to pop
		for (int i = 0; i < 32 && g.scissorStack.peek() != null && g.scissorStack.peek() != before; i++) {
			g.disableScissor();
		}
	}

	private void renderButtons(GuiGraphics g, OSWindow w, int mx, int my, float alpha, boolean active) {
		Theme t = os.theme();
		int by = w.y;
		int bh = OSWindow.TITLE_H - 1;
		for (int i = 0; i < 3; i++) {
			int bx = w.x + w.w - BTN_W * (3 - i);
			boolean hov = Gfx.hovered(mx, my, bx, by, BTN_W, bh);
			boolean down = hov && pressedBtnWin == w && pressedBtn == i;
			int glyph = Gfx.fade(active || hov ? t.text() : t.textDim(), alpha);
			if (i == 2) {
				if (hov) {
					int red = down ? 0xFFB01020 : 0xFFE81123;
					Gfx.roundRect(g, bx, by, BTN_W, bh + 1, w.maximized ? 0 : 4, red, Gfx.TOP_RIGHT);
					glyph = 0xFFFFFFFF;
				}
				Glyphs.close(g, bx + 10, by + 6, 7, glyph);
			} else {
				if (hov) {
					Gfx.rect(g, bx, by, BTN_W, bh, down ? t.pressed() : t.hover());
				}
				if (i == 0) {
					Glyphs.minimize(g, bx + 9, by + 6, 8, glyph);
				} else if (w.maximized) {
					Glyphs.restore(g, bx + 9, by + 5, 8, glyph);
				} else {
					Glyphs.maximize(g, bx + 9, by + 5, 8, glyph);
				}
			}
		}
	}

	private int buttonAt(OSWindow w, double mx, double my) {
		if (my < w.y || my >= w.y + OSWindow.TITLE_H - 1) {
			return -1;
		}
		for (int i = 0; i < 3; i++) {
			int bx = w.x + w.w - BTN_W * (3 - i);
			if (mx >= bx && mx < bx + BTN_W) {
				return i;
			}
		}
		return -1;
	}

	/** Bit mask: 1 = left, 2 = right, 4 = top, 8 = bottom. */
	private int edgesAt(OSWindow w, double mx, double my) {
		if (w.maximized) {
			return 0;
		}
		int e = 0;
		boolean nearV = my >= w.y - RESIZE_PAD && my < w.y + w.h + RESIZE_PAD;
		boolean nearH = mx >= w.x - RESIZE_PAD && mx < w.x + w.w + RESIZE_PAD;
		if (nearV && mx >= w.x - RESIZE_PAD && mx < w.x + RESIZE_PAD) {
			e |= 1;
		}
		if (nearV && mx >= w.x + w.w - RESIZE_PAD && mx < w.x + w.w + RESIZE_PAD) {
			e |= 2;
		}
		if (nearH && my >= w.y - RESIZE_PAD && my < w.y + 2) {
			e |= 4;
		}
		if (nearH && my >= w.y + w.h - RESIZE_PAD && my < w.y + w.h + RESIZE_PAD) {
			e |= 8;
		}
		// widen corners
		if ((e & 12) != 0) {
			if (mx < w.x + CORNER) {
				e |= 1;
			} else if (mx >= w.x + w.w - CORNER) {
				e |= 2;
			}
		}
		if ((e & 3) != 0) {
			if (my < w.y + CORNER) {
				e |= 4;
			} else if (my >= w.y + w.h - CORNER) {
				e |= 8;
			}
		}
		return e;
	}

	private void updateCursor(GuiGraphics g, int mx, int my, @Nullable OSWindow hoverWin) {
		int edges = 0;
		if (resizing != null) {
			edges = resizeEdges;
		} else if (dragging != null) {
			g.requestCursor(CursorTypes.RESIZE_ALL);
			return;
		} else if (hoverWin != null && hoverWin.dialog() == null) {
			edges = edgesAt(hoverWin, mx, my);
		}
		if (edges == 0) {
			return;
		}
		boolean h = (edges & 3) != 0, v = (edges & 12) != 0;
		g.requestCursor(h && v ? CursorTypes.RESIZE_ALL : h ? CursorTypes.RESIZE_EW : CursorTypes.RESIZE_NS);
	}

	// ------------------------------------------------------------------ input

	/** Mouse down. Returns true if a window took it. */
	boolean mouseClicked(double mx, double my, int button, boolean doubleClick) {
		OSWindow w = windowAt(mx, my);
		if (w == null) {
			return false;
		}
		boolean wasFocused = focused() == w;
		focus(w);
		Dialog dialog = w.dialog();
		// resize edges (not when a dialog is up)
		int edges = dialog == null ? edgesAt(w, mx, my) : 0;
		if (edges != 0 && button == 0) {
			resizing = w;
			resizeEdges = edges;
			rsX = w.x;
			rsY = w.y;
			rsW = w.w;
			rsH = w.h;
			rsMouseX = mx;
			rsMouseY = my;
			return true;
		}
		if (my < w.y + OSWindow.TITLE_H && my >= w.y) {
			int btn = buttonAt(w, mx, my);
			if (btn >= 0) {
				if (button == 0) {
					pressedBtnWin = w;
					pressedBtn = btn;
				}
				return true;
			}
			if (button == 0) {
				if (doubleClick) {
					toggleMaximize(w);
					OSSounds.click();
					return true;
				}
				dragging = w;
				dragOffX = mx - w.x;
				dragOffY = my - w.y;
				dragStartX = mx;
				dragStartY = my;
				dragMoved = false;
				snap = Snap.NONE;
			} else if (button == 1) {
				showWindowMenu(w, mx, my);
			}
			return true;
		}
		if (!w.inContent(mx, my)) {
			return true;
		}
		double lx = mx - w.contentX(), ly = my - w.contentY();
		if (dialog != null) {
			dialogCapture = w;
			dialog.mouseClicked(lx, ly, button);
			return true;
		}
		capture = w;
		w.ctx.setDoubleClick(doubleClick && wasFocused);
		w.safeBool(() -> w.app.mouseClicked(lx, ly, button));
		return true;
	}

	private void showWindowMenu(OSWindow w, double mx, double my) {
		os.showContextMenu(new ContextMenu(List.of(
				MenuItem.of(w.maximized ? "Restore" : "Maximize", () -> toggleMaximize(w)),
				MenuItem.of("Minimize", () -> minimize(w)),
				MenuItem.separator(),
				MenuItem.of("Close", () -> requestClose(w)).shortcut("Alt+F4")), mx, my, deskW, deskH));
	}

	boolean mouseDragged(double mx, double my, int button, double dx, double dy) {
		if (resizing != null) {
			applyResize(resizing, mx, my);
			return true;
		}
		if (dragging != null) {
			OSWindow w = dragging;
			if (!dragMoved && Math.abs(mx - dragStartX) + Math.abs(my - dragStartY) < 3) {
				return true;
			}
			if (!dragMoved && w.maximized) {
				// pull the window out of the maximized state, keeping the cursor at the same relative spot
				float rel = (float) (dragOffX / Math.max(1, w.w));
				w.maximized = false;
				w.w = w.restoreW;
				w.h = w.restoreH;
				dragOffX = Math.max(30, Math.min(w.w - BTN_W * 3 - 10, rel * w.w));
				dragOffY = Math.min(dragOffY, OSWindow.TITLE_H - 4);
				w.checkResize();
			}
			dragMoved = true;
			w.x = (int) Math.round(mx - dragOffX);
			w.y = (int) Math.round(my - dragOffY);
			w.x = Math.max(-(w.w - MIN_VISIBLE), Math.min(w.x, deskW - MIN_VISIBLE));
			w.y = Math.max(0, Math.min(w.y, deskH - OSWindow.TITLE_H));
			Snap s = my <= 1 ? Snap.MAXIMIZE : mx <= 1 ? Snap.LEFT : mx >= deskW - 2 ? Snap.RIGHT : Snap.NONE;
			if (s != snap) {
				snap = s;
				snapSince = Ease.now();
			}
			return true;
		}
		OSWindow d = dialogCapture;
		if (d != null) {
			Dialog dialog = d.dialog();
			if (dialog != null) {
				dialog.mouseDragged(mx - d.contentX(), my - d.contentY(), button, dx, dy);
			}
			return true;
		}
		OSWindow c = capture;
		if (c != null && !c.dead) {
			c.safeBool(() -> c.app.mouseDragged(mx - c.contentX(), my - c.contentY(), button, dx, dy));
			return true;
		}
		return false;
	}

	private void applyResize(OSWindow w, double mx, double my) {
		int dx = (int) Math.round(mx - rsMouseX);
		int dy = (int) Math.round(my - rsMouseY);
		int minW = Math.min(w.info.minWidth(), deskW);
		int minH = Math.min(w.info.minHeight(), deskH);
		int x = rsX, y = rsY, ww = rsW, hh = rsH;
		if ((resizeEdges & 2) != 0) {
			ww = Math.max(minW, rsW + dx);
		}
		if ((resizeEdges & 1) != 0) {
			int nw = Math.max(minW, rsW - dx);
			x = rsX + rsW - nw;
			ww = nw;
		}
		if ((resizeEdges & 8) != 0) {
			hh = Math.max(minH, rsH + dy);
		}
		if ((resizeEdges & 4) != 0) {
			int ny = Math.max(0, rsY + dy);
			int nh = Math.max(minH, rsY + rsH - ny);
			y = rsY + rsH - nh;
			hh = nh;
		}
		w.x = x;
		w.y = Math.max(0, y);
		w.w = Math.min(ww, deskW + MIN_VISIBLE);
		w.h = Math.min(hh, deskH - w.y + 0);
		w.h = Math.max(w.h, Math.min(minH, deskH));
		w.checkResize();
	}

	boolean mouseReleased(double mx, double my, int button) {
		if (resizing != null) {
			resizing = null;
			return true;
		}
		if (dragging != null) {
			OSWindow w = dragging;
			dragging = null;
			if (snap != Snap.NONE) {
				w.restoreX = Math.max(0, Math.min(w.x, deskW - w.w));
				w.restoreY = Math.max(0, w.y);
				w.restoreW = w.w;
				w.restoreH = w.h;
				if (snap == Snap.MAXIMIZE) {
					w.maximized = true;
					fitMaximized(w);
				} else {
					int[] r = snapRect(snap);
					w.x = r[0];
					w.y = r[1];
					w.w = Math.max(r[2], Math.min(w.info.minWidth(), deskW));
					w.h = r[3];
				}
				w.checkResize();
				snap = Snap.NONE;
			}
			return true;
		}
		if (pressedBtnWin != null) {
			OSWindow w = pressedBtnWin;
			int btn = pressedBtn;
			pressedBtnWin = null;
			pressedBtn = -1;
			if (buttonAt(w, mx, my) == btn && !w.dead) {
				OSSounds.click();
				switch (btn) {
					case 0 -> minimize(w);
					case 1 -> toggleMaximize(w);
					default -> requestClose(w);
				}
			}
			return true;
		}
		OSWindow d = dialogCapture;
		if (d != null) {
			dialogCapture = null;
			Dialog dialog = d.dialog();
			if (dialog != null) {
				dialog.mouseReleased(mx - d.contentX(), my - d.contentY(), button);
			}
			return true;
		}
		OSWindow c = capture;
		if (c != null) {
			capture = null;
			if (!c.dead) {
				c.safeBool(() -> c.app.mouseReleased(mx - c.contentX(), my - c.contentY(), button));
			}
			return true;
		}
		return false;
	}

	boolean mouseScrolled(double mx, double my, double amount) {
		OSWindow w = windowAt(mx, my);
		if (w == null) {
			return false;
		}
		if (w.dialog() != null || !w.inContent(mx, my)) {
			return true;
		}
		w.safeBool(() -> w.app.mouseScrolled(mx - w.contentX(), my - w.contentY(), amount));
		return true;
	}

	/** Key for the focused window. Returns true if consumed (by its dialog or app). */
	boolean keyPressed(int key, int scan, int mods) {
		OSWindow w = focused();
		if (w == null) {
			return false;
		}
		Dialog dialog = w.dialog();
		if (dialog != null) {
			return dialog.keyPressed(key, scan, mods);
		}
		return w.safeBool(() -> w.app.keyPressed(key, scan, mods));
	}

	boolean charTyped(int cp, int mods) {
		OSWindow w = focused();
		if (w == null) {
			return false;
		}
		Dialog dialog = w.dialog();
		if (dialog != null) {
			return dialog.charTyped(cp, mods);
		}
		return w.safeBool(() -> w.app.charTyped(cp, mods));
	}

	/** Alt+Tab style: focus the next window (cycling through minimized ones too). */
	void cycleFocus() {
		if (windows.isEmpty()) {
			return;
		}
		OSWindow next = windows.get(0);
		if (next.minimized) {
			restore(next);
		} else {
			focus(next);
		}
	}

	/** True if the given key is an OS-level window shortcut that was handled. */
	boolean handleShortcut(int key, int mods) {
		OSWindow w = focused();
		boolean alt = UI.hasAlt(mods);
		boolean ctrl = UI.hasCtrl(mods);
		if (w != null && ((alt && key == GLFW.GLFW_KEY_F4) || (ctrl && key == GLFW.GLFW_KEY_W))) {
			requestClose(w);
			return true;
		}
		if (alt && key == GLFW.GLFW_KEY_TAB) {
			cycleFocus();
			return true;
		}
		if (w != null && (mods & GLFW.GLFW_MOD_SUPER) != 0) {
			if (key == GLFW.GLFW_KEY_UP) {
				if (!w.maximized) {
					toggleMaximize(w);
				}
				return true;
			}
			if (key == GLFW.GLFW_KEY_DOWN) {
				if (w.maximized) {
					toggleMaximize(w);
				} else {
					minimize(w);
				}
				return true;
			}
		}
		return false;
	}
}
