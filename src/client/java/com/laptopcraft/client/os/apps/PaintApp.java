package com.laptopcraft.client.os.apps;

import com.laptopcraft.client.os.MenuItem;
import com.laptopcraft.client.os.OSData;
import com.laptopcraft.client.os.Theme;
import com.laptopcraft.client.os.apps.kit.KitApp;
import com.laptopcraft.client.os.ui.Gfx;
import com.laptopcraft.client.os.ui.UI;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.nbt.CompoundTag;
import org.jspecify.annotations.Nullable;
import org.lwjgl.glfw.GLFW;

/** CubePaint: a pixel-art editor (pencil, eraser, fill, line, rectangle, picker) saving images to the laptop. */
public class PaintApp extends KitApp {
	private static final int[] PALETTE = {0xFF000000, 0xFF404040, 0xFF808080, 0xFFC0C0C0, 0xFFFFFFFF, 0xFFB02E26, 0xFFF9801D, 0xFFFED83D, 0xFF80C71F,
			0xFF5E7C16, 0xFF169C9C, 0xFF3AB3DA, 0xFF3C44AA, 0xFF8932B8, 0xFFC74EBD, 0xFFF38BAA, 0xFF835432, 0xFF1D1D21, 0x00000000};
	private static final String[] TOOLS = {"Pencil", "Eraser", "Fill", "Line", "Rect", "Picker"};
	private static final String[] TOOL_GLYPH = {"✎", "⌫", "◆", "/", "□", "⌖"};
	private int size = 32;
	private int[] px = new int[32 * 32];
	private int tool;
	private int primary = 0xFF000000, secondary = 0xFFFFFFFF;
	private boolean grid = true;
	private final Deque<int[]> undo = new ArrayDeque<>();
	private final Deque<int[]> redo = new ArrayDeque<>();
	private @Nullable String fileName;
	private boolean drawing;
	private int drawColor;
	private int startX = -1, startY = -1, curX = -1, curY = -1;
	private int canvasX, canvasY, cell;
	private boolean dirty;

	@Override
	public void init() {
		java.util.Arrays.fill(px, 0xFFFFFFFF);
	}

	@Override
	public void onLaunchArgument(String arg) {
		if (arg != null && !arg.isBlank()) {
			open(arg);
		}
	}

	@Override
	public String title() {
		return (dirty ? "• " : "") + (fileName == null ? "Untitled" : fileName) + " — CubePaint";
	}

	private void open(String name) {
		CompoundTag tag = ctx.data().readFile(name).orElse(null);
		if (tag == null || !ctx.data().fileType(name).orElse("").equals("image")) {
			ctx.alert("Can't open", "\"" + name + "\" isn't a CubePaint image.");
			return;
		}
		int s = tag.getIntOr("size", 32);
		int[] data = tag.getIntArray("pixels").orElse(new int[0]);
		if (data.length != s * s || s < 8 || s > 64) {
			ctx.alert("Can't open", "The image data is damaged. A creeper may have been involved.");
			return;
		}
		size = s;
		px = data;
		fileName = name;
		undo.clear();
		redo.clear();
		dirty = false;
	}

	private void save(boolean as) {
		if (fileName == null || as) {
			ctx.prompt("Save picture", "File name:", fileName != null ? fileName : ctx.data().uniqueName("Drawing.png"), n -> {
				String nn = n.trim().isEmpty() ? "Drawing.png" : n.trim();
				if (!nn.contains(".")) {
					nn += ".png";
				}
				write(nn);
			});
		} else {
			write(fileName);
		}
	}

	private void write(String name) {
		CompoundTag tag = new CompoundTag();
		tag.putInt("size", size);
		tag.putIntArray("pixels", px.clone());
		ctx.data().writeFile(name, "image", tag);
		fileName = name;
		dirty = false;
		ctx.notify("success", "Saved", name);
	}

	private void newImage(int s) {
		size = s;
		px = new int[s * s];
		java.util.Arrays.fill(px, 0xFFFFFFFF);
		fileName = null;
		undo.clear();
		redo.clear();
		dirty = false;
	}

