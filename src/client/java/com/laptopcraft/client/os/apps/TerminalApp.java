package com.laptopcraft.client.os.apps;

import com.laptopcraft.account.Order;
import com.laptopcraft.client.os.App;
import com.laptopcraft.client.os.AppInfo;
import com.laptopcraft.client.os.AppRegistry;
import com.laptopcraft.client.os.OSData;
import com.laptopcraft.client.os.ui.Ease;
import com.laptopcraft.client.os.ui.Gfx;
import com.laptopcraft.client.os.ui.ScrollState;
import com.laptopcraft.client.os.ui.UI;
import com.laptopcraft.client.web.kit.Kit;
import com.laptopcraft.client.web.sites.bloogle.MathEval;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.player.LocalPlayer;
import org.lwjgl.glfw.GLFW;

/** cubesh — the CubeOS terminal, with real commands over your files, account and world. */
public class TerminalApp extends App {
	private static final int BG = 0xFF0C0F14, FG = 0xFFD7DDE5, DIM = 0xFF7D8590, GREEN = 0xFF56D364, BLUE = 0xFF58A6FF, YELLOW = 0xFFE3B341,
			RED = 0xFFFF7B72, PURPLE = 0xFFD2A8FF, CYAN = 0xFF39C5CF;
	private static final String[] FORTUNES = {"Never dig straight down.", "A creeper's hug is short but memorable.", "Diamonds are found at Y=-59. Friends are found everywhere.",
			"The cake is not a lie. It's in the Ender Eats menu.", "Endermen hate eye contact. So do introverts.", "There's always room for one more chest.",
			"An iron golem a day keeps the zombies away.", "Beds explode in the Nether. Plan accordingly."};
	private static final String[] COMMANDS = {"help", "ls", "cat", "touch", "rm", "mv", "cp", "echo", "clear", "date", "whoami", "hostname", "uname", "neofetch",
			"balance", "orders", "mail", "open", "browse", "calc", "pos", "biome", "weather", "fortune", "creepersay", "matrix", "history", "exit"};

	private record Line(String text, int color) {
	}

	/** Marker line: the CubeOS logo is drawn at its position. */
	private static final String LOGO = "\u0000logo";
	/** Prefix for lines indented to the right of the logo. */
	private static final String INDENT = "\u0001";
	private static final int[] PALETTE = {0xFF0C0F14, RED, GREEN, YELLOW, BLUE, PURPLE, CYAN, FG};

	private final List<Line> lines = new ArrayList<>();
	private final List<String> history = new ArrayList<>();
	private final ScrollState scroll = new ScrollState();
	private String input = "";
	private int cursor;
	private int histIdx = -1;
	private long matrixUntil;
	private boolean stick = true;

	@Override
	public void init() {
		println("CubeOS 21.11 'Copper Golem' — cubesh 1.0", CYAN);
		println("Type 'help' to see what I can do. Try 'neofetch'.", DIM);
		println("", FG);
	}

	private String prompt() {
		return ctx.username().toLowerCase(Locale.ROOT).replace(' ', '_') + "@cubebook:~$ ";
	}

	private void println(String s, int color) {
		for (String part : s.split("\n", -1)) {
			lines.add(new Line(part, color));
		}
		while (lines.size() > 400) {
			lines.remove(0);
		}
		stick = true;
	}

