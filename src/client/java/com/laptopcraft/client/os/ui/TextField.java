package com.laptopcraft.client.os.ui;

import com.laptopcraft.client.os.Theme;
import com.mojang.blaze3d.platform.cursor.CursorTypes;
import java.util.function.Consumer;
import java.util.function.Predicate;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphics;
import org.jspecify.annotations.Nullable;
import org.lwjgl.glfw.GLFW;

/**
 * Single-line text input: caret, selection (shift+arrows, mouse drag, double-click word), clipboard
 * (ctrl+A/C/X/V), word jumps (ctrl+arrows / ctrl+backspace), home/end, placeholder, max length,
 * password mode, optional search glyph and clear button. Enter calls {@link #onEnter}.
 * Escape is never consumed (so dialogs/the OS can react to it).
 *
 * <pre>{@code
 * TextField search = new TextField("Search products…");
 * search.setBounds(8, 8, 160, 16);
 * search.onEnter = text -> runSearch(text);
 * search.onChange = text -> liveFilter(text);
 * }</pre>
 */
public class TextField extends Widget {
	private String text = "";
	private int cursor;
	private int anchor;
	private int scrollX;
	private long lastInput = Ease.now();
	private long lastClickTime;
	private boolean dragging;

	public String placeholder;
	public int maxLength = 256;
	public boolean password;
	public boolean readOnly;
	/** Draws a magnifier on the left (search boxes). */
	public boolean searchIcon;
	/** Shows a small × that clears the text when not empty. */
	public boolean clearButton;
	/** Draw background and border (false = borderless, for custom chrome like the browser bar). */
	public boolean bordered = true;
	public @Nullable Consumer<String> onChange;
	public @Nullable Consumer<String> onEnter;
	/** Optional per-result filter; edits producing a rejected string are ignored. */
	public @Nullable Predicate<String> filter;
	/** Optional text color override (0 = theme). */
	public int textColor;

	public TextField(String placeholder) {
		this.placeholder = placeholder;
	}

	public TextField() {
		this("");
	}

	// ------------------------------------------------------------------ state

	public String getText() {
		return text;
	}

	/** Replaces the text (does not call onChange), caret to the end. */
	public void setText(String value) {
		String v = UI.sanitize(value == null ? "" : value, false);
		if (v.length() > maxLength) {
			v = v.substring(0, maxLength);
		}
		text = v;
		cursor = anchor = text.length();
		scrollX = 0;
	}

	public int getCursor() {
		return cursor;
	}

	public void setCursor(int pos, boolean extendSelection) {
		cursor = Math.max(0, Math.min(pos, text.length()));
		if (!extendSelection) {
			anchor = cursor;
		}
		lastInput = Ease.now();
	}

	public void selectAll() {
		anchor = 0;
		cursor = text.length();
	}

	public boolean hasSelection() {
		return anchor != cursor;
	}

	public String getSelectedText() {
		return text.substring(Math.min(anchor, cursor), Math.max(anchor, cursor));
	}

	@Override
	public boolean isFocusable() {
		return true;
	}

	@Override
	public void setFocused(boolean f) {
		if (f && !focused) {
			lastInput = Ease.now();
		}
		super.setFocused(f);
		if (!f) {
			anchor = cursor;
			dragging = false;
		}
	}

	/** Inserts text at the caret, replacing the selection. */
	public void insert(String s) {
		if (readOnly) {
			return;
		}
		String clean = UI.sanitize(s, false);
		int a = Math.min(anchor, cursor), b = Math.max(anchor, cursor);
		int room = maxLength - (text.length() - (b - a));
		if (room <= 0 && clean.length() > 0) {
			return;
		}
		if (clean.length() > room) {
			clean = clean.substring(0, room);
		}
		String next = text.substring(0, a) + clean + text.substring(b);
		apply(next, a + clean.length());
	}

	private void deleteRange(int a, int b) {
		if (readOnly || a == b) {
			return;
		}
		int lo = Math.max(0, Math.min(a, b)), hi = Math.min(text.length(), Math.max(a, b));
		apply(text.substring(0, lo) + text.substring(hi), lo);
	}

	private void apply(String next, int newCursor) {
		if (filter != null && !filter.test(next)) {
			return;
		}
		boolean changed = !next.equals(text);
		text = next;
		cursor = anchor = Math.max(0, Math.min(newCursor, text.length()));
		lastInput = Ease.now();
		if (changed && onChange != null) {
			onChange.accept(text);
		}
	}

	// ------------------------------------------------------------------ geometry

	private int leftPad() {
		return searchIcon ? 16 : 4;
	}

	private int rightPad() {
		return clearButton && !text.isEmpty() ? 14 : 4;
	}

