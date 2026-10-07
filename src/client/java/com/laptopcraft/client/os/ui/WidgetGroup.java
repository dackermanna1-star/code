package com.laptopcraft.client.os.ui;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import net.minecraft.client.gui.GuiGraphics;
import org.jspecify.annotations.Nullable;
import org.lwjgl.glfw.GLFW;

/**
 * A simple container that renders widgets and routes events to them: clicks go to the top-most
 * widget under the mouse (it also receives the following drags and the release), keys and chars
 * go to the focused widget, Tab / Shift+Tab cycle focus between focusable widgets.
 *
 * <pre>{@code
 * private final WidgetGroup ui = new WidgetGroup();
 * public void init() {
 *     ui.add(new Button("Save", this::save)).setBounds(8, 8, 60, 16);
 * }
 * public void render(GuiGraphics g, int w, int h, int mx, int my, float pt) { ui.render(g, mx, my, pt); }
 * public boolean mouseClicked(double x, double y, int b) { return ui.mouseClicked(x, y, b); }
 * // ... mouseReleased / mouseDragged / mouseScrolled / keyPressed / charTyped / tick the same way
 * }</pre>
 */
public class WidgetGroup {
	private final List<Widget> widgets = new ArrayList<>();
	private @Nullable Widget focused;
	private @Nullable Widget pressed;

	/** Adds a widget (rendered after the ones added before, i.e. on top). */
	public <T extends Widget> T add(T widget) {
		widgets.add(widget);
		return widget;
	}

	/** Removes a widget. */
	public void remove(Widget widget) {
		widgets.remove(widget);
		if (focused == widget) {
			focused = null;
		}
		if (pressed == widget) {
			pressed = null;
		}
	}

	/** Removes all widgets. */
	public void clear() {
		widgets.clear();
		focused = null;
		pressed = null;
	}

	/** The widgets in render order (read-only). */
	public List<Widget> widgets() {
		return Collections.unmodifiableList(widgets);
	}

	/** The focused widget, or null. */
	public @Nullable Widget focused() {
		return focused;
	}

	/** Focuses {@code widget} (or clears focus with null). */
	public void setFocus(@Nullable Widget widget) {
		if (focused == widget) {
			return;
		}
		if (focused != null) {
			focused.setFocused(false);
		}
		focused = widget;
		if (widget != null) {
			widget.setFocused(true);
		}
	}

	/** Renders all widgets, then overlays (open dropdowns), then tooltips. */
	public void render(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
		Widget top = topAt(mouseX, mouseY);
		for (Widget w : widgets) {
			if (w.visible) {
				boolean hoverable = w == top;
				w.render(g, hoverable ? mouseX : Integer.MIN_VALUE / 2, hoverable ? mouseY : Integer.MIN_VALUE / 2, partialTick);
			}
		}
		for (Widget w : widgets) {
			if (w.visible) {
				w.renderOverlay(g, mouseX, mouseY, partialTick);
			}
		}
		for (Widget w : widgets) {
			if (w.visible) {
				boolean hoverable = w == top;
				w.renderTooltip(g, hoverable ? mouseX : Integer.MIN_VALUE / 2, hoverable ? mouseY : Integer.MIN_VALUE / 2);
			}
		}
	}

	private @Nullable Widget topAt(double mx, double my) {
		for (int i = widgets.size() - 1; i >= 0; i--) {
			if (widgets.get(i).visible && widgets.get(i).capturesOverlay(mx, my)) {
				return null;
			}
		}
		for (int i = widgets.size() - 1; i >= 0; i--) {
			Widget w = widgets.get(i);
			if (w.visible && w.contains(mx, my)) {
				return w;
			}
		}
		return null;
	}

	/** Routes a click (focus + capture). Returns true if a widget was hit. */
	public boolean mouseClicked(double mx, double my, int button) {
		// An open dropdown list may extend outside its own bounds: give it the first chance.
		for (int i = widgets.size() - 1; i >= 0; i--) {
			Widget w = widgets.get(i);
			if (w.visible && w.hasOverlay()) {
				pressed = w;
				if (w.mouseClicked(mx, my, button)) {
					return true;
				}
				pressed = null;
			}
		}
		Widget hit = topAt(mx, my);
		if (hit == null) {
			setFocus(null);
			pressed = null;
			return false;
		}
		if (hit.isFocusable() && hit.enabled) {
			setFocus(hit);
		} else if (focused != null && focused != hit) {
			setFocus(null);
		}
		pressed = hit;
		if (hit.enabled) {
			hit.mouseClicked(mx, my, button);
		}
		return true;
	}

	/** Releases the captured widget. */
	public boolean mouseReleased(double mx, double my, int button) {
		Widget p = pressed;
		pressed = null;
		return p != null && p.visible && p.mouseReleased(mx, my, button);
	}

	/** Drag goes to the widget that received the press. */
	public boolean mouseDragged(double mx, double my, int button, double dx, double dy) {
		return pressed != null && pressed.visible && pressed.enabled && pressed.mouseDragged(mx, my, button, dx, dy);
	}

	/** Wheel goes to the top-most widget under the mouse. */
	public boolean mouseScrolled(double mx, double my, double amount) {
		for (int i = widgets.size() - 1; i >= 0; i--) {
			Widget w = widgets.get(i);
			if (w.visible && w.hasOverlay() && w.mouseScrolled(mx, my, amount)) {
				return true;
			}
		}
		for (int i = widgets.size() - 1; i >= 0; i--) {
			Widget w = widgets.get(i);
			if (w.visible && w.enabled && w.contains(mx, my) && w.mouseScrolled(mx, my, amount)) {
				return true;
			}
		}
		return false;
	}

	/** Esc closes open overlays; keys go to the focused widget; Tab cycles focus. */
	public boolean keyPressed(int keyCode, int scanCode, int modifiers) {
		if (keyCode == GLFW.GLFW_KEY_ESCAPE) {
			for (Widget w : widgets) {
				if (w.visible && w.hasOverlay() && w.closeOverlay()) {
					return true;
				}
			}
		}
		if (focused != null && focused.visible && focused.enabled && focused.keyPressed(keyCode, scanCode, modifiers)) {
			return true;
		}
		if (keyCode == GLFW.GLFW_KEY_TAB) {
			return cycleFocus(!UI.hasShift(modifiers));
		}
		return false;
	}

	/** Characters go to the focused widget. */
	public boolean charTyped(int codePoint, int modifiers) {
		return focused != null && focused.visible && focused.enabled && focused.charTyped(codePoint, modifiers);
	}

	/** Ticks all widgets. */
	public void tick() {
		for (Widget w : widgets) {
			w.tick();
		}
	}

	/** Moves focus to the next/previous focusable widget. Returns false if there is none. */
	public boolean cycleFocus(boolean forward) {
		List<Widget> focusable = new ArrayList<>();
		for (Widget w : widgets) {
			if (w.visible && w.enabled && w.isFocusable()) {
				focusable.add(w);
			}
		}
		if (focusable.isEmpty()) {
			return false;
		}
		int idx = focused == null ? -1 : focusable.indexOf(focused);
		int next = idx < 0 ? (forward ? 0 : focusable.size() - 1) : Math.floorMod(idx + (forward ? 1 : -1), focusable.size());
		setFocus(focusable.get(next));
		return true;
	}
}