	@Override
	public void render(GuiGraphics g, int w, int h, int mouseX, int mouseY, float pt) {
		Gfx.rect(g, 0, 0, w, h, BG);
		if (Ease.now() < matrixUntil) {
			matrix(g, w, h);
			return;
		}
		int lh = 10;
		List<String> wrappedInput = Gfx.wrap(prompt() + input, w - 14);
		int total = (lines.size() + wrappedInput.size()) * lh + 8;
		scroll.setContent(total, h);
		if (stick) {
			scroll.scrollTo(scroll.maxOffset());
			stick = false;
		}
		int y = 4 - scroll.offset();
		for (Line l : lines) {
			if (l.text.equals(LOGO)) {
				if (y > -100 && y < h) {
					Gfx.icon(g, com.laptopcraft.client.os.Icons.LOGO, 10, y + 4, 96);
				}
				continue;
			}
			if (y > -lh && y < h) {
				if (l.text.startsWith(INDENT)) {
					String s = l.text.substring(1);
					if (l.color == -1) {
						for (int i = 0; i < PALETTE.length; i++) {
							Gfx.rect(g, 120 + i * 10, y, 10, 8, PALETTE[i]);
						}
					} else {
						Gfx.textClipped(g, s, 120, y, w - 128, l.color);
					}
				} else {
					Gfx.textClipped(g, l.text, 6, y, w - 14, l.color);
				}
			}
			y += lh;
		}
		// prompt line with cursor
		String p = prompt();
		Gfx.text(g, p, 6, y, GREEN);
		int px = 6 + Gfx.width(p);
		String visible = input;
		Gfx.textClipped(g, visible, px, y, w - px - 8, FG);
		if (ctx.isFocused() && Ease.blink(1000)) {
			int cx = px + Gfx.width(input.substring(0, Math.min(cursor, input.length())));
			Gfx.rect(g, Math.min(cx, w - 10), y - 1, 5, 9, 0xAAD7DDE5);
		}
		scroll.renderScrollbar(g, w - 7, 0, h, mouseX, mouseY);
	}

	private void matrix(GuiGraphics g, int w, int h) {
		long t = Ease.now() / 70;
		for (int col = 0; col < w / 7; col++) {
			int speed = 1 + (int) (Kit.rand("mx", col) * 3);
			int head = (int) ((t * speed + Kit.rand("off", col) * 200) % (h / 9 + 20));
			for (int k = 0; k < 14; k++) {
				int row = head - k;
				if (row < 0 || row * 9 > h) {
					continue;
				}
				char c = (char) ('0' + (int) (Kit.rand("ch", (int) (col * 977 + row + t / 3)) * 42));
				int alpha = 255 - k * 18;
				Gfx.text(g, String.valueOf(c), col * 7 + 2, row * 9, Gfx.withAlpha(k == 0 ? 0xFFCCFFCC : GREEN, Math.max(30, alpha)));
			}
		}
		Gfx.textCentered(g, "[ press any key ]", w / 2, h - 12, 0xAAFFFFFF);
	}

	@Override
	public boolean charTyped(int cp, int mods) {
		if (Ease.now() < matrixUntil) {
			matrixUntil = 0;
			return true;
		}
		if (cp < 32 || input.length() >= 200) {
			return false;
		}
		String c = new String(Character.toChars(cp));
		input = input.substring(0, cursor) + c + input.substring(cursor);
		cursor += c.length();
		stick = true;
		return true;
	}

	@Override
	public boolean keyPressed(int key, int scan, int mods) {
		if (Ease.now() < matrixUntil) {
			matrixUntil = 0;
			return true;
		}
		boolean ctrl = UI.hasCtrl(mods);
		switch (key) {
			case GLFW.GLFW_KEY_ENTER, GLFW.GLFW_KEY_KP_ENTER -> {
				String cmd = input;
				println(prompt() + cmd, FG);
				input = "";
				cursor = 0;
				histIdx = -1;
				if (!cmd.isBlank()) {
					history.add(cmd);
					run(cmd.trim());
				}
			}
			case GLFW.GLFW_KEY_BACKSPACE -> {
				if (cursor > 0) {
					input = input.substring(0, cursor - 1) + input.substring(cursor);
					cursor--;
				}
			}
			case GLFW.GLFW_KEY_DELETE -> {
				if (cursor < input.length()) {
					input = input.substring(0, cursor) + input.substring(cursor + 1);
				}
			}
			case GLFW.GLFW_KEY_LEFT -> cursor = Math.max(0, cursor - 1);
			case GLFW.GLFW_KEY_RIGHT -> cursor = Math.min(input.length(), cursor + 1);
			case GLFW.GLFW_KEY_HOME -> cursor = 0;
			case GLFW.GLFW_KEY_END -> cursor = input.length();
			case GLFW.GLFW_KEY_UP -> {
				if (!history.isEmpty()) {
					histIdx = histIdx < 0 ? history.size() - 1 : Math.max(0, histIdx - 1);
					input = history.get(histIdx);
					cursor = input.length();
				}
			}
			case GLFW.GLFW_KEY_DOWN -> {
				if (histIdx >= 0) {
					histIdx++;
					input = histIdx >= history.size() ? "" : history.get(histIdx);
					if (histIdx >= history.size()) {
						histIdx = -1;
					}
					cursor = input.length();
				}
			}
			case GLFW.GLFW_KEY_TAB -> complete();
			case GLFW.GLFW_KEY_L -> {
				if (!ctrl) {
					return false;
				}
				lines.clear();
			}
			case GLFW.GLFW_KEY_C -> {
				if (!ctrl) {
					return false;
				}
				println(prompt() + input + "^C", FG);
				input = "";
				cursor = 0;
			}
			case GLFW.GLFW_KEY_V -> {
				if (!ctrl) {
					return false;
				}
				String clip = UI.sanitize(UI.getClipboard(), false);
				input = input.substring(0, cursor) + clip + input.substring(cursor);
				cursor += clip.length();
			}
			default -> {
				return false;
			}
		}
		stick = true;
		return true;
	}

