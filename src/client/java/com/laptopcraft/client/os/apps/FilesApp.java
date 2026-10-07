package com.laptopcraft.client.os.apps;

import com.laptopcraft.account.Order;
import com.laptopcraft.account.OrderLine;
import com.laptopcraft.client.os.Icons;
import com.laptopcraft.client.os.MenuItem;
import com.laptopcraft.client.os.OSData;
import com.laptopcraft.client.os.Theme;
import com.laptopcraft.client.os.apps.kit.KitApp;
import com.laptopcraft.client.os.ui.Gfx;
import com.laptopcraft.client.os.ui.ScrollState;
import com.laptopcraft.client.os.ui.TextField;
import com.laptopcraft.client.web.kit.Kit;
import com.laptopcraft.shop.Catalog;
import com.laptopcraft.shop.Product;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.resources.Identifier;
import org.jspecify.annotations.Nullable;
import org.lwjgl.glfw.GLFW;

/** CubeOS Files: browse, open, rename, duplicate and delete documents; read order receipts. */
public class FilesApp extends KitApp {
	private static final int TOOL_H = 22, HEAD_H = 14, ROW_H = 16;
	private final TextField filter = new TextField("Search files");
	private final ScrollState scroll = new ScrollState();
	private boolean receipts;
	private @Nullable String selected;
	private int sort; // 0 name, 1 type, 2 size, 3 modified
	private boolean desc;
	private long lastClickAt;
	private @Nullable String lastClickName;

	private record Row(String name, String type, int size, long modified, @Nullable Order order) {
	}

	@Override
	public void init() {
		filter.searchIcon = true;
		filter.clearButton = true;
		filter.maxLength = 32;
		ui.add(filter);
	}

	@Override
	public String title() {
		return receipts ? "Files — Receipts" : "Files — Documents";
	}

	private List<Row> rows() {
		List<Row> out = new ArrayList<>();
		String f = filter.getText().toLowerCase(Locale.ROOT);
		if (receipts) {
			for (Order o : ctx.account().snapshot().orders()) {
				String name = "Order-" + o.id() + "-" + o.store().id() + ".txt";
				if (name.toLowerCase(Locale.ROOT).contains(f)) {
					out.add(new Row(name, "receipt", receipt(o).length(), -1, o));
				}
			}
			return out;
		}
		for (OSData.FileEntry e : ctx.data().listFiles()) {
			if (e.name().toLowerCase(Locale.ROOT).contains(f)) {
				out.add(new Row(e.name(), e.type(), e.size(), e.modified(), null));
			}
		}
		Comparator<Row> c = switch (sort) {
			case 1 -> Comparator.comparing(Row::type).thenComparing(Row::name, String.CASE_INSENSITIVE_ORDER);
			case 2 -> Comparator.comparingInt(Row::size);
			case 3 -> Comparator.comparingLong(Row::modified);
			default -> Comparator.comparing(Row::name, String.CASE_INSENSITIVE_ORDER);
		};
		out.sort(desc ? c.reversed() : c);
		return out;
	}

	private static String receipt(Order o) {
		StringBuilder sb = new StringBuilder();
		sb.append(o.store().displayName()).append(" — Receipt for order #").append(o.id()).append('\n');
		sb.append(Kit.when(o.placedAt())).append('\n').append("--------------------------------\n");
		for (OrderLine l : o.lines()) {
			Product p = Catalog.get(l.productId()).orElse(null);
			String n = p == null ? l.productId() : p.name();
			sb.append(l.quantity()).append(" x ").append(n).append("  ").append(p == null ? "?" : p.price() * l.quantity()).append(" emeralds\n");
		}
		sb.append("--------------------------------\n");
		sb.append("Subtotal: ").append(o.subtotal()).append('\n').append("Delivery: ").append(o.fee()).append('\n');
		if (o.tip() > 0) {
			sb.append("Tip: ").append(o.tip()).append('\n');
		}
		sb.append("TOTAL: ").append(o.total()).append(" emeralds\n").append("Status: ").append(o.status().getSerializedName()).append('\n');
		sb.append("Deliver to: ").append(o.destination()).append("\n\nThank you for shopping!");
		return sb.toString();
	}

	private Identifier iconFor(Row r) {
		return switch (r.type) {
			case "image" -> Icons.FILE_IMAGE;
			case "receipt" -> r.order != null && r.order.store().id().equals("ender_eats") ? Icons.icon("endereats") : Icons.icon("emerazon");
			default -> Icons.FILE_TEXT;
		};
	}

