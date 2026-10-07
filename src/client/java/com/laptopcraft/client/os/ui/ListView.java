package com.laptopcraft.client.os.ui;

import com.laptopcraft.client.os.Theme;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;
import java.util.function.Function;
import net.minecraft.client.gui.GuiGraphics;
import org.jspecify.annotations.Nullable;
import org.lwjgl.glfw.GLFW;

/**
 * Scrollable list with single selection, hover highlight, keyboard navigation (up/down/home/end/
 * page up/down, Enter activates), double-click activation, right-click callback and an empty state.
 * Rows are drawn by a {@link RowRenderer} (default: the label from {@code labeler}).
 *
 * <pre>{@code
 * ListView<FileEntry> files = new ListView<>(FileEntry::name);
 * files.rowHeight = 18;
 * files.renderer = (g, f, x, y, w, h, sel, hov) -> { Gfx.icon(g, Icons.FILE_TEXT, x + 2, y + 1, 16); Gfx.text(g, f.name(), x + 22, y + 5, ctx.theme().text()); };
 * files.onActivate = f -> ctx.openFile(f.name());
 * files.setItems(ctx.data().listFiles());
 * }</pre>
 */
public class ListView<T> extends Widget {
	/** Draws one row. (x, y, w, h) is the row rectangle; the selection/hover background is already drawn. */
	@FunctionalInterface
	public interface RowRenderer<T> {
		void render(GuiGraphics g, T item, int x, int y, int w, int h, boolean selected, boolean hovered);
	}

	/** Right-click on a row; coordinates are local (same space as the list). */
	@FunctionalInterface
	public interface RowMenu<T> {
		void open(T item, double x, double y);
	}

	private final List<T> items = new ArrayList<>();
	private final Function<T, String> labeler;
	private final ScrollState scroll = new ScrollState();
	private int selected = -1;
	private long lastClick;
	private int lastClickRow = -1;

	public int rowHeight = 16;
	public @Nullable RowRenderer<T> renderer;
	public @Nullable Consumer<T> onSelect;
	public @Nullable Consumer<T> onActivate;
	public @Nullable RowMenu<T> onRightClick;
	public String emptyText = "Nothing here yet";
	/** Draw alternating row backgrounds. */
	public boolean zebra;
	/** Draw a background + border around the list. */
	public boolean bordered;

	/**
	 * @param labeler row text for the default renderer
	 */
	public ListView(Function<T, String> labeler) {
		this.labeler = labeler;
	}

	/** Replaces the items, keeping the selection on an equal item if possible. */
	public void setItems(List<? extends T> newItems) {
		T sel = getSelected();
		items.clear();
		items.addAll(newItems);
		selected = sel == null ? -1 : items.indexOf(sel);
	}

	/** The items (live list). */
	public List<T> items() {
		return items;
	}

	/** Selected item or null. */
	public @Nullable T getSelected() {
		return selected >= 0 && selected < items.size() ? items.get(selected) : null;
	}

	/** Selected index or -1. */
	public int getSelectedIndex() {
		return selected;
	}

	/** Selects (and scrolls to) a row without firing callbacks; -1 clears. */
	public void setSelectedIndex(int index) {
		selected = index < 0 || index >= items.size() ? -1 : index;
		if (selected >= 0) {
			scroll.ensureVisible(selected * rowHeight, (selected + 1) * rowHeight);
		}
	}

	/** The list's scroll state. */
	public ScrollState scroll() {
		return scroll;
	}

	private int innerX() {
		return x + (bordered ? 1 : 0);
	}

	private int innerY() {
		return y + (bordered ? 1 : 0);
	}

	private int innerW() {
		return w - (bordered ? 2 : 0) - (scroll.canScroll() ? ScrollState.BAR_WIDTH : 0);
	}

	private int innerH() {
		return h - (bordered ? 2 : 0);
	}

