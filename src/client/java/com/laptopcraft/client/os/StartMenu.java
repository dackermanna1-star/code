package com.laptopcraft.client.os;

import com.laptopcraft.client.os.ui.Ease;
import com.laptopcraft.client.os.ui.Gfx;
import com.laptopcraft.client.os.ui.Glyphs;
import com.laptopcraft.client.os.ui.ScrollState;
import com.laptopcraft.client.os.ui.TextField;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import net.minecraft.client.gui.GuiGraphics;
import org.jspecify.annotations.Nullable;
import org.lwjgl.glfw.GLFW;

/**
 * Start menu: user header, search box (type to filter apps and files, Enter launches the first
 * match, arrows move the selection), apps grouped by category, and the power row
 * (Lock, Sleep, Restart, Shut down). Slides up from the taskbar.
 */
public final class StartMenu {
	private static final int TILE_W = 50;
	private static final int TILE_H = 50;
	private static final int CAT_H = 14;
	private static final int ROW_H = 20;
	private static final int HEADER_H = 54;
	private static final int FOOTER_H = 26;

	/** A placed app tile (body-relative y). */
	private record Tile(AppInfo app, int x, int y) {
	}

	/** A placed category header (body-relative y). */
	private record Header(String text, int x, int y) {
	}

	/** A search hit: an app or a file. */
	private record Hit(@Nullable AppInfo app, @Nullable String file) {
		String label() {
			return app != null ? app.name() : file;
		}
	}

	private final CubeOS os;
	private final TextField search = new TextField("Type to search apps and files…");
	private final ScrollState scroll = new ScrollState();
	private boolean open;
	private long changedAt;
	private int x;
	private int y;
	private int w;
	private int h;
	private int selected;
	private final List<Hit> hits = new ArrayList<>();
	private final String[] powerLabels = {"Lock", "Sleep", "Restart", "Shut down"};
	private final List<Tile> tiles = new ArrayList<>();
	private final List<Header> headers = new ArrayList<>();
	private int gridContentH;

	StartMenu(CubeOS os) {
		this.os = os;
		search.searchIcon = true;
		search.clearButton = true;
		search.maxLength = 48;
		search.onChange = s -> {
			selected = 0;
			scroll.scrollTo(0);
		};
		search.onEnter = s -> launchSelected();
	}

	/** True while the start menu is open. */
	public boolean isOpen() {
		return open;
	}

	/** True while open or playing the close animation. */
	boolean isVisible() {
		return open || Ease.now() - changedAt < 150;
	}

	void open() {
		if (open) {
			return;
		}
		open = true;
		changedAt = Ease.now();
		search.setText("");
		search.setFocused(true);
		selected = 0;
		scroll.scrollTo(0);
	}

	void close() {
		if (!open) {
			return;
		}
		open = false;
		changedAt = Ease.now();
		search.setFocused(false);
	}

	void toggle() {
		if (open) {
			close();
		} else {
			open();
		}
	}

	boolean contains(double mx, double my) {
		return open && Gfx.hovered(mx, my, x, y, w, h);
	}

	private void layout() {
		w = Math.min(272, os.width() - 12);
		h = Math.min(320, os.desktopHeight() - 10);
		int sx = os.taskbar().startButtonX();
		x = Math.max(6, Math.min(sx - 8, os.width() - w - 6));
		y = os.desktopHeight() - h - 6;
	}

	private List<AppInfo> filteredApps(String q) {
		List<AppInfo> out = new ArrayList<>();
		for (AppInfo a : AppRegistry.all()) {
			if (a.name().toLowerCase(Locale.ROOT).contains(q) || a.id().contains(q) || a.category().displayName().toLowerCase(Locale.ROOT).startsWith(q)) {
				out.add(a);
			}
		}
		// names starting with the query first
		out.sort((a, b) -> Boolean.compare(!a.name().toLowerCase(Locale.ROOT).startsWith(q), !b.name().toLowerCase(Locale.ROOT).startsWith(q)));
		return out;
	}

	private void computeHits() {
		hits.clear();
		String q = search.getText().trim().toLowerCase(Locale.ROOT);
		if (q.isEmpty()) {
			return;
		}
		for (AppInfo a : filteredApps(q)) {
			hits.add(new Hit(a, null));
		}
		int files = 0;
		for (OSData.FileEntry f : os.data().listFiles()) {
			if (files < 6 && f.name().toLowerCase(Locale.ROOT).contains(q)) {
				hits.add(new Hit(null, f.name()));
				files++;
			}
		}
		selected = Math.max(0, Math.min(selected, hits.size() - 1));
	}