	private void open(Row r) {
		if (r.order != null) {
			String name = ctx.data().uniqueName("Receipt-" + r.order.id() + ".txt");
			ctx.data().writeText(name, receipt(r.order));
			ctx.openFile(name);
			return;
		}
		ctx.openFile(r.name);
	}

	private void rename(String name) {
		ctx.prompt("Rename", "New name:", name, n -> {
			String nn = n.trim();
			if (!nn.isEmpty() && !nn.equals(name)) {
				if (ctx.data().exists(nn)) {
					ctx.alert("Name taken", "\"" + nn + "\" already exists.");
				} else {
					ctx.data().rename(name, nn);
					selected = nn;
				}
			}
		});
	}

	private void delete(String name) {
		ctx.confirm("Delete \"" + name + "\"?", "It'll be gone forever (CubeOS has no recycle bin — lava ate it).", () -> {
			ctx.data().delete(name);
			selected = null;
		});
	}

	private void duplicate(String name) {
		ctx.data().readFile(name).ifPresent(tag -> {
			String type = ctx.data().fileType(name).orElse("text");
			String copy = ctx.data().uniqueName(name.replaceFirst("(\\.[^.]+)?$", " copy$1"));
			ctx.data().writeFile(copy, type, tag.copy());
		});
	}

	private void newFile() {
		ctx.prompt("New text file", "File name:", ctx.data().uniqueName("New file.txt"), n -> {
			String nn = n.trim().isEmpty() ? "New file.txt" : n.trim();
			if (!nn.contains(".")) {
				nn += ".txt";
			}
			nn = ctx.data().uniqueName(nn);
			ctx.data().writeText(nn, "");
			selected = nn;
		});
	}

	private List<MenuItem> menuFor(Row r) {
		if (r.order != null) {
			return List.of(MenuItem.of("Open receipt", () -> open(r)));
		}
		return List.of(MenuItem.of("Open", () -> open(r)), MenuItem.of("Rename…", () -> rename(r.name)), MenuItem.of("Duplicate", () -> duplicate(r.name)),
				MenuItem.separator(), MenuItem.of("Delete", () -> delete(r.name)).danger());
	}

