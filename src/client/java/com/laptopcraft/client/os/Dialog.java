package com.laptopcraft.client.os;

import com.laptopcraft.client.os.ui.Button;
import com.laptopcraft.client.os.ui.Ease;
import com.laptopcraft.client.os.ui.Gfx;
import com.laptopcraft.client.os.ui.TextField;
import com.laptopcraft.client.os.ui.UI;
import com.laptopcraft.client.os.ui.WidgetGroup;
import java.util.List;
import java.util.function.Consumer;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.resources.Identifier;
import org.jspecify.annotations.Nullable;
import org.lwjgl.glfw.GLFW;

/**
 * Modal alert / confirm / prompt dialog. Centered over its host (a window's content area or the
 * whole desktop) which is dimmed. Enter = OK, Esc = cancel. Created through {@code AppContext}.
 */
public final class Dialog {
	public enum Kind {
		ALERT,
		CONFIRM,
		PROMPT
	}

	private final Kind kind;
	private final String title;
	private final String message;
	private final @Nullable Identifier icon;
	private final @Nullable Runnable onOk;
	private final @Nullable Consumer<String> onText;
	private final @Nullable Runnable onCancel;
	private final WidgetGroup ui = new WidgetGroup();
	private final Button ok;
	private final @Nullable Button cancel;
	private final @Nullable TextField field;
	private final long openedAt = Ease.now();
	private boolean done;
	private boolean logo;
	// layout of the last frame (host-local)
	private int bx;
	private int by;
	private int bw;
	private int bh;

	private Dialog(Kind kind, String title, String message, @Nullable Identifier icon, @Nullable Runnable onOk,
			@Nullable Consumer<String> onText, @Nullable Runnable onCancel, String initial, String okLabel, String cancelLabel) {
		this.kind = kind;
		this.title = title;
		this.message = message == null ? "" : message;
		this.icon = icon;
		this.onOk = onOk;
		this.onText = onText;
		this.onCancel = onCancel;
		this.ok = ui.add(new Button(okLabel, this::accept).style(Button.Style.PRIMARY));
		this.cancel = kind == Kind.ALERT ? null : ui.add(new Button(cancelLabel, this::dismiss));
		if (kind == Kind.PROMPT) {
			TextField f = new TextField("");
			f.setText(initial == null ? "" : initial);
			f.selectAll();
			f.onEnter = s -> accept();
			field = ui.add(f);
			ui.setFocus(f);
		} else {
			field = null;
		}
	}

	/** Message box with an OK button. */
	public static Dialog alert(String title, String message) {
		return new Dialog(Kind.ALERT, title, message, Icons.INFO, null, null, null, "", "OK", "");
	}

	/** Message box with a custom icon and OK callback. */
	public static Dialog alert(String title, String message, Identifier icon, @Nullable Runnable onOk) {
		return new Dialog(Kind.ALERT, title, message, icon, onOk, null, null, "", "OK", "");
	}

	/** Yes/No question. */
	public static Dialog confirm(String title, String message, Runnable onYes) {
		return new Dialog(Kind.CONFIRM, title, message, Icons.WARNING, onYes, null, null, "", "Yes", "No");
	}

	/** Confirm with custom button labels and an optional cancel callback. */
	public static Dialog confirm(String title, String message, String yesLabel, String noLabel, Runnable onYes, @Nullable Runnable onNo) {
		return new Dialog(Kind.CONFIRM, title, message, Icons.WARNING, onYes, null, onNo, "", yesLabel, noLabel);
	}

	/** Text input dialog; {@code onOk} gets the trimmed text. */
	public static Dialog prompt(String title, String label, String initial, Consumer<String> onOk) {
		return new Dialog(Kind.PROMPT, title, label, null, null, onOk, null, initial, "OK", "Cancel");
	}

	/** Message box with the CubeOS logo (About dialog). */
	public static Dialog about(String title, String message) {
		Dialog d = new Dialog(Kind.ALERT, title, message, null, null, null, null, "", "OK", "");
		d.logo = true;
		return d;
	}

	/** Makes the OK button red (destructive confirmation). */
	public Dialog danger() {
		ok.style(Button.Style.DANGER);
		return this;
	}

	/** True once answered or dismissed. */
	public boolean isDone() {
		return done;
	}

	/** Dialog kind. */
	public Kind kind() {
		return kind;
	}

	private void accept() {
		if (done) {
			return;
		}
		done = true;
		if (kind == Kind.PROMPT && onText != null && field != null) {
			onText.accept(field.getText().trim());
		} else if (onOk != null) {
			onOk.run();
		}
	}

