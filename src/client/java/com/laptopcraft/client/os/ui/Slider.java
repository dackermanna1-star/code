package com.laptopcraft.client.os.ui;

import com.laptopcraft.client.os.Theme;
import com.mojang.blaze3d.platform.cursor.CursorTypes;
import java.util.function.Consumer;
import java.util.function.Function;
import net.minecraft.client.gui.GuiGraphics;
import org.jspecify.annotations.Nullable;
import org.lwjgl.glfw.GLFW;

/**
 * Horizontal slider over a numeric range with optional step, value label and live callback.
 * Drag the knob or click the track; arrow keys / wheel step the value.
 *
 * <pre>{@code
 * Slider vol = new Slider(0, 100, 80, v -> setVolume(v));
 * vol.step = 5;
 * vol.formatter = v -> Math.round(v) + "%";
 * vol.setBounds(10, 30, 140, 12);
 * }</pre>
 */
public class Slider extends Widget {
	public double min;
	public double max;
	public double value;
	/** Snap step (0 = continuous). */
	public double step;
	public @Nullable Consumer<Double> onChange;
	/** Called once when the user releases the knob. */
	public @Nullable Consumer<Double> onRelease;
	/** If set, the formatted value is drawn right of the track. */
	public @Nullable Function<Double, String> formatter;
	private boolean dragging;

	public Slider(double min, double max, double value, @Nullable Consumer<Double> onChange) {
		this.min = min;
		this.max = max;
		this.value = value;
		this.onChange = onChange;
	}

	private int labelWidth() {
		if (formatter == null) {
			return 0;
		}
		return Math.max(Gfx.width(formatter.apply(max)), Gfx.width(formatter.apply(min))) + 6;
	}

	private int trackX() {
		return x + 5;
	}

	private int trackW() {
		return Math.max(4, w - 10 - labelWidth());
	}

	public double fraction() {
		return max <= min ? 0 : (value - min) / (max - min);
	}

	public void setValue(double v) {
		double nv = Math.max(min, Math.min(max, v));
		if (step > 0) {
			nv = min + Math.round((nv - min) / step) * step;
			nv = Math.max(min, Math.min(max, nv));
		}
		if (nv != value) {
			value = nv;
			if (onChange != null) {
				onChange.accept(value);
			}
		}
	}

	@Override
	public void render(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
		Theme t = theme();
		boolean hov = enabled && isHovered(mouseX, mouseY);
		int tx = trackX(), tw = trackW();
		int cy = y + h / 2;
		int fillW = (int) Math.round(tw * fraction());
		int trackCol = t.dark() ? 0xFF4A4E57 : 0xFFC9CED6;
		Gfx.roundRect(g, tx, cy - 2, tw, 4, 2, enabled ? trackCol : Gfx.fade(trackCol, 0.5f));
		Gfx.roundRect(g, tx, cy - 2, Math.max(2, fillW), 4, 2, enabled ? t.accent() : Gfx.fade(t.accent(), 0.5f));
		int ks = hov || dragging ? 10 : 8;
		int kx = tx + fillW - ks / 2;
		Gfx.roundRect(g, kx, cy - ks / 2, ks, ks, 4, 0xFFFFFFFF);
		Gfx.roundBorder(g, kx, cy - ks / 2, ks, ks, 4, dragging ? t.accent() : Gfx.withAlpha(0xFF000000, 0x40));
		if (hov) {
			g.requestCursor(CursorTypes.POINTING_HAND);
		}
		if (formatter != null) {
			Gfx.textRight(g, formatter.apply(value), x + w, y + (h - 8) / 2, t.textDim());
		}
		if (focused) {
			Gfx.roundBorder(g, x, y, w, h, 3, Gfx.withAlpha(t.accent(), 0x80));
		}
	}

	private void setFromMouse(double mx) {
		double f = (mx - trackX()) / Math.max(1.0, trackW());
		setValue(min + Math.max(0, Math.min(1, f)) * (max - min));
	}

	@Override
	public boolean mouseClicked(double mx, double my, int button) {
		if (!enabled || button != 0 || !contains(mx, my)) {
			return false;
		}
		dragging = true;
		setFromMouse(mx);
		return true;
	}

	@Override
	public boolean mouseDragged(double mx, double my, int button, double dx, double dy) {
		if (!dragging) {
			return false;
		}
		setFromMouse(mx);
		return true;
	}

	@Override
	public boolean mouseReleased(double mx, double my, int button) {
		if (!dragging) {
			return false;
		}
		dragging = false;
		if (onRelease != null) {
			onRelease.accept(value);
		}
		return true;
	}

	private double keyStep() {
		return step > 0 ? step : (max - min) / 20.0;
	}

	@Override
	public boolean mouseScrolled(double mx, double my, double amount) {
		if (!enabled) {
			return false;
		}
		setValue(value + Math.signum(amount) * keyStep());
		return true;
	}

	@Override
	public boolean keyPressed(int keyCode, int scanCode, int modifiers) {
		if (!focused || !enabled) {
			return false;
		}
		if (keyCode == GLFW.GLFW_KEY_LEFT || keyCode == GLFW.GLFW_KEY_DOWN) {
			setValue(value - keyStep());
			return true;
		}
		if (keyCode == GLFW.GLFW_KEY_RIGHT || keyCode == GLFW.GLFW_KEY_UP) {
			setValue(value + keyStep());
			return true;
		}
		return false;
	}

	@Override
	public boolean isFocusable() {
		return true;
	}
}