	private void complete() {
		String[] parts = input.split(" ", -1);
		String last = parts[parts.length - 1];
		List<String> options = new ArrayList<>();
		if (parts.length == 1) {
			for (String c : COMMANDS) {
				if (c.startsWith(last)) {
					options.add(c);
				}
			}
		} else if (parts[0].equals("open")) {
			for (AppInfo a : AppRegistry.all()) {
				if (a.id().startsWith(last)) {
					options.add(a.id());
				}
			}
		} else {
			for (OSData.FileEntry f : ctx.data().listFiles()) {
				if (f.name().startsWith(last)) {
					options.add(f.name().contains(" ") ? "\"" + f.name() + "\"" : f.name());
				}
			}
		}
		if (options.size() == 1) {
			parts[parts.length - 1] = options.get(0);
			input = String.join(" ", parts) + (parts.length == 1 ? " " : "");
			cursor = input.length();
		} else if (options.size() > 1) {
			println(prompt() + input, FG);
			println(String.join("  ", options), BLUE);
		}
	}

	/** Splits on spaces, honoring "quoted names". */
	private static List<String> args(String s) {
		List<String> out = new ArrayList<>();
		StringBuilder cur = new StringBuilder();
		boolean q = false;
		for (char c : s.toCharArray()) {
			if (c == '"') {
				q = !q;
			} else if (c == ' ' && !q) {
				if (!cur.isEmpty()) {
					out.add(cur.toString());
					cur.setLength(0);
				}
			} else {
				cur.append(c);
			}
		}
		if (!cur.isEmpty()) {
			out.add(cur.toString());
		}
		return out;
	}