	/** Cancels the dialog (Esc). */
	public void dismiss() {
		if (done) {
			return;
		}
		done = true;
		if (onCancel != null) {
			onCancel.run();
		}
	}

	/**
	 * Renders the dim overlay over (hx, hy, hw, hh) and the dialog centered in it. Coordinates are in the
	 * current pose space; {@code mouseX/mouseY} in the same space.
	 */
	public void render(GuiGraphics g, int hx, int hy, int hw, int hh, int mouseX, int mouseY) {
		Theme t = UI.theme();
		float a = Ease.outCubic(Ease.progress(openedAt, 140));
		Gfx.rect(g, hx, hy, hw, hh, Gfx.withAlpha(0xFF000000, Math.round(0x70 * a)));
		bw = Math.min(230, hw - 12);
		int textX = logo ? 46 : icon != null ? 30 : 12;
		List<String> lines = Gfx.wrap(message, Math.max(20, bw - textX - 12));
		int lineCount = Math.min(lines.size(), 12);
		int msgH = Math.max(lineCount * 10, logo ? 34 : icon != null ? 18 : 0);
		bh = 26 + msgH + (field != null ? 26 : 0) + 12 + 26;
		bh = Math.min(bh, hh - 8);
		bx = hx + (hw - bw) / 2;
		by = hy + (hh - bh) / 2 + Math.round((1f - a) * 6);
		Gfx.shadow(g, bx, by, bw, bh, 8, Math.round(0x60 * a));
		Gfx.panel(g, bx, by, bw, bh, 5, t.surface(), t.border());
		Gfx.textClipped(g, title, bx + 12, by + 10, bw - 24, t.text());
		int my = by + 26;
		if (logo) {
			CubeLogo.draw(g, bx + 10, my, 28, 0xFFFFFFFF);
		} else if (icon != null) {
			Gfx.icon(g, icon, bx + 10, my - 1, 16);
		}
		for (int i = 0; i < lineCount; i++) {
			Gfx.text(g, lines.get(i), bx + textX, my + i * 10, t.textDim());
		}
		int fy = my + msgH + 4;
		if (field != null) {
			field.setBounds(bx + 12, fy, bw - 24, 18);
		}
		int btnY = by + bh - 25;
		Gfx.rect(g, bx + 1, btnY - 6, bw - 2, 1, Gfx.withAlpha(t.border(), 0x80));
		Gfx.roundRect(g, bx + 1, btnY - 5, bw - 2, bh - (btnY - 5 - by) - 1, 4, t.dark() ? 0x22000000 : 0x0A000000, Gfx.BOTTOM);
		int okW = Math.max(56, ok.preferredWidth());
		ok.setBounds(bx + bw - 10 - okW, btnY, okW, 18);
		if (cancel != null) {
			int cw = Math.max(56, cancel.preferredWidth());
			cancel.setBounds(ok.x - 6 - cw, btnY, cw, 18);
		}
		ui.render(g, mouseX, mouseY, 0);
	}

	/** True if the point is inside the dialog box (last layout). */
	public boolean containsBox(double mx, double my) {
		return Gfx.hovered(mx, my, bx, by, bw, bh);
	}

	/** Input in host coordinates (always consumed: the dialog is modal). */
	public boolean mouseClicked(double mx, double my, int button) {
		ui.mouseClicked(mx, my, button);
		return true;
	}

	/** See {@link #mouseClicked}. */
	public boolean mouseReleased(double mx, double my, int button) {
		ui.mouseReleased(mx, my, button);
		return true;
	}

	/** See {@link #mouseClicked}. */
	public boolean mouseDragged(double mx, double my, int button, double dx, double dy) {
		ui.mouseDragged(mx, my, button, dx, dy);
		return true;
	}

	/** Enter = OK, Esc = cancel; other keys go to the text field. */
	public boolean keyPressed(int key, int scan, int mods) {
		if (key == GLFW.GLFW_KEY_ESCAPE) {
			if (kind == Kind.ALERT) {
				accept();
			} else {
				dismiss();
			}
			return true;
		}
		if (key == GLFW.GLFW_KEY_ENTER || key == GLFW.GLFW_KEY_KP_ENTER) {
			if (ui.focused() == cancel && cancel != null) {
				dismiss();
			} else {
				accept();
			}
			return true;
		}
		ui.keyPressed(key, scan, mods);
		return true;
	}

	/** Typed characters go to the text field. */
	public boolean charTyped(int cp, int mods) {
		ui.charTyped(cp, mods);
		return true;
	}
}