	private void launch(Hit hit) {
		close();
		if (hit.app() != null) {
			os.openApp(hit.app().id(), null);
		} else if (hit.file() != null) {
			os.openFile(hit.file());
		}
	}

	private void launchSelected() {
		computeHits();
		if (!hits.isEmpty()) {
			OSSounds.click();
			launch(hits.get(Math.max(0, Math.min(selected, hits.size() - 1))));
		}
	}

	// ------------------------------------------------------------------ render

	void render(GuiGraphics g, int mouseX, int mouseY) {
		if (!isVisible()) {
			return;
		}
		layout();
		Theme t = os.theme();
		float p = Ease.progress(changedAt, open ? 220 : 140);
		float a = open ? Ease.outCubic(p) : 1f - Ease.inCubic(p);
		int slide = Math.round((1f - a) * 24);
		int yy = y + slide;
		if (!open) {
			mouseX = Integer.MIN_VALUE / 2;
			mouseY = Integer.MIN_VALUE / 2;
		}
		Gfx.scissor(g, 0, 0, os.width(), os.desktopHeight());
		Gfx.shadow(g, x, yy, w, h, 10, Math.round(0x70 * a));
		int bg = t.dark() ? 0xFF202226 : 0xFFF7F8FA;
		Gfx.panel(g, x, yy, w, h, 6, Gfx.fade(bg, a), Gfx.fade(t.border(), a));

		// header: face + name + search
		PlayerFace.draw(g, x + 10, yy + 8, 16, Gfx.withAlpha(0xFFFFFFFF, Math.round(255 * a)));
		Gfx.roundBorder(g, x + 9, yy + 7, 18, 18, 1, Gfx.fade(t.border(), a));
		Gfx.textClipped(g, os.username(), x + 32, yy + 9, w - 120, Gfx.fade(t.text(), a));
		Gfx.text(g, "CubeOS · Day " + OSClock.day(os.dayTime()), x + 32, yy + 18, Gfx.fade(t.textDim(), a));
		search.setBounds(x + 8, yy + 31, w - 16, 17);
		search.render(g, mouseX, mouseY, 0);

		// body
		int bodyY = yy + HEADER_H;
		int bodyH = h - HEADER_H - FOOTER_H;
		computeHits();
		Gfx.scissor(g, x + 1, bodyY, w - 2, bodyH);
		if (search.getText().isBlank()) {
			renderGrid(g, t, bodyY, bodyH, mouseX, mouseY, a);
		} else {
			renderHits(g, t, bodyY, bodyH, mouseX, mouseY, a);
		}
		Gfx.endScissor(g);
		scroll.renderScrollbar(g, x + w - ScrollState.BAR_WIDTH - 2, bodyY + 2, bodyH - 4, mouseX, mouseY);

		// footer: power row
		int fy = yy + h - FOOTER_H;
		Gfx.rect(g, x + 1, fy, w - 2, 1, Gfx.fade(t.border(), a));
		Gfx.roundRect(g, x + 1, fy + 1, w - 2, FOOTER_H - 2, 5, Gfx.fade(t.dark() ? 0x40000000 : 0x0C000000, a), Gfx.BOTTOM);
		int bw = (w - 12) / 4;
		boolean compact = bw < 58;
		for (int i = 0; i < 4; i++) {
			int bx = x + 6 + i * bw;
			boolean hov = Gfx.hovered(mouseX, mouseY, bx, fy + 4, bw - 2, FOOTER_H - 8);
			if (hov) {
				Gfx.roundRect(g, bx, fy + 4, bw - 2, FOOTER_H - 8, 3, i == 3 ? Gfx.withAlpha(t.danger(), 0x40) : t.hover());
			}
			int col = Gfx.fade(i == 3 && hov ? t.danger() : t.text(), a);
			String label = powerLabels[i];
			int contentW = 10 + (compact ? 0 : 3 + Gfx.width(label));
			int gx = bx + (bw - 2 - contentW) / 2;
			int gy = fy + 9;
			switch (i) {
				case 0 -> Glyphs.padlock(g, gx + 1, gy, col);
				case 1 -> Glyphs.moon(g, gx, gy, col);
				case 2 -> Glyphs.reload(g, gx, gy, col);
				default -> Glyphs.power(g, gx, gy - 1, col);
			}
			if (!compact) {
				Gfx.text(g, label, gx + 13, gy, col);
			} else if (hov) {
				Gfx.tooltip(g, label, mouseX, mouseY);
			}
		}
		Gfx.endScissor(g);
	}