	private void run(String line) {
		List<String> a = args(line);
		if (a.isEmpty()) {
			return;
		}
		String cmd = a.get(0).toLowerCase(Locale.ROOT);
		String rest = line.substring(Math.min(line.length(), a.get(0).length())).trim();
		OSData d = ctx.data();
		LocalPlayer player = ctx.mc().player;
		ClientLevel level = ctx.mc().level;
		switch (cmd) {
			case "help" -> {
				println("Available commands:", YELLOW);
				println("  ls, cat <f>, touch <f>, rm <f>, mv <a> <b>, cp <a> <b>, echo <text> [> file]", FG);
				println("  date, whoami, hostname, uname -a, neofetch, clear, history, exit", FG);
				println("  balance, orders, mail, open <app>, browse <url>, calc <expr>", FG);
				println("  pos, biome, weather, fortune, creepersay <text>, matrix", FG);
				println("Tab completes, ↑/↓ browse history, Ctrl+L clears.", DIM);
			}
			case "ls" -> {
				List<OSData.FileEntry> files = d.listFiles();
				if (files.isEmpty()) {
					println("(empty — try: echo hello > hello.txt)", DIM);
				}
				for (OSData.FileEntry f : files) {
					String n = f.name().contains(" ") ? "'" + f.name() + "'" : f.name();
					println(String.format(Locale.ROOT, "%6d  %s", f.size(), n), f.type().equals("image") ? PURPLE : BLUE);
				}
			}
			case "cat" -> {
				if (a.size() < 2) {
					println("cat: missing file name", RED);
				} else {
					d.readText(a.get(1)).ifPresentOrElse(t -> println(t.isEmpty() ? "(empty file)" : t, FG), () -> println("cat: " + a.get(1) + ": No such text file", RED));
				}
			}
			case "touch" -> {
				if (a.size() < 2) {
					println("touch: missing file name", RED);
				} else if (!d.exists(a.get(1))) {
					d.writeText(a.get(1), "");
				}
			}
			case "rm" -> {
				if (a.size() < 2 || !d.exists(a.get(1))) {
					println("rm: cannot remove '" + (a.size() < 2 ? "" : a.get(1)) + "': No such file", RED);
				} else {
					d.delete(a.get(1));
				}
			}
			case "mv", "cp" -> {
				if (a.size() < 3 || !d.exists(a.get(1))) {
					println(cmd + ": usage: " + cmd + " <existing> <new>", RED);
				} else if (cmd.equals("mv")) {
					d.rename(a.get(1), a.get(2));
				} else {
					d.readFile(a.get(1)).ifPresent(t -> d.writeFile(a.get(2), d.fileType(a.get(1)).orElse("text"), t.copy()));
				}
			}
			case "echo" -> {
				int gt = rest.lastIndexOf('>');
				if (gt >= 0) {
					String file = rest.substring(gt + 1).trim().replace("\"", "");
					String text = rest.substring(0, gt).trim().replace("\"", "");
					boolean append = gt > 0 && rest.charAt(gt - 1) == '>';
					if (append) {
						text = rest.substring(0, gt - 1).trim().replace("\"", "");
						text = d.readText(file).orElse("") + text + "\n";
					}
					if (file.isEmpty()) {
						println("echo: missing file after >", RED);
					} else {
						d.writeText(file, append ? text : text + "\n");
					}
				} else {
					println(rest.replace("\"", ""), FG);
				}
			}
			case "clear" -> lines.clear();
			case "date" -> println("Day " + ctx.day() + ", " + ctx.clockText() + " (real world: " + java.time.LocalDateTime.now().withNano(0) + ")", FG);
			case "whoami" -> println(ctx.username(), FG);
			case "hostname" -> println("cubebook", FG);
			case "uname" -> println(rest.contains("a") ? "CubeOS cubebook 21.11.0-copper #1 SMP Redstone x86_64 Minecraft/1.21.11" : "CubeOS", FG);
			case "neofetch" -> neofetch();
			case "balance" -> println("◆ " + Gfx.formatNumber(ctx.account().balance()) + " emeralds in your EmeraldPay wallet", GREEN);
			case "orders" -> {
				List<Order> orders = ctx.account().snapshot().orders();
				if (orders.isEmpty()) {
					println("No orders yet. Try: browse emerazon.mc", DIM);
				}
				for (Order o : orders) {
					println(String.format(Locale.ROOT, "#%-4d %-11s %-10s ◆%-4d %s", o.id(), o.store().displayName(), o.status().getSerializedName(), o.total(),
							o.status().getSerializedName().equals("pending") ? "ETA " + Kit.duration(Kit.secondsLeft(o, ctx.gameTime())) : ""), FG);
				}
			}
			case "mail" -> {
				int unread = ctx.account().unreadMail();
				println(unread == 0 ? "No new mail." : "You have " + unread + " unread message(s). Opening CubeMail…", unread == 0 ? DIM : YELLOW);
				if (unread > 0) {
					ctx.openApp("mail", null);
				}
			}
			case "open" -> {
				if (a.size() < 2 || AppRegistry.get(a.get(1)) == null) {
					println("open: unknown app. Try: " + String.join(", ", AppRegistry.all().stream().map(AppInfo::id).toList()), RED);
				} else {
					ctx.openApp(a.get(1), a.size() > 2 ? a.get(2) : null);
				}
			}
			case "browse" -> ctx.openUrl(a.size() > 1 ? a.get(1) : "bloogle.mc");
			case "calc" -> {
				Double v = MathEval.tryEval(rest);
				println(v == null ? "calc: can't evaluate '" + rest + "'" : rest + " = " + MathEval.format(v), v == null ? RED : GREEN);
			}
			case "pos" -> println(player == null ? "Position unavailable (offline mode)" : "X " + player.getBlockX() + "  Y " + player.getBlockY() + "  Z " + player.getBlockZ(), FG);
			case "biome" -> println(player == null || level == null ? "Biome unavailable (offline mode)"
					: level.getBiome(player.blockPosition()).unwrapKey().map(k -> k.identifier().getPath().replace('_', ' ')).orElse("unknown"), FG);
			case "weather" -> println(level == null ? "☀ Offline: it's always sunny in dev mode" : level.isThundering() ? "⚡ Thunderstorm" : level.isRaining() ? "☂ Raining" : "☀ Clear", FG);
			case "fortune" -> println(FORTUNES[(int) (Math.random() * FORTUNES.length)], YELLOW);
			case "creepersay" -> creepersay(rest.isEmpty() ? "Sssssso... nice house you've got there." : rest);
			case "matrix" -> matrixUntil = Ease.now() + 60_000;
			case "sl" -> println("  ====        ________                ___________\n _D _|  |_______/        \\__I_I_____===__|_________|\n  |(_)---  |   H\\________/ |   |        =|___ ___|\n  /     |  |   H  |  |     |   |         ||_| |_||\n (minecart says choo choo)", FG);
			case "history" -> {
				for (int i = 0; i < history.size(); i++) {
					println(String.format(Locale.ROOT, "%4d  %s", i + 1, history.get(i)), FG);
				}
			}
			case "exit" -> ctx.close();
			case "sudo" -> println("Nice try. You're not an operator. (This incident will be reported to the Iron Golems.)", RED);
			default -> println("cubesh: command not found: " + cmd + " (type 'help')", RED);
		}
	}

