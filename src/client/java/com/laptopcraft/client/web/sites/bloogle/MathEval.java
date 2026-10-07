package com.laptopcraft.client.web.sites.bloogle;

import java.math.BigDecimal;
import java.math.MathContext;
import java.math.RoundingMode;
import org.jspecify.annotations.Nullable;

/**
 * Tiny recursive-descent calculator: + - * / % ^, parentheses, unary minus, sqrt, sin, cos, tan
 * (degrees), ln, log, pi, e. Shared by Bloogle and the Calculator app.
 */
public final class MathEval {
	private final String s;
	private int pos;

	private MathEval(String s) {
		this.s = s.replace(" ", "").replace("×", "*").replace("÷", "/").replace("π", "pi").replace("√", "sqrt");
	}

	/** Evaluates or returns null if the text isn't a valid expression. */
	public static @Nullable Double tryEval(String text) {
		if (text == null || text.isBlank() || !text.matches("[0-9a-z+\\-*/%^().,×÷π√ ]+")) {
			return null;
		}
		try {
			MathEval m = new MathEval(text.replace(',', '.'));
			double v = m.expr();
			if (m.pos != m.s.length() || Double.isNaN(v)) {
				return null;
			}
			return v;
		} catch (RuntimeException e) {
			return null;
		}
	}

	/** Pretty number without floating-point noise. */
	public static String format(double v) {
		if (Double.isInfinite(v)) {
			return v > 0 ? "∞" : "-∞";
		}
		BigDecimal d = new BigDecimal(v).round(new MathContext(12, RoundingMode.HALF_UP)).stripTrailingZeros();
		String out = d.abs().compareTo(new BigDecimal("1e12")) >= 0 || (d.abs().compareTo(new BigDecimal("1e-6")) < 0 && d.signum() != 0)
				? String.format("%.6e", v) : d.toPlainString();
		return out.equals("-0") ? "0" : out;
	}

	private double expr() {
		double v = term();
		while (pos < s.length()) {
			char c = s.charAt(pos);
			if (c == '+') {
				pos++;
				v += term();
			} else if (c == '-') {
				pos++;
				v -= term();
			} else {
				break;
			}
		}
		return v;
	}

	private double term() {
		double v = power();
		while (pos < s.length()) {
			char c = s.charAt(pos);
			if (c == '*') {
				pos++;
				v *= power();
			} else if (c == '/') {
				pos++;
				double d = power();
				if (d == 0) {
					throw new ArithmeticException("division by zero");
				}
				v /= d;
			} else if (c == '%') {
				pos++;
				v %= power();
			} else if (c == '(' || Character.isLetter(c)) {
				v *= power();
			} else {
				break;
			}
		}
		return v;
	}

	private double power() {
		double base = unary();
		if (pos < s.length() && s.charAt(pos) == '^') {
			pos++;
			return Math.pow(base, power());
		}
		return base;
	}

	private double unary() {
		if (pos < s.length() && s.charAt(pos) == '-') {
			pos++;
			return -unary();
		}
		if (pos < s.length() && s.charAt(pos) == '+') {
			pos++;
			return unary();
		}
		return atom();
	}

	private double atom() {
		if (pos >= s.length()) {
			throw new IllegalStateException("eof");
		}
		char c = s.charAt(pos);
		if (c == '(') {
			pos++;
			double v = expr();
			expect(')');
			return v;
		}
		if (Character.isDigit(c) || c == '.') {
			int start = pos;
			while (pos < s.length() && (Character.isDigit(s.charAt(pos)) || s.charAt(pos) == '.')) {
				pos++;
			}
			return Double.parseDouble(s.substring(start, pos));
		}
		if (Character.isLetter(c)) {
			int start = pos;
			while (pos < s.length() && Character.isLetter(s.charAt(pos))) {
				pos++;
			}
			String name = s.substring(start, pos);
			switch (name) {
				case "pi" -> {
					return Math.PI;
				}
				case "e" -> {
					return Math.E;
				}
				default -> {
				}
			}
			double arg = atom();
			return switch (name) {
				case "sqrt" -> Math.sqrt(arg);
				case "sin" -> Math.sin(Math.toRadians(arg));
				case "cos" -> Math.cos(Math.toRadians(arg));
				case "tan" -> Math.tan(Math.toRadians(arg));
				case "ln" -> Math.log(arg);
				case "log" -> Math.log10(arg);
				case "abs" -> Math.abs(arg);
				default -> throw new IllegalStateException("unknown function " + name);
			};
		}
		throw new IllegalStateException("unexpected " + c);
	}

	private void expect(char c) {
		if (pos >= s.length() || s.charAt(pos) != c) {
			throw new IllegalStateException("expected " + c);
		}
		pos++;
	}
}
