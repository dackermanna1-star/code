package com.laptopcraft.client.os.ui;

import com.laptopcraft.client.os.Theme;
import com.mojang.blaze3d.platform.cursor.CursorTypes;
import java.util.function.Consumer;
import net.minecraft.client.gui.GuiGraphics;
import org.jspecify.annotations.Nullable;
import org.lwjgl.glfw.GLFW;

/**
 * Animated on/off switch with an optional label on the left (the switch sits at the right edge
 * of the bounds when a label is set). Typical size: 24×12 for the bare switch.
 *
 * <pre>{@code
 * Toggle sounds = new Toggle("Sound effects", data.getBool("sounds", true), on -> data.setBool("sounds", on));
 * sounds.setBounds(12, 40, 200, 14);
 * }</pre>
 */
public class Toggle extends Widget {
	public String label;
	public boolean value;
	public @Nullable Consumer<Boolean> onChange;
	private float anim;
	private long last = -1;

	/** Labeled switch (label left, switch at the right edge). */
	public Toggle(String label, boolean value, @Nullable Consumer<Boolean> onChange) {
		this.label = label;
		this.value = value;
		this.onChange = onChange;
		this.anim = value ? 1f : 0f;
	}

	/** Bare switch (about 22×12). */
	public Toggle(boolean value, @Nullable Consumer<Boolean> onChange) {
		this("", value, onChange);
	}

	/** Sets the state without calling onChange. */
	public void setValue(boolean v) {
		this.value = v;
	}

	@Override
	public void render(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
		Theme t = theme();
		long now = Ease.now();
		float dt = last < 0 ? 1f : Math.min(0.1f, (now - last) / 1000f);
		last = now;
		anim = Ease.approach(anim, value ? 1f : 0f, dt * 14f);
		boolean hov = enabled && isHovered(mouseX, mouseY);
		int sw = 22, sh = 12;
		int sx = label.isEmpty() ? x : x + w - sw;
		int sy = y + (h - sh) / 2;
		if (!label.isEmpty()) {
			Gfx.textClipped(g, label, x, y + (h - 8) / 2, w - sw - 6, enabled ? t.text() : t.textDim());
		}
		int off = t.dark() ? 0xFF4A4E57 : 0xFFC4C9D1;
		int track = Gfx.lerp(off, t.accent(), Ease.smoothstep(anim));
		if (!enabled) {
			track = Gfx.fade(track, 0.5f);
		}
		Gfx.roundRect(g, sx, sy, sw, sh, 5, track);
		if (hov) {
			Gfx.roundRect(g, sx, sy, sw, sh, 5, 0x18FFFFFF);
			g.requestCursor(CursorTypes.POINTING_HAND);
		}
		int knob = sh - 4;
		int kx = sx + 2 + Math.round((sw - knob - 4) * Ease.inOutCubic(anim));
		Gfx.roundRect(g, kx, sy + 2, knob, knob, 3, enabled ? 0xFFFFFFFF : 0xFFDDDDDD);
		if (focused) {
			Gfx.roundBorder(g, sx - 1, sy - 1, sw + 2, sh + 2, 5, Gfx.withAlpha(t.accent(), 0xAA));
		}
	}

	private void flip() {
		value = !value;
		UI.playClick();
		if (onChange != null) {
			onChange.accept(value);
		}
	}

	@Override
	public boolean mouseClicked(double mx, double my, int button) {
		if (!enabled || button != 0 || !contains(mx, my)) {
			return false;
		}
		flip();
		return true;
	}

	@Override
	public boolean keyPressed(int keyCode, int scanCode, int modifiers) {
		if (focused && enabled && (keyCode == GLFW.GLFW_KEY_SPACE || keyCode == GLFW.GLFW_KEY_ENTER)) {
			flip();
			return true;
		}
		return false;
	}

	@Override
	public boolean isFocusable() {
		return true;
	}
}