	private int innerWidth() {
		return Math.max(1, w - leftPad() - rightPad());
	}

	private String display() {
		return password ? "•".repeat(text.length()) : text;
	}

	private int xOf(int index) {
		Font f = UI.font();
		String d = display();
		return f.width(d.substring(0, Math.max(0, Math.min(index, d.length()))));
	}

	private int indexAt(double localX) {
		Font f = UI.font();
		String d = display();
		int target = (int) Math.round(localX + scrollX);
		if (target <= 0) {
			return 0;
		}
		String head = f.plainSubstrByWidth(d, target);
		int i = head.length();
		if (i < d.length()) {
			int before = f.width(head);
			int after = f.width(d.substring(0, i + 1));
			if (target - before > after - target) {
				i++;
			}
		}
		return Math.min(i, text.length());
	}

	private void ensureCaretVisible() {
		int cx = xOf(cursor);
		int iw = innerWidth();
		if (cx - scrollX > iw - 1) {
			scrollX = cx - iw + 1;
		}
		if (cx - scrollX < 0) {
			scrollX = cx;
		}
		int total = UI.font().width(display());
		scrollX = Math.max(0, Math.min(scrollX, Math.max(0, total - iw + 1)));
	}

	// ------------------------------------------------------------------ render

	@Override
	public void render(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
		Theme t = theme();
		boolean hov = isHovered(mouseX, mouseY);
		int r = Math.min(3, h / 4);
		if (bordered) {
			Gfx.roundRect(g, x, y, w, h, r, t.inputBg());
			int bc = focused ? t.accent() : hov ? Gfx.lerp(t.border(), t.textDim(), 0.5f) : t.border();
			Gfx.roundBorder(g, x, y, w, h, r, bc);
			if (focused) {
				Gfx.rect(g, x + r, y + h - 1, w - 2 * r, 1, t.accent());
			}
		}
		if (hov) {
			g.requestCursor(CursorTypes.IBEAM);
		}
		int ty = y + (h - 8) / 2;
		if (searchIcon) {
			Glyphs.search(g, x + 5, y + (h - 8) / 2, focused ? t.accent() : t.textDim());
		}
		ensureCaretVisible();
		int ix = x + leftPad();
		int iw = innerWidth();
		Gfx.scissor(g, ix - 1, y + 1, iw + 2, h - 2);
		String d = display();
		if (text.isEmpty()) {
			if (!placeholder.isEmpty()) {
				Gfx.text(g, Gfx.ellipsize(placeholder, iw), ix, ty, Gfx.fade(t.textDim(), enabled ? 1f : 0.6f));
			}
		} else {
			if (hasSelection() && focused) {
				int a = xOf(Math.min(anchor, cursor)) - scrollX;
				int b = xOf(Math.max(anchor, cursor)) - scrollX;
				Gfx.rect(g, ix + a, ty - 1, b - a, 10, t.selection());
			}
			int col = textColor != 0 ? textColor : t.text();
			Gfx.text(g, d, ix - scrollX, ty, enabled ? col : Gfx.fade(col, 0.5f));
		}
		if (focused && !readOnly && ((Ease.now() - lastInput) % 1000 < 550)) {
			int cx = ix + xOf(cursor) - scrollX;
			Gfx.rect(g, cx, ty - 1, 1, 10, t.text());
		}
		Gfx.endScissor(g);
		if (clearButton && !text.isEmpty() && !readOnly) {
			int bx = x + w - 12;
			int by = y + (h - 8) / 2;
			boolean ch = Gfx.hovered(mouseX, mouseY, bx - 2, by - 2, 10, 10);
			if (ch) {
				Gfx.roundRect(g, bx - 2, by - 1, 10, 9, 2, t.hover());
				g.requestCursor(CursorTypes.ARROW);
			}
			Glyphs.close(g, bx, by + 1, 5, ch ? t.text() : t.textDim());
		}
	}

	// ------------------------------------------------------------------ input

	@Override
	public boolean mouseClicked(double mx, double my, int button) {
		if (!contains(mx, my) || !enabled) {
			return false;
		}
		if (clearButton && !text.isEmpty() && !readOnly && mx >= x + w - 14) {
			apply("", 0);
			return true;
		}
		if (button != 0) {
			return true;
		}
		long now = Ease.now();
		int idx = indexAt(mx - x - leftPad());
		if (now - lastClickTime < 300 && !password) {
			selectWordAt(idx);
			lastClickTime = 0;
			return true;
		}
		lastClickTime = now;
		setCursor(idx, UI.shiftDown());
		dragging = true;
		return true;
	}

	@Override
	public boolean mouseDragged(double mx, double my, int button, double dx, double dy) {
		if (!dragging) {
			return false;
		}
		setCursor(indexAt(mx - x - leftPad()), true);
		return true;
	}