	private void snapshot() {
		undo.push(px.clone());
		while (undo.size() > 40) {
			undo.removeLast();
		}
		redo.clear();
		dirty = true;
	}

	@Override
	protected void draw(GuiGraphics g, int w, int h, float pt) {
		Theme t = t();
		Gfx.rect(g, 0, 0, w, h, t.surfaceAlt());
		// menu bar
		int mx0 = 4;
		mx0 += menu(g, "File", mx0, () -> ctx.showContextMenu(4, 14, List.of(
				MenuItem.of("New 16×16", () -> confirmLose(() -> newImage(16))),
				MenuItem.of("New 32×32", () -> confirmLose(() -> newImage(32))),
				MenuItem.of("New 64×64", () -> confirmLose(() -> newImage(64))),
				MenuItem.separator(),
				MenuItem.of("Open…", this::openDialog),
				MenuItem.of("Save", () -> save(false)).shortcut("Ctrl+S"),
				MenuItem.of("Save as…", () -> save(true))))) + 2;
		int editX = mx0;
		menu(g, "Edit", mx0, () -> ctx.showContextMenu(editX, 14, List.of(
				MenuItem.of("Undo", this::undo).shortcut("Ctrl+Z").enabled(!undo.isEmpty()),
				MenuItem.of("Redo", this::redo).shortcut("Ctrl+Y").enabled(!redo.isEmpty()),
				MenuItem.of("Flip horizontal", () -> {
					snapshot();
					for (int y = 0; y < size; y++) {
						for (int x = 0; x < size / 2; x++) {
							int a = y * size + x, b = y * size + size - 1 - x;
							int tmp = px[a];
							px[a] = px[b];
							px[b] = tmp;
						}
					}
				}),
				MenuItem.of("Clear", () -> {
					snapshot();
					java.util.Arrays.fill(px, 0xFFFFFFFF);
				}).danger(),
				MenuItem.of(grid ? "Hide grid" : "Show grid", () -> grid = !grid))));
		// tools
		int ty = 18;
		for (int i = 0; i < TOOLS.length; i++) {
			int idx = i;
			boolean sel = tool == i;
			boolean hov = region(g, 4, ty + i * 20, 18, 18, () -> tool = idx);
			Gfx.roundRect(g, 4, ty + i * 20, 18, 18, 4, sel ? t.accent() : hov ? t.hover() : t.surface());
			Gfx.textCentered(g, TOOL_GLYPH[i], 13, ty + i * 20 + 5, sel ? t.accentText() : t.text());
			if (hov) {
				Gfx.tooltip(g, TOOLS[i], mx, my);
			}
		}
		// colors (primary/secondary preview)
		int cy = ty + TOOLS.length * 20 + 4;
		Gfx.rect(g, 9, cy + 6, 12, 12, secondary == 0 ? 0xFFFFFFFF : secondary);
		Gfx.border(g, 9, cy + 6, 12, 12, t.border());
		Gfx.rect(g, 4, cy, 12, 12, primary == 0 ? 0xFFFFFFFF : primary);
		Gfx.border(g, 4, cy, 12, 12, t.text());
		// palette at the bottom
		int pw = Math.max(8, Math.min(14, (w - 30) / PALETTE.length));
		int py = h - pw - 14;
		for (int i = 0; i < PALETTE.length; i++) {
			int c = PALETTE[i];
			int x = 28 + i * pw;
			region(g, x, py, pw, pw, () -> primary = c);
			rightRegion(x, py, pw, pw, () -> secondary = c);
			if (c == 0) {
				Gfx.rect(g, x, py, pw, pw, 0xFFFFFFFF);
				Gfx.rect(g, x, py, pw / 2, pw / 2, 0xFFCCCCCC);
				Gfx.rect(g, x + pw / 2, py + pw / 2, pw - pw / 2, pw - pw / 2, 0xFFCCCCCC);
			} else {
				Gfx.rect(g, x, py, pw, pw, c);
			}
			if (c == primary) {
				Gfx.border(g, x - 1, py - 1, pw + 2, pw + 2, t.text());
			}
		}
		// canvas
		int areaX = 28, areaY = 18, areaW = w - 34, areaH = py - 22;
		cell = Math.max(1, Math.min(areaW / size, areaH / size));
		int cw = cell * size;
		canvasX = areaX + (areaW - cw) / 2;
		canvasY = areaY + (areaH - cw) / 2;
		Gfx.shadow(g, canvasX, canvasY, cw, cw, 4);
		for (int y = 0; y < size; y++) {
			for (int x = 0; x < size; x++) {
				int c = px[y * size + x];
				if ((c >>> 24) == 0) {
					c = ((x + y) % 2 == 0) ? 0xFFEEEEEE : 0xFFDDDDDD;
				}
				Gfx.rect(g, canvasX + x * cell, canvasY + y * cell, cell, cell, c);
			}
		}
		if (grid && cell >= 5) {
			for (int i = 0; i <= size; i++) {
				Gfx.rect(g, canvasX + i * cell, canvasY, 1, cw, 0x22000000);
				Gfx.rect(g, canvasX, canvasY + i * cell, cw, 1, 0x22000000);
			}
		}
		// shape preview
		if (drawing && (tool == 3 || tool == 4) && startX >= 0) {
			for (int[] p : shape(startX, startY, curX, curY)) {
				Gfx.rect(g, canvasX + p[0] * cell, canvasY + p[1] * cell, cell, cell, drawColor == 0 ? 0x80FFFFFF : drawColor);
			}
		}
		int hx = (mx - canvasX) / Math.max(1, cell), hy = (my - canvasY) / Math.max(1, cell);
		boolean inCanvas = mx >= canvasX && my >= canvasY && hx < size && hy < size;
		if (inCanvas) {
			Gfx.border(g, canvasX + hx * cell, canvasY + hy * cell, cell, cell, 0xAA000000);
		}
		Gfx.text(g, size + "×" + size + (inCanvas ? "   " + hx + ", " + hy : "") + "   " + TOOLS[tool], 28, h - 11, t.textDim());
	}

