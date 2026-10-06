package com.laptopcraft.client.os.ui;

import com.laptopcraft.client.os.Theme;
import com.mojang.blaze3d.platform.cursor.CursorTypes;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.function.Consumer;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphics;
import org.jspecify.annotations.Nullable;
import org.lwjgl.glfw.GLFW;

/**
 * Multi-line, soft-wrapped text editor. Supports caret movement (arrows, home/end, ctrl+arrows,
 * ctrl+home/end, page up/down), selection (shift+keys, mouse drag, double-click word), clipboard
 * (ctrl+A/C/X/V), undo/redo (ctrl+Z / ctrl+Y or ctrl+shift+Z), wheel scrolling with a draggable
 * scrollbar, a blinking caret, max length and read-only mode.
 *
 * <pre>{@code
 * TextArea editor = new TextArea();
 * editor.setBounds(0, 20, width, height - 20);
 * editor.setText(ctx.data().readText("notes.txt").orElse(""));
 * editor.onChange = text -> dirty = true;
 * }</pre>
 */
public class TextArea extends Widget {
	private static final int PAD = 4;
	private static final int LINE_H = 10;

	/** A visual (wrapped) line: text[start, end). {@code end} excludes the newline. */
	private record Line(int start, int end) {
	}

	private record Snapshot(String text, int cursor, int anchor) {
	}

	private String text = "";
	private int cursor;
	private int anchor;
	private int desiredX = -1;
	private long lastInput = Ease.now();
	private final ScrollState scroll = new ScrollState();
	private final List<Line> lines = new ArrayList<>();
	private int wrapWidth = -1;
	private String wrappedText = null;
	private boolean dragging;
	private long lastClickTime;
	private final Deque<Snapshot> undo = new ArrayDeque<>();
	private final Deque<Snapshot> redo = new ArrayDeque<>();
	private long lastUndoPush;

	public int maxLength = 20000;
	public boolean readOnly;
	public String placeholder = "";
	/** Draw background and border. */
	public boolean bordered = true;
	public @Nullable Consumer<String> onChange;
	/** Optional text color override (0 = theme). */
	public int textColor;

	public TextArea() {
	}

	// ------------------------------------------------------------------ text state

	public String getText() {
		return text;
	}

	/** Replaces the whole text (clears undo history, does not call onChange). */
	public void setText(String value) {
		String v = UI.sanitize(value == null ? "" : value, true);
		if (v.length() > maxLength) {
			v = v.substring(0, maxLength);
		}
		text = v;
		cursor = anchor = 0;
		undo.clear();
		redo.clear();
		invalidate();
		scroll.scrollTo(0);
	}

	public int getCursor() {
		return cursor;
	}

	public void setCursor(int pos, boolean extend) {
		cursor = clampIndex(pos);
		if (!extend) {
			anchor = cursor;
		}
		lastInput = Ease.now();
		revealCaret();
	}

	public boolean hasSelection() {
		return cursor != anchor;
	}

	public String getSelectedText() {
		return text.substring(Math.min(cursor, anchor), Math.max(cursor, anchor));
	}

	public void selectAll() {
		anchor = 0;
		cursor = text.length();
	}

	/** Number of visual lines at the current width. */
	public int lineCount() {
		ensureWrapped();
		return lines.size();
	}

	/** Logical line (1-based) and column (1-based) of the caret, for status bars. */
	public int[] caretLineColumn() {
		int line = 1, col = 1;
		for (int i = 0; i < cursor && i < text.length(); i++) {
			if (text.charAt(i) == '\n') {
				line++;
				col = 1;
			} else {
				col++;
			}
		}
		return new int[] {line, col};
	}