	@Override
	public boolean mouseReleased(double mx, double my, int button) {
		boolean was = dragging;
		dragging = false;
		return was;
	}

	private void selectWordAt(int idx) {
		int a = idx, b = idx;
		while (a > 0 && isWordChar(text.charAt(a - 1))) {
			a--;
		}
		while (b < text.length() && isWordChar(text.charAt(b))) {
			b++;
		}
		anchor = a;
		cursor = b;
	}

	static boolean isWordChar(char c) {
		return Character.isLetterOrDigit(c) || c == '_' || c == '\'';
	}

	static int wordLeft(String s, int from) {
		int i = from;
		while (i > 0 && !isWordChar(s.charAt(i - 1))) {
			i--;
		}
		while (i > 0 && isWordChar(s.charAt(i - 1))) {
			i--;
		}
		return i;
	}

	static int wordRight(String s, int from) {
		int i = from;
		int n = s.length();
		while (i < n && !isWordChar(s.charAt(i))) {
			i++;
		}
		while (i < n && isWordChar(s.charAt(i))) {
			i++;
		}
		return i;
	}

	@Override
	public boolean keyPressed(int key, int scanCode, int mods) {
		if (!focused || !enabled) {
			return false;
		}
		boolean shift = UI.hasShift(mods);
		boolean ctrl = UI.hasCtrl(mods);
		switch (key) {
			case GLFW.GLFW_KEY_ESCAPE -> {
				return false;
			}
			case GLFW.GLFW_KEY_ENTER, GLFW.GLFW_KEY_KP_ENTER -> {
				if (onEnter != null) {
					onEnter.accept(text);
					return true;
				}
				return false;
			}
			case GLFW.GLFW_KEY_LEFT -> {
				if (hasSelection() && !shift) {
					setCursor(Math.min(anchor, cursor), false);
				} else {
					setCursor(ctrl ? wordLeft(text, cursor) : Character.offsetByCodePoints(text, cursor, cursor > 0 ? -1 : 0), shift);
				}
				return true;
			}
			case GLFW.GLFW_KEY_RIGHT -> {
				if (hasSelection() && !shift) {
					setCursor(Math.max(anchor, cursor), false);
				} else {
					setCursor(ctrl ? wordRight(text, cursor) : Character.offsetByCodePoints(text, cursor, cursor < text.length() ? 1 : 0), shift);
				}
				return true;
			}
			case GLFW.GLFW_KEY_HOME, GLFW.GLFW_KEY_UP -> {
				setCursor(0, shift);
				return true;
			}
			case GLFW.GLFW_KEY_END, GLFW.GLFW_KEY_DOWN -> {
				setCursor(text.length(), shift);
				return true;
			}
			case GLFW.GLFW_KEY_BACKSPACE -> {
				if (hasSelection()) {
					deleteRange(anchor, cursor);
				} else if (cursor > 0) {
					deleteRange(ctrl ? wordLeft(text, cursor) : Character.offsetByCodePoints(text, cursor, -1), cursor);
				}
				return true;
			}
			case GLFW.GLFW_KEY_DELETE -> {
				if (hasSelection()) {
					deleteRange(anchor, cursor);
				} else if (cursor < text.length()) {
					deleteRange(cursor, ctrl ? wordRight(text, cursor) : Character.offsetByCodePoints(text, cursor, 1));
				}
				return true;
			}
			default -> {
			}
		}
		if (ctrl && !UI.hasAlt(mods)) {
			switch (key) {
				case GLFW.GLFW_KEY_A -> {
					selectAll();
					return true;
				}
				case GLFW.GLFW_KEY_C -> {
					if (hasSelection() && !password) {
						UI.setClipboard(getSelectedText());
					}
					return true;
				}
				case GLFW.GLFW_KEY_X -> {
					if (hasSelection() && !password) {
						UI.setClipboard(getSelectedText());
						deleteRange(anchor, cursor);
					}
					return true;
				}
				case GLFW.GLFW_KEY_V -> {
					insert(UI.getClipboard());
					return true;
				}
				default -> {
				}
			}
		}
		// Swallow plain printable keys so they never trigger app shortcuts while typing.
		return key >= GLFW.GLFW_KEY_SPACE && key <= GLFW.GLFW_KEY_GRAVE_ACCENT && !ctrl && !UI.hasAlt(mods);
	}

	@Override
	public boolean charTyped(int codePoint, int modifiers) {
		if (!focused || !enabled || readOnly) {
			return false;
		}
		if (!UI.isTypeable(codePoint)) {
			return false;
		}
		insert(Character.toString(codePoint));
		return true;
	}
}