	@Override
	public void render(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
		Theme t = theme();
		scroll.setContent(items.size() * rowHeight, innerH());
		if (bordered) {
			Gfx.roundRect(g, x, y, w, h, 3, t.inputBg());
			Gfx.roundBorder(g, x, y, w, h, 3, focused ? Gfx.withAlpha(t.accent(), 0xAA) : t.border());
		}
		int ix = innerX(), iy = innerY(), iw = innerW(), ih = innerH();
		if (items.isEmpty()) {
			Gfx.textCentered(g, emptyText, ix + iw / 2, iy + Math.min(ih / 2 - 4, 24), t.textDim());
			return;
		}
		Gfx.scissor(g, ix, iy, iw, ih);
		int off = scroll.offset();
		int first = Math.max(0, off / rowHeight);
		int last = Math.min(items.size() - 1, (off + ih) / rowHeight);
		boolean inside = Gfx.hovered(mouseX, mouseY, ix, iy, iw, ih);
		for (int i = first; i <= last; i++) {
			int ry = iy + i * rowHeight - off;
			boolean hov = inside && mouseY >= ry && mouseY < ry + rowHeight;
			boolean sel = i == selected;
			if (zebra && i % 2 == 1) {
				Gfx.rect(g, ix, ry, iw, rowHeight, t.surfaceAlt());
			}
			if (sel) {
				Gfx.roundRect(g, ix + 1, ry, iw - 2, rowHeight, 3, focused || !bordered ? t.selection() : Gfx.fade(t.selection(), 0.6f));
			} else if (hov) {
				Gfx.roundRect(g, ix + 1, ry, iw - 2, rowHeight, 3, t.hover());
			}
			T item = items.get(i);
			if (renderer != null) {
				renderer.render(g, item, ix, ry, iw, rowHeight, sel, hov);
			} else {
				Gfx.textClipped(g, labeler.apply(item), ix + 6, ry + (rowHeight - 8) / 2, iw - 10, t.text());
			}
		}
		Gfx.endScissor(g);
		scroll.renderScrollbar(g, x + w - ScrollState.BAR_WIDTH - (bordered ? 1 : 0), iy + 1, ih - 2, mouseX, mouseY);
	}

	private int rowAt(double my) {
		int r = (int) Math.floor((my - innerY() + scroll.offset()) / rowHeight);
		return r >= 0 && r < items.size() ? r : -1;
	}

	private void select(int idx, boolean fire) {
		if (idx < 0 || idx >= items.size()) {
			return;
		}
		boolean changed = idx != selected;
		selected = idx;
		scroll.ensureVisible(idx * rowHeight, (idx + 1) * rowHeight);
		if (changed && fire && onSelect != null) {
			onSelect.accept(items.get(idx));
		}
	}

	@Override
	public boolean mouseClicked(double mx, double my, int button) {
		if (!contains(mx, my) || !enabled) {
			return false;
		}
		if (scroll.mouseClicked(mx, my, x + w - ScrollState.BAR_WIDTH - (bordered ? 1 : 0), innerY() + 1, innerH() - 2)) {
			return true;
		}
		int row = rowAt(my);
		if (row < 0) {
			return true;
		}
		select(row, true);
		long now = Ease.now();
		if (button == 1 && onRightClick != null) {
			onRightClick.open(items.get(row), mx, my);
			return true;
		}
		if (button == 0 && row == lastClickRow && now - lastClick < 350) {
			lastClick = 0;
			if (onActivate != null) {
				UI.playClick();
				onActivate.accept(items.get(row));
			}
			return true;
		}
		lastClick = now;
		lastClickRow = row;
		return true;
	}

	@Override
	public boolean mouseDragged(double mx, double my, int button, double dx, double dy) {
		return scroll.mouseDragged(my);
	}

	@Override
	public boolean mouseReleased(double mx, double my, int button) {
		return scroll.mouseReleased();
	}

	@Override
	public boolean mouseScrolled(double mx, double my, double amount) {
		return scroll.mouseScrolled(amount);
	}

	@Override
	public boolean keyPressed(int keyCode, int scanCode, int modifiers) {
		if (!focused || items.isEmpty()) {
			return false;
		}
		int page = Math.max(1, innerH() / rowHeight - 1);
		switch (keyCode) {
			case GLFW.GLFW_KEY_UP -> select(selected <= 0 ? 0 : selected - 1, true);
			case GLFW.GLFW_KEY_DOWN -> select(Math.min(items.size() - 1, selected + 1), true);
			case GLFW.GLFW_KEY_HOME -> select(0, true);
			case GLFW.GLFW_KEY_END -> select(items.size() - 1, true);
			case GLFW.GLFW_KEY_PAGE_UP -> select(Math.max(0, selected - page), true);
			case GLFW.GLFW_KEY_PAGE_DOWN -> select(Math.min(items.size() - 1, selected + page), true);
			case GLFW.GLFW_KEY_ENTER, GLFW.GLFW_KEY_KP_ENTER -> {
				T sel = getSelected();
				if (sel != null && onActivate != null) {
					onActivate.accept(sel);
				}
			}
			default -> {
				return false;
			}
		}
		return true;
	}

	@Override
	public boolean isFocusable() {
		return true;
	}
}