	public ScrollState scroll() {
		return scroll;
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
			dragging = false;
		}
	}

	private int clampIndex(int i) {
		return Math.max(0, Math.min(i, text.length()));
	}

	private void invalidate() {
		wrappedText = null;
	}

	// ------------------------------------------------------------------ editing

	private void pushUndo(boolean coalesce) {
		long now = Ease.now();
		if (coalesce && now - lastUndoPush < 800 && !undo.isEmpty()) {
			lastUndoPush = now;
			return;
		}
		undo.push(new Snapshot(text, cursor, anchor));
		while (undo.size() > 100) {
			undo.removeLast();
		}
		redo.clear();
		lastUndoPush = now;
	}

	/** Inserts at the caret, replacing the selection. */
	public void insert(String s) {
		if (readOnly) {
			return;
		}
		String clean = UI.sanitize(s, true);
		int a = Math.min(anchor, cursor), b = Math.max(anchor, cursor);
		int room = maxLength - (text.length() - (b - a));
		if (clean.length() > room) {
			clean = clean.substring(0, Math.max(0, room));
		}
		if (clean.isEmpty() && a == b) {
			return;
		}
		pushUndo(clean.length() == 1 && a == b && clean.charAt(0) != '\n');
		text = text.substring(0, a) + clean + text.substring(b);
		cursor = anchor = a + clean.length();
		changed();
	}

	private void deleteRange(int from, int to) {
		if (readOnly) {
			return;
		}
		int a = clampIndex(Math.min(from, to)), b = clampIndex(Math.max(from, to));
		if (a == b) {
			return;
		}
		pushUndo(b - a == 1);
		text = text.substring(0, a) + text.substring(b);
		cursor = anchor = a;
		changed();
	}

	private void changed() {
		invalidate();
		desiredX = -1;
		lastInput = Ease.now();
		revealCaret();
		if (onChange != null) {
			onChange.accept(text);
		}
	}

	private void undoOrRedo(boolean isUndo) {
		Deque<Snapshot> from = isUndo ? undo : redo;
		Deque<Snapshot> to = isUndo ? redo : undo;
		if (from.isEmpty() || readOnly) {
			return;
		}
		to.push(new Snapshot(text, cursor, anchor));
		Snapshot s = from.pop();
		text = s.text();
		cursor = clampIndex(s.cursor());
		anchor = clampIndex(s.anchor());
		lastUndoPush = 0;
		invalidate();
		revealCaret();
		if (onChange != null) {
			onChange.accept(text);
		}
	}

	// ------------------------------------------------------------------ wrapping

	private int textWidth() {
		return Math.max(10, w - PAD * 2 - ScrollState.BAR_WIDTH);
	}

	private void ensureWrapped() {
		int ww = textWidth();
		if (wrappedText == text && wrapWidth == ww) {
			return;
		}
		wrappedText = text;
		wrapWidth = ww;
		lines.clear();
		Font f = UI.font();
		int start = 0;
		int n = text.length();
		while (true) {
			int nl = text.indexOf('\n', start);
			int paraEnd = nl < 0 ? n : nl;
			wrapParagraph(f, start, paraEnd, ww);
			if (nl < 0) {
				break;
			}
			start = nl + 1;
		}
	}

	private void wrapParagraph(Font f, int start, int end, int width) {
		if (start == end) {
			lines.add(new Line(start, end));
			return;
		}
		int lineStart = start;
		while (lineStart < end) {
			String rest = text.substring(lineStart, end);
			if (f.width(rest) <= width) {
				lines.add(new Line(lineStart, end));
				return;
			}
			String head = f.plainSubstrByWidth(rest, width);
			int brk = head.length();
			if (brk <= 0) {
				brk = 1;
			}
			// prefer breaking after the last space in the head
			int space = head.lastIndexOf(' ');
			if (space > 0) {
				brk = space + 1;
			}
			lines.add(new Line(lineStart, lineStart + brk));
			lineStart += brk;
		}
	}

	private int lineOf(int index) {
		ensureWrapped();
		int lo = 0, hi = lines.size() - 1, ans = 0;
		while (lo <= hi) {
			int mid = (lo + hi) >>> 1;
			if (lines.get(mid).start() <= index) {
				ans = mid;
				lo = mid + 1;
			} else {
				hi = mid - 1;
			}
		}
		return ans;
	}

	private int xInLine(int lineIdx, int index) {
		Line l = lines.get(lineIdx);
		int to = Math.max(l.start(), Math.min(index, l.end()));
		return UI.font().width(text.substring(l.start(), to));
	}

	private int indexInLine(int lineIdx, int px) {
		Line l = lines.get(lineIdx);
		String s = text.substring(l.start(), l.end());
		Font f = UI.font();
		if (px <= 0) {
			return l.start();
		}
		String head = f.plainSubstrByWidth(s, px);
		int i = head.length();
		if (i < s.length()) {
			int before = f.width(head);
			int after = f.width(s.substring(0, i + 1));
			if (px - before > after - px) {
				i++;
			}
		}
		int idx = l.start() + i;
		// at a soft wrap boundary the trailing space belongs to this line; keep caret before it
		boolean softWrapped = l.end() < text.length() && text.charAt(l.end()) != '\n' && lineIdx + 1 < lines.size()
				&& lines.get(lineIdx + 1).start() == l.end();
		if (softWrapped && idx >= l.end() && l.end() > l.start() && text.charAt(l.end() - 1) == ' ') {
			idx = l.end() - 1;
		}
		return idx;
	}

	private int contentHeight() {
		ensureWrapped();
		return lines.size() * LINE_H + PAD * 2;
	}

	private void revealCaret() {
		ensureWrapped();
		scroll.setContent(contentHeight(), h);
		int li = lineOf(cursor);
		scroll.ensureVisible(li * LINE_H, li * LINE_H + LINE_H + PAD * 2);
	}

	// ------------------------------------------------------------------ render

	@Override
	public void render(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
		Theme t = theme();
		ensureWrapped();
		scroll.setContent(contentHeight(), h);
		boolean hov = isHovered(mouseX, mouseY);
		if (bordered) {
			Gfx.roundRect(g, x, y, w, h, 3, t.inputBg());
			Gfx.roundBorder(g, x, y, w, h, 3, focused ? t.accent() : t.border());
		}
		if (hov && mouseX < x + w - ScrollState.BAR_WIDTH) {
			g.requestCursor(CursorTypes.IBEAM);
		}
		int off = scroll.offset();
		int tx = x + PAD;
		int top = y + PAD - off;
		Gfx.scissor(g, x + 1, y + 1, w - 2, h - 2);
		if (text.isEmpty() && !placeholder.isEmpty()) {
			Gfx.textWrapped(g, placeholder, tx, y + PAD, textWidth(), LINE_H, t.textDim());
		}
		int first = Math.max(0, off / LINE_H - 1);
		int last = Math.min(lines.size() - 1, (off + h) / LINE_H + 1);
		int selA = Math.min(anchor, cursor), selB = Math.max(anchor, cursor);
		boolean showSel = selA != selB;
		int col = textColor != 0 ? textColor : t.text();
		Font f = UI.font();
		for (int i = first; i <= last; i++) {
			Line l = lines.get(i);
			int ly = top + i * LINE_H;
			if (showSel && selA <= l.end() && selB >= l.start()) {
				int a = Math.max(selA, l.start()), b = Math.min(selB, l.end());
				int ax = f.width(text.substring(l.start(), a));
				int bx = f.width(text.substring(l.start(), b));
				boolean extendsPastEol = selB > l.end() && (l.end() < text.length());
				if (extendsPastEol) {
					bx += 3;
				}
				if (bx > ax) {
					Gfx.rect(g, tx + ax, ly, bx - ax, LINE_H, focused ? t.selection() : Gfx.fade(t.selection(), 0.5f));
				}
			}
			if (l.end() > l.start()) {
				Gfx.text(g, text.substring(l.start(), l.end()), tx, ly + 1, col);
			}
		}
		if (focused && !readOnly && (Ease.now() - lastInput) % 1000 < 550) {
			int li = lineOf(cursor);
			int cx = tx + xInLine(li, cursor);
			int cy = top + li * LINE_H;
			Gfx.rect(g, cx, cy, 1, LINE_H, t.text());
		}
		Gfx.endScissor(g);
		scroll.renderScrollbar(g, x + w - ScrollState.BAR_WIDTH - 1, y + 2, h - 4, mouseX, mouseY);
	}

	// ------------------------------------------------------------------ mouse

	private int indexAtPoint(double mx, double my) {
		ensureWrapped();
		int li = (int) Math.floor((my - y - PAD + scroll.offset()) / LINE_H);
		li = Math.max(0, Math.min(li, lines.size() - 1));
		return indexInLine(li, (int) Math.round(mx - x - PAD));
	}

	@Override
	public boolean mouseClicked(double mx, double my, int button) {
		if (!contains(mx, my) || !enabled) {
			return false;
		}
		if (scroll.mouseClicked(mx, my, x + w - ScrollState.BAR_WIDTH - 1, y + 2, h - 4)) {
			return true;
		}
		if (button != 0) {
			return true;
		}
		long now = Ease.now();
		int idx = indexAtPoint(mx, my);
		if (now - lastClickTime < 300) {
			int a = idx, b = idx;
			while (a > 0 && TextField.isWordChar(text.charAt(a - 1))) {
				a--;
			}
			while (b < text.length() && TextField.isWordChar(text.charAt(b))) {
				b++;
			}
			anchor = a;
			cursor = b;
			lastClickTime = 0;
			return true;
		}
		lastClickTime = now;
		cursor = idx;
		if (!UI.shiftDown()) {
			anchor = idx;
		}
		desiredX = -1;
		lastInput = now;
		dragging = true;
		return true;
	}

	@Override
	public boolean mouseDragged(double mx, double my, int button, double dx, double dy) {
		if (scroll.mouseDragged(my)) {
			return true;
		}
		if (!dragging) {
			return false;
		}
		// auto-scroll when dragging beyond the edges
		if (my < y) {
			scroll.scrollBy(-LINE_H);
		} else if (my > y + h) {
			scroll.scrollBy(LINE_H);
		}
		cursor = indexAtPoint(mx, Math.max(y, Math.min(my, y + h - 1)));
		lastInput = Ease.now();
		return true;
	}

	@Override
	public boolean mouseReleased(double mx, double my, int button) {
		boolean was = dragging || scroll.isDragging();
		dragging = false;
		scroll.mouseReleased();
		return was;
	}

	@Override
	public boolean mouseScrolled(double mx, double my, double amount) {
		ensureWrapped();
		scroll.setContent(contentHeight(), h);
		return scroll.mouseScrolled(amount);
	}

	// ------------------------------------------------------------------ keyboard

	private void moveVertical(int dir, boolean shift) {
		ensureWrapped();
		int li = lineOf(cursor);
		if (desiredX < 0) {
			desiredX = xInLine(li, cursor);
		}
		int target = li + dir;
		if (target < 0) {
			cursor = 0;
		} else if (target >= lines.size()) {
			cursor = text.length();
		} else {
			cursor = indexInLine(target, desiredX);
		}
		if (!shift) {
			anchor = cursor;
		}
		lastInput = Ease.now();
		revealCaret();
	}

	private int lineEndForCaret(int li) {
		Line l = lines.get(li);
		boolean soft = li + 1 < lines.size() && lines.get(li + 1).start() == l.end();
		return soft && l.end() > l.start() && text.charAt(l.end() - 1) == ' ' ? l.end() - 1 : l.end();
	}

	@Override
	public boolean keyPressed(int key, int scanCode, int mods) {
		if (!focused || !enabled) {
			return false;
		}
		boolean shift = UI.hasShift(mods);
		boolean ctrl = UI.hasCtrl(mods);
		ensureWrapped();
		switch (key) {
			case GLFW.GLFW_KEY_ESCAPE -> {
				return false;
			}
			case GLFW.GLFW_KEY_LEFT -> {
				desiredX = -1;
				if (hasSelection() && !shift) {
					setCursor(Math.min(anchor, cursor), false);
				} else {
					setCursor(ctrl ? TextField.wordLeft(text, cursor) : cursor - 1, shift);
				}
				return true;
			}
			case GLFW.GLFW_KEY_RIGHT -> {
				desiredX = -1;
				if (hasSelection() && !shift) {
					setCursor(Math.max(anchor, cursor), false);
				} else {
					setCursor(ctrl ? TextField.wordRight(text, cursor) : cursor + 1, shift);
				}
				return true;
			}
			case GLFW.GLFW_KEY_UP -> {
				if (ctrl) {
					scroll.scrollBy(-LINE_H);
				} else {
					moveVertical(-1, shift);
				}
				return true;
			}
			case GLFW.GLFW_KEY_DOWN -> {
				if (ctrl) {
					scroll.scrollBy(LINE_H);
				} else {
					moveVertical(1, shift);
				}
				return true;
			}
			case GLFW.GLFW_KEY_PAGE_UP -> {
				moveVertical(-Math.max(1, h / LINE_H - 1), shift);
				return true;
			}
			case GLFW.GLFW_KEY_PAGE_DOWN -> {
				moveVertical(Math.max(1, h / LINE_H - 1), shift);
				return true;
			}
			case GLFW.GLFW_KEY_HOME -> {
				desiredX = -1;
				setCursor(ctrl ? 0 : lines.get(lineOf(cursor)).start(), shift);
				return true;
			}
			case GLFW.GLFW_KEY_END -> {
				desiredX = -1;
				setCursor(ctrl ? text.length() : lineEndForCaret(lineOf(cursor)), shift);
				return true;
			}
			case GLFW.GLFW_KEY_BACKSPACE -> {
				if (hasSelection()) {
					deleteRange(anchor, cursor);
				} else if (cursor > 0) {
					deleteRange(ctrl ? TextField.wordLeft(text, cursor) : cursor - 1, cursor);
				}
				return true;
			}
			case GLFW.GLFW_KEY_DELETE -> {
				if (hasSelection()) {
					deleteRange(anchor, cursor);
				} else if (cursor < text.length()) {
					deleteRange(cursor, ctrl ? TextField.wordRight(text, cursor) : cursor + 1);
				}
				return true;
			}
			case GLFW.GLFW_KEY_ENTER, GLFW.GLFW_KEY_KP_ENTER -> {
				insert("\n");
				return true;
			}
			case GLFW.GLFW_KEY_TAB -> {
				if (readOnly) {
					return false;
				}
				insert("    ");
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
					if (hasSelection()) {
						UI.setClipboard(getSelectedText());
					}
					return true;
				}
				case GLFW.GLFW_KEY_X -> {
					if (hasSelection()) {
						UI.setClipboard(getSelectedText());
						deleteRange(anchor, cursor);
					}
					return true;
				}
				case GLFW.GLFW_KEY_V -> {
					insert(UI.getClipboard());
					return true;
				}
				case GLFW.GLFW_KEY_Z -> {
					undoOrRedo(!shift);
					return true;
				}
				case GLFW.GLFW_KEY_Y -> {
					undoOrRedo(false);
					return true;
				}
				default -> {
				}
			}
		}
		return key >= GLFW.GLFW_KEY_SPACE && key <= GLFW.GLFW_KEY_GRAVE_ACCENT && !ctrl && !UI.hasAlt(mods);
	}

	@Override
	public boolean charTyped(int codePoint, int modifiers) {
		if (!focused || !enabled || readOnly || !UI.isTypeable(codePoint)) {
			return false;
		}
		insert(Character.toString(codePoint));
		return true;
	}
}