	private int menu(GuiGraphics g, String label, int x, Runnable open) {
		int w = Gfx.width(label) + 10;
		if (region(g, x, 2, w, 12, open)) {
			Gfx.roundRect(g, x, 2, w, 12, 3, t().hover());
		}
		Gfx.text(g, label, x + 5, 4, t().text());
		return w;
	}

	private void confirmLose(Runnable r) {
		if (dirty) {
			ctx.confirm("Discard drawing?", "Your unsaved masterpiece will be lost.", r);
		} else {
			r.run();
		}
	}

	private void openDialog() {
		List<MenuItem> items = new ArrayList<>();
		for (OSData.FileEntry f : ctx.data().listFiles()) {
			if (f.type().equals("image")) {
				items.add(MenuItem.of(f.name(), () -> confirmLose(() -> open(f.name()))));
			}
		}
		if (items.isEmpty()) {
			items.add(MenuItem.disabled("No pictures saved yet"));
		}
		ctx.showContextMenu(4, 14, items);
	}

	private void undo() {
		if (!undo.isEmpty()) {
			redo.push(px.clone());
			px = undo.pop();
			dirty = true;
		}
	}

	private void redo() {
		if (!redo.isEmpty()) {
			undo.push(px.clone());
			px = redo.pop();
		}
	}

	private List<int[]> shape(int x0, int y0, int x1, int y1) {
		List<int[]> out = new ArrayList<>();
		if (tool == 4) {
			int ax = Math.min(x0, x1), bx = Math.max(x0, x1), ay = Math.min(y0, y1), by = Math.max(y0, y1);
			for (int x = ax; x <= bx; x++) {
				out.add(new int[] {x, ay});
				out.add(new int[] {x, by});
			}
			for (int y = ay; y <= by; y++) {
				out.add(new int[] {ax, y});
				out.add(new int[] {bx, y});
			}
			return out;
		}
		int dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx + dy;
		int x = x0, y = y0;
		while (true) {
			out.add(new int[] {x, y});
			if (x == x1 && y == y1) {
				break;
			}
			int e2 = 2 * err;
			if (e2 >= dy) {
				err += dy;
				x += sx;
			}
			if (e2 <= dx) {
				err += dx;
				y += sy;
			}
		}
		return out;
	}