	/**
	 * Flow layout: each category is a section (header + tiles); small sections share a row
	 * (e.g. "Productivity" and "Internet" side by side) so everything fits without scrolling.
	 */
	private void layoutGrid() {
		tiles.clear();
		headers.clear();
		int cols = Math.max(1, (w - 16) / TILE_W);
		int gx = (w - cols * TILE_W) / 2;
		int col = 0;
		int lineY = 4;
		int lineRows = 0;
		for (AppCategory c : AppCategory.values()) {
			List<AppInfo> apps = AppRegistry.byCategory(c);
			if (apps.isEmpty()) {
				continue;
			}
			int span = Math.min(cols, apps.size());
			int rows = (apps.size() + cols - 1) / cols;
			if (col > 0 && col + span > cols) {
				lineY += CAT_H + lineRows * TILE_H + 4;
				col = 0;
				lineRows = 0;
			}
			int sx = gx + col * TILE_W;
			headers.add(new Header(c.displayName(), sx + 4, lineY + 3));
			for (int i = 0; i < apps.size(); i++) {
				tiles.add(new Tile(apps.get(i), sx + (i % span) * TILE_W, lineY + CAT_H + (i / span) * TILE_H));
			}
			lineRows = Math.max(lineRows, rows);
			col += span;
			if (col >= cols) {
				lineY += CAT_H + lineRows * TILE_H + 4;
				col = 0;
				lineRows = 0;
			}
		}
		gridContentH = lineY + (col > 0 ? CAT_H + lineRows * TILE_H + 4 : 0);
	}

	private void renderGrid(GuiGraphics g, Theme t, int bodyY, int bodyH, int mouseX, int mouseY, float a) {
		layoutGrid();
		scroll.setContent(gridContentH, bodyH);
		int oy = bodyY - scroll.offset();
		boolean inBody = Gfx.hovered(mouseX, mouseY, x, bodyY, w, bodyH);
		for (Header hd : headers) {
			Gfx.text(g, hd.text(), x + hd.x(), oy + hd.y(), Gfx.fade(t.textDim(), a));
		}
		for (Tile tile : tiles) {
			int tx = x + tile.x();
			int ty = oy + tile.y();
			boolean hov = inBody && Gfx.hovered(mouseX, mouseY, tx + 1, ty, TILE_W - 2, TILE_H - 2);
			if (hov) {
				Gfx.roundRect(g, tx + 1, ty, TILE_W - 2, TILE_H - 2, 4, t.hover());
			}
			Gfx.icon(g, tile.app().icon(), tx + (TILE_W - 32) / 2, ty + 3, 32, Gfx.withAlpha(0xFFFFFFFF, Math.round(255 * a)));
			String label = Gfx.ellipsize(tile.app().name(), TILE_W - 4);
			Gfx.textCentered(g, label, tx + TILE_W / 2, ty + 38, Gfx.fade(t.text(), a));
			if (hov && !label.equals(tile.app().name())) {
				Gfx.tooltip(g, tile.app().name(), mouseX, mouseY);
			}
		}
	}

