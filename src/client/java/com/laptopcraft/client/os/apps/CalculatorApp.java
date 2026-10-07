package com.laptopcraft.client.os.apps;

import com.laptopcraft.client.os.Theme;
import com.laptopcraft.client.os.apps.kit.KitApp;
import com.laptopcraft.client.os.ui.Ease;
import com.laptopcraft.client.os.ui.Gfx;
import com.laptopcraft.client.os.ui.UI;
import com.laptopcraft.client.web.sites.bloogle.MathEval;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.client.gui.GuiGraphics;
import org.lwjgl.glfw.GLFW;

/** CubeOS Calculator: standard + scientific modes, keyboard input, memory and history. */
public class CalculatorApp extends KitApp {
	private static final String[][] STANDARD = {
			{"MC", "MR", "M+", "M-"},
			{"C", "(", ")", "÷"},
			{"7", "8", "9", "×"},
			{"4", "5", "6", "-"},
			{"1", "2", "3", "+"},
			{"±", "0", ".", "="}};
	private static final String[][] SCIENTIFIC = {
			{"sin", "cos", "tan", "π"},
			{"√", "x²", "^", "1/x"},
			{"ln", "log", "%", "⌫"}};
	private String expr = "";
	private String result = "0";
	private boolean error;
	private boolean scientific;
	private double memory;
	private final List<String> history = new ArrayList<>();
	private long flashAt;
	private String flashKey = "";

	@Override
	public void init() {
		scientific = ctx.appState().getBooleanOr("scientific", false);
	}

	@Override
	protected void draw(GuiGraphics g, int w, int h, float pt) {
		Theme t = t();
		Gfx.rect(g, 0, 0, w, h, t.bg());
		// mode switch
		String mode = scientific ? "Scientific" : "Standard";
		boolean mh = region(g, 4, 3, Gfx.width(mode) + 16, 12, () -> {
			scientific = !scientific;
			ctx.appState().putBoolean("scientific", scientific);
			ctx.saveAppState();
		});
		Gfx.text(g, "☰ " + mode, 6, 5, mh ? t.accent() : t.textDim());
		if (memory != 0) {
			Gfx.textRight(g, "M", w - 6, 5, t.accent());
		}
		// display
		int dh = 40;
		Gfx.roundRect(g, 4, 17, w - 8, dh, 4, t.surface());
		Gfx.textRight(g, Gfx.ellipsize(expr.isEmpty() ? " " : expr, w - 20), w - 10, 21, t.textDim());
		String r = result;
		float scale = Gfx.width(r) * 2 + 20 < w ? 2f : 1f;
		int rw = (int) (Gfx.width(r) * scale);
		Gfx.textScaled(g, r, w - 10 - rw, 34, scale, error ? t.danger() : t.text());
		int y = 17 + dh + 4;
		int rows = STANDARD.length + (scientific ? SCIENTIFIC.length : 0);
		int bh = Math.max(12, (h - y - 4) / rows - 3);
		int bw = (w - 8 - 9) / 4;
		List<String[]> all = new ArrayList<>();
		if (scientific) {
			all.addAll(List.of(SCIENTIFIC));
		}
		all.addAll(List.of(STANDARD));
		for (String[] row : all) {
			for (int c = 0; c < 4; c++) {
				String k = row[c];
				int x = 4 + c * (bw + 3);
				boolean op = "÷×-+".contains(k) && k.length() == 1;
				boolean eq = k.equals("=");
				boolean fn = !Character.isDigit(k.charAt(0)) && !k.equals(".") && !op && !eq;
				boolean hov = region(g, x, y, bw, bh, () -> press(k));
				boolean flash = k.equals(flashKey) && Ease.now() - flashAt < 120;
				int bg = eq ? t.accent() : op ? Gfx.lerp(t.surface(), t.accent(), 0.25f) : fn ? t.surfaceAlt() : t.surface();
				if (hov || flash) {
					bg = Gfx.lighten(bg, flash ? 0.25f : 0.1f);
				}
				Gfx.roundRect(g, x, y, bw, bh, 4, bg);
				Gfx.textCentered(g, k, x + bw / 2, y + (bh - 8) / 2, eq ? t.accentText() : t.text());
			}
			y += bh + 3;
		}
	}

	private void press(String k) {
		flashKey = k;
		flashAt = Ease.now();
		if (error) {
			error = false;
			result = "0";
		}
		switch (k) {
			case "C" -> {
				expr = "";
				result = "0";
			}
			case "⌫" -> expr = expr.isEmpty() ? "" : expr.substring(0, expr.length() - 1);
			case "=" -> evaluate(true);
			case "±" -> expr = expr.startsWith("-(") && expr.endsWith(")") ? expr.substring(2, expr.length() - 1) : expr.isEmpty() ? "-" : "-(" + expr + ")";
			case "x²" -> expr = "(" + (expr.isEmpty() ? result : expr) + ")^2";
			case "1/x" -> expr = "1/(" + (expr.isEmpty() ? result : expr) + ")";
			case "√" -> expr += "√(";
			case "sin", "cos", "tan", "ln", "log" -> expr += k + "(";
			case "MC" -> memory = 0;
			case "MR" -> expr += MathEval.format(memory);
			case "M+" -> memory += currentValue();
			case "M-" -> memory -= currentValue();
			default -> expr += k;
		}
		if (!k.equals("=") && !k.equals("C")) {
			Double v = MathEval.tryEval(expr);
			if (v != null) {
				result = MathEval.format(v);
			}
		}
	}

	private double currentValue() {
		Double v = MathEval.tryEval(expr);
		if (v != null) {
			return v;
		}
		try {
			return Double.parseDouble(result);
		} catch (NumberFormatException e) {
			return 0;
		}
	}

	private void evaluate(boolean commit) {
		if (expr.isEmpty()) {
			return;
		}
		Double v = MathEval.tryEval(expr);
		if (v == null) {
			result = expr.contains("/0") ? "Cannot divide by zero" : "Error";
			error = true;
			return;
		}
		result = MathEval.format(v);
		if (commit) {
			history.add(0, expr + " = " + result);
			if (result.equals("42")) {
				ctx.notify("info", "The answer", "…to life, the Overworld and everything.");
			}
			expr = result;
		}
	}

	@Override
	public boolean charTyped(int cp, int mods) {
		String c = new String(Character.toChars(cp));
		if ("0123456789.()+-%^".contains(c)) {
			press(c);
			return true;
		}
		if (c.equals("*") || c.equalsIgnoreCase("x")) {
			press("×");
			return true;
		}
		if (c.equals("/")) {
			press("÷");
			return true;
		}
		if (c.equals("=")) {
			press("=");
			return true;
		}
		return false;
	}

	@Override
	public boolean keyPressed(int key, int scan, int mods) {
		switch (key) {
			case GLFW.GLFW_KEY_ENTER, GLFW.GLFW_KEY_KP_ENTER -> press("=");
			case GLFW.GLFW_KEY_BACKSPACE -> press("⌫");
			case GLFW.GLFW_KEY_DELETE -> press("C");
			case GLFW.GLFW_KEY_C -> {
				if (UI.hasCtrl(mods)) {
					UI.setClipboard(result);
					ctx.notify("info", "Copied", result);
				} else {
					return false;
				}
			}
			default -> {
				return false;
			}
		}
		return true;
	}
}