	private void set(int x, int y, int c) {
		if (x >= 0 && y >= 0 && x < size && y < size) {
			px[y * size + x] = c;
		}
	}

	private void fill(int x, int y, int c) {
		int target = px[y * size + x];
		if (target == c) {
			return;
		}
		Deque<int[]> q = new ArrayDeque<>();
		q.add(new int[] {x, y});
		while (!q.isEmpty()) {
			int[] p = q.poll();
			if (p[0] < 0 || p[1] < 0 || p[0] >= size || p[1] >= size || px[p[1] * size + p[0]] != target) {
				continue;
			}
			px[p[1] * size + p[0]] = c;
			q.add(new int[] {p[0] + 1, p[1]});
			q.add(new int[] {p[0] - 1, p[1]});
			q.add(new int[] {p[0], p[1] + 1});
			q.add(new int[] {p[0], p[1] - 1});
		}
	}

	@Override
	public boolean mouseClicked(double x, double y, int button) {
		int cx = (int) ((x - canvasX) / Math.max(1, cell)), cy = (int) ((y - canvasY) / Math.max(1, cell));
		boolean in = x >= canvasX && y >= canvasY && cx < size && cy < size;
		if (!in) {
			return super.mouseClicked(x, y, button);
		}
		int color = tool == 1 ? 0xFFFFFFFF : button == 1 ? secondary : primary;
		switch (tool) {
			case 2 -> {
				snapshot();
				fill(cx, cy, color);
			}
			case 5 -> {
				int c = px[cy * size + cx];
				if (button == 1) {
					secondary = c;
				} else {
					primary = c;
				}
			}
			default -> {
				snapshot();
				drawing = true;
				drawColor = color;
				startX = curX = cx;
				startY = curY = cy;
				if (tool <= 1) {
					set(cx, cy, color);
				}
			}
		}
		return true;
	}

	@Override
	public boolean mouseDragged(double x, double y, int button, double dragX, double dragY) {
		if (!drawing) {
			return super.mouseDragged(x, y, button, dragX, dragY);
		}
		int cx = Math.max(0, Math.min(size - 1, (int) ((x - canvasX) / Math.max(1, cell))));
		int cy = Math.max(0, Math.min(size - 1, (int) ((y - canvasY) / Math.max(1, cell))));
		if (tool <= 1) {
			int saved = tool;
			tool = 3;
			for (int[] p : shape(curX, curY, cx, cy)) {
				set(p[0], p[1], drawColor);
			}
			tool = saved;
		}
		curX = cx;
		curY = cy;
		return true;
	}

	@Override
	public boolean mouseReleased(double x, double y, int button) {
		if (drawing) {
			if (tool == 3 || tool == 4) {
				for (int[] p : shape(startX, startY, curX, curY)) {
					set(p[0], p[1], drawColor);
				}
			}
			drawing = false;
			startX = -1;
			return true;
		}
		return super.mouseReleased(x, y, button);
	}

	@Override
	public boolean keyPressed(int key, int scan, int mods) {
		if (UI.hasCtrl(mods)) {
			switch (key) {
				case GLFW.GLFW_KEY_Z -> undo();
				case GLFW.GLFW_KEY_Y -> redo();
				case GLFW.GLFW_KEY_S -> save(UI.hasShift(mods));
				default -> {
					return false;
				}
			}
			return true;
		}
		int idx = switch (key) {
			case GLFW.GLFW_KEY_B, GLFW.GLFW_KEY_P -> 0;
			case GLFW.GLFW_KEY_E -> 1;
			case GLFW.GLFW_KEY_G, GLFW.GLFW_KEY_F -> 2;
			case GLFW.GLFW_KEY_L -> 3;
			case GLFW.GLFW_KEY_R -> 4;
			case GLFW.GLFW_KEY_I -> 5;
			default -> -1;
		};
		if (idx >= 0) {
			tool = idx;
			return true;
		}
		return false;
	}

	@Override
	public boolean onCloseRequested() {
		if (!dirty) {
			return true;
		}
		ctx.confirm("Close CubePaint?", "Your unsaved drawing will be lost.", () -> {
			dirty = false;
			ctx.close();
		});
		return false;
	}
}
