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
 * Select box: shows the selected option; clicking opens a list (drawn above sibling widgets when used
 * in a {@link WidgetGroup}; otherwise call {@link #renderOverlay} yourself after rendering everything else).
 *
 * <pre>{@code
 * Dropdown<String> sort = new Dropdown<>(List.of("Featured", "Price ↑", "Price ↓"), s -> s, this::resort);
 * sort.setBounds(x, y, 90, 16);
 * }</pre>
 */
public class Dropdown<T> extends Widget {
	private static final int ROW_H = 14;

	private final List<T> options = new ArrayList<>();
	private final Function<T, String> labeler;
	private int selected;
	private boolean open;
	private int hoverRow = -1;
	private int listScroll;
	public @Nullable Consumer<T> onChange;
	/** Maximum rows visible when open. */
	public int maxRows = 8;
	/** Open the list upwards (e.g. near the bottom of a window). */
	public boolean openUp;
	private long openedAt;

	/**
	 * @param labeler text shown for an option
	 * @param onChange called when the user picks another option
	 */
	public Dropdown(List<T> options, Function<T, String> labeler, @Nullable Consumer<T> onChange) {
		this.options.addAll(options);
		this.labeler = labeler;
		this.onChange = onChange;
	}

	/** Replaces the options (selection index is clamped). */
	public void setOptions(List<T> newOptions) {
		options.clear();
		options.addAll(newOptions);
		selected = Math.max(0, Math.min(selected, options.size() - 1));
	}

	/** The options (live list). */
	public List<T> options() {
		return options;
	}

	/** Selected option (null if there are none). */
	public @Nullable T getSelected() {
		return options.isEmpty() ? null : options.get(selected);
	}

	/** Selected index. */
	public int getSelectedIndex() {
		return selected;
	}

	/** Selects without firing onChange. */
	public void setSelectedIndex(int index) {
		selected = Math.max(0, Math.min(index, options.size() - 1));
	}

	/** Selects the option equal to {@code value} (no callback). */
	public void setSelected(T value) {
		int i = options.indexOf(value);
		if (i >= 0) {
			selected = i;
		}
	}

	/** True while the list is open. */
	public boolean isOpen() {
		return open;
	}

	/** Closes the list. */
	public void close() {
		open = false;
	}

	@Override
	public boolean closeOverlay() {
		boolean was = open;
		open = false;
		return was;
	}

	@Override
	public boolean hasOverlay() {
		return open;
	}

	private int rows() {
		return Math.min(maxRows, options.size());
	}

	private int listY() {
		return openUp ? y - rows() * ROW_H - 4 : y + h + 2;
	}

	private int listH() {
		return rows() * ROW_H + 2;
	}

	@Override
	public boolean capturesOverlay(double mx, double my) {
		return open && Gfx.hovered(mx, my, x, listY(), w, listH());
	}

	private void choose(int idx) {
		open = false;
		if (idx >= 0 && idx < options.size()) {
			boolean changed = idx != selected;
			selected = idx;
			if (changed && onChange != null) {
				onChange.accept(options.get(idx));
			}
		}
	}

	@Override
	public void render(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
		Theme t = theme();
		boolean hov = enabled && (isHovered(mouseX, mouseY) || open);
		Gfx.roundRect(g, x, y, w, h, 3, t.surface());
		Gfx.roundBorder(g, x, y, w, h, 3, open || focused ? t.accent() : t.border());
		if (hov) {
			Gfx.roundRect(g, x + 1, y + 1, w - 2, h - 2, 2, t.hover());
		}
		T sel = getSelected();
		String label = sel == null ? "" : labeler.apply(sel);
		Gfx.textClipped(g, label, x + 5, y + (h - 8) / 2, w - 18, enabled ? t.text() : t.textDim());
		Glyphs.chevronDown(g, x + w - 11, y + h / 2 - 1, 3, t.textDim());
	}

	@Override
	public void renderOverlay(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
		if (!open || options.isEmpty()) {
			return;
		}
		Theme t = theme();
		int ly = listY(), lh = listH();
		float a = Ease.outCubic(Ease.progress(openedAt, 120));
		int slide = Math.round((1f - a) * 4) * (openUp ? 1 : -1);
		ly += slide;
		Gfx.shadow(g, x, ly, w, lh, 5, 0x50);
		Gfx.panel(g, x, ly, w, lh, 3, t.surface(), t.border());
		hoverRow = -1;
		int rows = rows();
		listScroll = Math.max(0, Math.min(listScroll, options.size() - rows));
		for (int i = 0; i < rows; i++) {
			int idx = i + listScroll;
			int ry = ly + 1 + i * ROW_H;
			boolean rh = Gfx.hovered(mouseX, mouseY, x + 1, ry, w - 2, ROW_H);
			if (rh) {
				hoverRow = idx;
				Gfx.roundRect(g, x + 2, ry, w - 4, ROW_H, 2, t.hover());
			}
			if (idx == selected) {
				Gfx.roundRect(g, x + 2, ry + 3, 2, ROW_H - 6, 1, t.accent());
			}
			Gfx.textClipped(g, labeler.apply(options.get(idx)), x + 7, ry + 3, w - 12, idx == selected ? t.accent() : t.text());
		}
		if (options.size() > rows) {
			int trackH = lh - 4;
			int thumbH = Math.max(6, trackH * rows / options.size());
			int thumbY = ly + 2 + (trackH - thumbH) * listScroll / Math.max(1, options.size() - rows);
			Gfx.rect(g, x + w - 3, thumbY, 2, thumbH, t.scrollbar());
		}
	}

	@Override
	public boolean mouseClicked(double mx, double my, int button) {
		if (!enabled) {
			return false;
		}
		if (open) {
			if (Gfx.hovered(mx, my, x, listY(), w, listH())) {
				int row = (int) ((my - listY() - 1) / ROW_H);
				choose(row + listScroll);
				UI.playClick();
				return true;
			}
			open = false;
			return contains(mx, my);
		}
		if (contains(mx, my) && button == 0 && !options.isEmpty()) {
			open = true;
			openedAt = Ease.now();
			listScroll = Math.max(0, Math.min(selected - maxRows / 2, options.size() - rows()));
			UI.playClick();
			return true;
		}
		return false;
	}

	@Override
	public boolean mouseScrolled(double mx, double my, double amount) {
		if (open) {
			if (Gfx.hovered(mx, my, x, listY(), w, listH())) {
				listScroll = Math.max(0, Math.min(listScroll - (int) Math.signum(amount), options.size() - rows()));
				return true;
			}
			return false;
		}
		if (contains(mx, my) && enabled && !options.isEmpty()) {
			int next = Math.max(0, Math.min(options.size() - 1, selected - (int) Math.signum(amount)));
			choose(next);
			return true;
		}
		return false;
	}

	@Override
	public boolean keyPressed(int keyCode, int scanCode, int modifiers) {
		if (!focused || !enabled || options.isEmpty()) {
			return false;
		}
		switch (keyCode) {
			case GLFW.GLFW_KEY_UP -> {
				choose(Math.max(0, selected - 1));
				return true;
			}
			case GLFW.GLFW_KEY_DOWN -> {
				choose(Math.min(options.size() - 1, selected + 1));
				return true;
			}
			case GLFW.GLFW_KEY_ENTER, GLFW.GLFW_KEY_SPACE -> {
				open = !open;
				openedAt = Ease.now();
				return true;
			}
			case GLFW.GLFW_KEY_ESCAPE -> {
				if (open) {
					open = false;
					return true;
				}
				return false;
			}
			default -> {
				return false;
			}
		}
	}

	@Override
	public void setFocused(boolean f) {
		super.setFocused(f);
		if (!f) {
			open = false;
		}
	}

	@Override
	public boolean isFocusable() {
		return true;
	}
}