	private void neofetch() {
		String user = ctx.username().toLowerCase(Locale.ROOT).replace(' ', '_') + "@cubebook";
		String[] info = {
				user,
				"-".repeat(user.length()),
				"OS: CubeOS 21.11 'Copper Golem'",
				"Host: CubeBook Pro 16\"",
				"Kernel: 21.11.0-copper",
				"Uptime: " + (ctx.uptimeMillis() / 60000) + " mins",
				"Shell: cubesh 1.0",
				"CPU: Redstone R9 9950X (16) @ 4.2GHz",
				"GPU: Glowstone RTX 4090",
				"Memory: 64 GB (in chests)",
				"Wallet: ◆" + Gfx.formatNumber(ctx.account().balance()),
				"Day: " + ctx.day()};
		lines.add(new Line(LOGO, CYAN));
		for (int i = 0; i < info.length; i++) {
			lines.add(new Line(INDENT + info[i], i == 0 ? GREEN : i == 1 ? DIM : i % 2 == 0 ? CYAN : BLUE));
		}
		lines.add(new Line(INDENT + "████████", -1));
		lines.add(new Line("", FG));
		stick = true;
	}

	private void creepersay(String text) {
		int len = Math.min(40, text.length());
		println(" " + "_".repeat(len + 2), FG);
		for (int i = 0; i < text.length(); i += 40) {
			println("< " + text.substring(i, Math.min(text.length(), i + 40)) + " >", FG);
		}
		println(" " + "-".repeat(len + 2), FG);
		println("     \\", FG);
		println("      \\   ██████", GREEN);
		println("          █ ██ █", GREEN);
		println("          ██  ██", GREEN);
		println("           █  █", GREEN);
		println("          ██████", GREEN);
		println("          ██  ██", GREEN);
	}

	@Override
	public boolean mouseScrolled(double x, double y, double amount) {
		return scroll.mouseScrolled(amount);
	}
}