	@Override
	protected void draw(GuiGraphics g, int w, int h, float pt) {
		Theme t = t();
		Gfx.rect(g, 0, 0, w, h, t.bg());
		// sidebar
		int side = w >= 280 ? 84 : 0;
		if (side > 0) {
			Gfx.rect(g, 0, 0, side, h, t.surfaceAlt());
			place(g, "Documents", Icons.FOLDER, 4, 6, side - 8, !receipts, () -> {
				receipts = false;
				selected = null;
			});
			place(g, "Receipts", Icons.icon("emerazon"), 4, 26, side - 8, receipts, () -> {
				receipts = true;
				selected = null;
			});
			List<OSData.FileEntry> all = ctx.data().listFiles();
			int used = all.stream().mapToInt(OSData.FileEntry::size).sum();
			Gfx.text(g, "Storage", 6, h - 28, t.textDim());
			Gfx.progressBar(g, 6, h - 17, side - 12, 4, Math.min(1f, used / (1024f * 1024f)), t.border(), t.accent());
			Gfx.text(g, all.size() + " files", 6, h - 10, t.textDim());
		}
		// toolbar
		int x = side + 4;
		Gfx.rect(g, side, 0, w - side, TOOL_H, t.surface());
		if (!receipts) {
			x += tool(g, "+ New", x, this::newFile) + 3;
			if (selected != null) {
				String s = selected;
				x += tool(g, "Open", x, () -> ctx.openFile(s)) + 3;
				x += tool(g, "Rename", x, () -> rename(s)) + 3;
				x += tool(g, "Delete", x, () -> delete(s)) + 3;
			}
		}
		filter.setBounds(Math.max(x + 4, w - 110), 3, Math.min(104, w - x - 10), 16);
		// header
		int ly = TOOL_H;
		Gfx.rect(g, side, ly, w - side, HEAD_H, t.surfaceAlt());
		int nameX = side + 26, typeX = w - 150, sizeX = w - 100, modX = w - 60;
		boolean narrow = w - side < 260;
		header(g, "Name", nameX, ly, 0);
		if (!narrow) {
			header(g, "Type", typeX, ly, 1);
			header(g, "Size", sizeX, ly, 2);
			header(g, "Modified", modX, ly, 3);
		}
		// rows
		List<Row> rows = rows();
		int top = ly + HEAD_H, vh = h - top;
		scroll.setContent(rows.size() * ROW_H + 4, vh);
		Gfx.scissor(g, side, top, w - side, vh);
		int y = top + 2 - scroll.offset();
		if (rows.isEmpty()) {
			Gfx.textCentered(g, receipts ? "No orders yet — go shopping on emerazon.mc!" : filter.getText().isEmpty() ? "No files yet. Click \"+ New\" to make one." : "No matching files.",
					side + (w - side) / 2, top + 30, t.textDim());
		}
		SimpleDateFormat fmt = new SimpleDateFormat("MMM d HH:mm", Locale.ROOT);
		for (Row r : rows) {
			if (y + ROW_H >= top && y < h) {
				boolean sel = r.name.equals(selected);
				boolean hov = region(g, side, y, w - side - 8, ROW_H, () -> click(r));
				rightRegion(side, y, w - side - 8, ROW_H, () -> {
					selected = r.name;
					ctx.showContextMenu(mx, my, menuFor(r));
				});
				if (sel || hov) {
					Gfx.rect(g, side + 2, y, w - side - 12, ROW_H, sel ? t.selection() : t.hover());
				}
				Gfx.icon(g, iconFor(r), side + 8, y + 2, 12);
				Gfx.textClipped(g, r.name, nameX, y + 4, (narrow ? w - 10 : typeX - 6) - nameX, t.text());
				if (!narrow) {
					Gfx.text(g, r.type.equals("text") ? "Text" : r.type.equals("image") ? "Picture" : "Receipt", typeX, y + 4, t.textDim());
					Gfx.text(g, r.size < 1024 ? r.size + " B" : (r.size / 1024) + " KB", sizeX, y + 4, t.textDim());
					Gfx.textClipped(g, r.modified > 0 ? fmt.format(new Date(r.modified)) : r.order != null ? "Day " + (r.order.placedAt() / 24000 + 1) : "", modX, y + 4, 58, t.textDim());
				}
			}
			y += ROW_H;
		}
		Gfx.endScissor(g);
		scroll.renderScrollbar(g, w - 7, top, vh, mx, my);
	}

	private void click(Row r) {
		long now = System.currentTimeMillis();
		if (r.name.equals(lastClickName) && now - lastClickAt < 400) {
			open(r);
		}
		lastClickName = r.name;
		lastClickAt = now;
		selected = r.name;
	}

	private void place(GuiGraphics g, String label, Identifier icon, int x, int y, int w, boolean sel, Runnable action) {
		Theme t = t();
		boolean hov = region(g, x, y, w, 18, action);
		if (sel || hov) {
			Gfx.roundRect(g, x, y, w, 18, 4, sel ? t.selection() : t.hover());
		}
		Gfx.icon(g, icon, x + 4, y + 3, 12);
		Gfx.textClipped(g, label, x + 20, y + 5, w - 22, t.text());
	}

	private int tool(GuiGraphics g, String label, int x, Runnable action) {
		int w = Gfx.width(label) + 12;
		button(g, x, 3, w, 16, label, label.startsWith("+"), action);
		return w;
	}

	private void header(GuiGraphics g, String label, int x, int y, int col) {
		boolean hov = region(g, x - 2, y, Gfx.width(label) + 14, HEAD_H, () -> {
			if (sort == col) {
				desc = !desc;
			} else {
				sort = col;
				desc = false;
			}
		});
		Gfx.text(g, label + (sort == col ? (desc ? " ↓" : " ↑") : ""), x, y + 3, hov ? t().text() : t().textDim());
	}

	@Override
	public boolean mouseScrolled(double x, double y, double amount) {
		return super.mouseScrolled(x, y, amount) || scroll.mouseScrolled(amount);
	}

	@Override
	public boolean keyPressed(int key, int scan, int mods) {
		if (super.keyPressed(key, scan, mods)) {
			return true;
		}
		if (selected == null || receipts || filter.isFocused()) {
			return false;
		}
		String s = selected;
		switch (key) {
			case GLFW.GLFW_KEY_DELETE -> delete(s);
			case GLFW.GLFW_KEY_F2 -> rename(s);
			case GLFW.GLFW_KEY_ENTER -> ctx.openFile(s);
			default -> {
				return false;
			}
		}
		return true;
	}
}