	private void renderHits(GuiGraphics g, Theme t, int bodyY, int bodyH, int mouseX, int mouseY, float a) {
		if (hits.isEmpty()) {
			scroll.setContent(0, bodyH);
			Glyphs.search(g, x + w / 2 - 4, bodyY + bodyH / 2 - 22, t.textDim());
			Gfx.textCentered(g, "No results for \"" + Gfx.ellipsize(search.getText(), w - 120) + "\"", x + w / 2, bodyY + bodyH / 2 - 8, t.textDim());
			return;
		}
		int content = 18 + hits.size() * ROW_H + 4;
		scroll.setContent(content, bodyH);
		int cy = bodyY + 4 - scroll.offset();
		Gfx.text(g, "Best match", x + 12, cy + 2, t.textDim());
		cy += 14;
		boolean inBody = Gfx.hovered(mouseX, mouseY, x, bodyY, w, bodyH);
		for (int i = 0; i < hits.size(); i++) {
			Hit hit = hits.get(i);
			int ry = cy + i * ROW_H;
			boolean hov = inBody && Gfx.hovered(mouseX, mouseY, x + 6, ry, w - 12, ROW_H);
			if (i == selected) {
				Gfx.roundRect(g, x + 6, ry, w - 12, ROW_H, 4, t.selection());
			} else if (hov) {
				Gfx.roundRect(g, x + 6, ry, w - 12, ROW_H, 4, t.hover());
			}
			if (hit.app() != null) {
				Gfx.icon(g, hit.app().icon(), x + 10, ry + 2, 16);
				Gfx.textClipped(g, hit.label(), x + 32, ry + 6, w - 110, Gfx.fade(t.text(), a));
				Gfx.textRight(g, hit.app().category().displayName(), x + w - 14, ry + 6, t.textDim());
			} else {
				boolean image = os.data().fileType(hit.file()).map("image"::equals).orElse(false);
				Gfx.icon(g, image ? Icons.FILE_IMAGE : Icons.FILE_TEXT, x + 10, ry + 2, 16);
				Gfx.textClipped(g, hit.label(), x + 32, ry + 6, w - 90, Gfx.fade(t.text(), a));
				Gfx.textRight(g, "File", x + w - 14, ry + 6, t.textDim());
			}
		}
		if (selected >= 0) {
			scroll.ensureVisible(18 + selected * ROW_H, 18 + (selected + 1) * ROW_H + 4);
		}
	}

	// ------------------------------------------------------------------ input

	boolean mouseClicked(double mx, double my, int button) {
		if (!contains(mx, my)) {
			return false;
		}
		int bodyY = y + HEADER_H;
		int bodyH = h - HEADER_H - FOOTER_H;
		if (search.contains(mx, my)) {
			search.setFocused(true);
			search.mouseClicked(mx, my, button);
			return true;
		}
		if (scroll.mouseClicked(mx, my, x + w - ScrollState.BAR_WIDTH - 2, bodyY + 2, bodyH - 4)) {
			return true;
		}
		int fy = y + h - FOOTER_H;
		if (my >= fy) {
			int bw = (w - 12) / 4;
			int i = (int) ((mx - x - 6) / bw);
			if (i >= 0 && i < 4 && button == 0) {
				OSSounds.click();
				close();
				switch (i) {
					case 0 -> os.lock();
					case 1 -> os.sleep();
					case 2 -> os.restart();
					default -> os.shutdown();
				}
			}
			return true;
		}
		if (my < bodyY || my >= bodyY + bodyH) {
			return true;
		}
		if (!search.getText().isBlank()) {
			int cy = bodyY + 4 - scroll.offset() + 14;
			int i = (int) Math.floor((my - cy) / ROW_H);
			if (i >= 0 && i < hits.size()) {
				OSSounds.click();
				launch(hits.get(i));
			}
			return true;
		}
		layoutGrid();
		int oy = bodyY - scroll.offset();
		for (Tile tile : tiles) {
			int tx = x + tile.x();
			int ty = oy + tile.y();
			if (Gfx.hovered(mx, my, tx + 1, ty, TILE_W - 2, TILE_H - 2)) {
				if (button == 0) {
					OSSounds.click();
					close();
					os.openApp(tile.app().id(), null);
				}
				return true;
			}
		}
		return true;
	}

	boolean mouseDragged(double mx, double my, int button, double dx, double dy) {
		if (scroll.mouseDragged(my)) {
			return true;
		}
		return search.isFocused() && search.mouseDragged(mx, my, button, dx, dy);
	}

	boolean mouseReleased(double mx, double my, int button) {
		boolean s = scroll.mouseReleased();
		return search.mouseReleased(mx, my, button) || s;
	}

	boolean mouseScrolled(double mx, double my, double amount) {
		if (!contains(mx, my)) {
			return false;
		}
		scroll.mouseScrolled(amount);
		return true;
	}

	boolean keyPressed(int key, int scan, int mods) {
		if (key == GLFW.GLFW_KEY_ESCAPE) {
			close();
			return true;
		}
		if (!search.getText().isBlank()) {
			if (key == GLFW.GLFW_KEY_DOWN) {
				selected = Math.min(hits.size() - 1, selected + 1);
				return true;
			}
			if (key == GLFW.GLFW_KEY_UP) {
				selected = Math.max(0, selected - 1);
				return true;
			}
		}
		search.setFocused(true);
		search.keyPressed(key, scan, mods);
		return true;
	}

	boolean charTyped(int cp, int mods) {
		search.setFocused(true);
		search.charTyped(cp, mods);
		return true;
	}
}
