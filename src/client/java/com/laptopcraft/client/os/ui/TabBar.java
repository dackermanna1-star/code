package com.laptopcraft.client.os.ui;

import com.laptopcraft.client.os.Theme;
import java.util.ArrayList;
import java.util.List;
import java.util.function.IntConsumer;
import net.minecraft.client.gui.GuiGraphics;
import org.jspecify.annotations.Nullable;

/**
 * Row of tabs. {@link Style#UNDERLINE} draws text tabs with an animated accent underline,
 * {@link Style#PILLS} draws a segmented control.
 *
 * <pre>{@code
 * TabBar tabs = new TabBar(List.of("Inbox", "Orders", "Spam"), i -> showTab(i));
 * tabs.setBounds(0, 0, width, 18);
 * }</pre>
 */
public class TabBar extends Widget {
	public enum Style {
		UNDERLINE,
		PILLS
	}

	private final List<String> labels = new ArrayList<>();
	private int selected;
	public Style style = Style.UNDERLINE;
	/** Stretch tabs to fill the whole width. */
	public boolean fill;
	public @Nullable IntConsumer onChange;
	private float animX = -1;
	private float animW = -1;
	private long last = -1;

	public TabBar(List<String> labels, @Nullable IntConsumer onChange) {
		this.labels.addAll(labels);
		this.onChange = onChange;
	}

	public TabBar style(Style s) {
		this.style = s;
		return this;
	}

	public void setLabels(List<String> newLabels) {
		labels.clear();
		labels.addAll(newLabels);
		selected = Math.max(0, Math.min(selected, labels.size() - 1));
	}

	public int getSelected() {
		return selected;
	}

	/** Selects without firing onChange. */
	public void setSelected(int index) {
		selected = Math.max(0, Math.min(index, labels.size() - 1));
	}

	private int tabX(int i) {
		if (fill) {
			return x + w * i / Math.max(1, labels.size());
		}
		int cx = x;
		for (int k = 0; k < i; k++) {
			cx += tabW(k);
		}
		return cx;
	}

	private int tabW(int i) {
		if (fill) {
			return w * (i + 1) / Math.max(1, labels.size()) - w * i / Math.max(1, labels.size());
		}
		return Gfx.width(labels.get(i)) + 16;
	}

	@Override
	public void render(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
		Theme t = theme();
		if (labels.isEmpty()) {
			return;
		}
		long now = Ease.now();
		float dt = last < 0 ? 1f : Math.min(0.1f, (now - last) / 1000f);
		last = now;
		float targetX = tabX(selected), targetW = tabW(selected);
		if (animX < 0) {
			animX = targetX;
			animW = targetW;
		}
		animX = Ease.approach(animX, targetX, dt * 16f);
		animW = Ease.approach(animW, targetW, dt * 16f);
		if (style == Style.PILLS) {
			Gfx.roundRect(g, x, y, w, h, 4, t.surfaceAlt());
			Gfx.roundRect(g, Math.round(animX) + 1, y + 1, Math.round(animW) - 2, h - 2, 3, t.dark() ? 0xFF3A3D44 : 0xFFFFFFFF);
		} else {
			Gfx.rect(g, x, y + h - 1, w, 1, t.border());
		}
		for (int i = 0; i < labels.size(); i++) {
			int tx = tabX(i), tw = tabW(i);
			boolean hov = Gfx.hovered(mouseX, mouseY, tx, y, tw, h);
			boolean sel = i == selected;
			if (hov && !sel) {
				Gfx.roundRect(g, tx + 1, y + 1, tw - 2, h - 2 - (style == Style.UNDERLINE ? 1 : 0), 3, t.hover());
			}
			int col = sel ? (style == Style.UNDERLINE ? t.accent() : t.text()) : t.textDim();
			String s = Gfx.ellipsize(labels.get(i), tw - 6);
			Gfx.text(g, s, tx + (tw - Gfx.width(s)) / 2, y + (h - 8) / 2, col);
		}
		if (style == Style.UNDERLINE) {
			int ux = Math.round(animX) + 4;
			int uw = Math.round(animW) - 8;
			Gfx.roundRect(g, ux, y + h - 2, Math.max(2, uw), 2, 1, t.accent());
		}
	}

	@Override
	public boolean mouseClicked(double mx, double my, int button) {
		if (!enabled || button != 0 || !contains(mx, my)) {
			return false;
		}
		for (int i = 0; i < labels.size(); i++) {
			if (mx >= tabX(i) && mx < tabX(i) + tabW(i)) {
				if (i != selected) {
					selected = i;
					UI.playClick();
					if (onChange != null) {
						onChange.accept(i);
					}
				}
				return true;
			}
		}
		return true;
	}
}
