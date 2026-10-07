package com.laptopcraft.client.os;

import com.laptopcraft.client.os.ui.Ease;
import com.laptopcraft.client.os.ui.Gfx;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.resources.Identifier;
import org.jspecify.annotations.Nullable;
import org.lwjgl.glfw.GLFW;

/**
 * Desktop: wallpaper, icon grid (column-major: app shortcuts followed by the user's files), selection,
 * double-click to open, right-click menus and keyboard navigation (arrows, Enter, Delete, F2).
 */
public final class Desktop {
	/** App shortcuts shown on the desktop (if registered). */
	public static final List<String> SHORTCUTS = List.of("browser", "files", "mail", "notepad", "calculator", "paint", "music",
			"minesweeper", "snake", "game2048", "settings");
	private static final int CELL_W = 68;
	private static final int CELL_H = 58;
	private static final int MARGIN = 6;

	private record Icon(String label, Identifier texture, @Nullable String appId, @Nullable String file) {
	}

	private final CubeOS os;
	private final List<Icon> icons = new ArrayList<>();
	private int builtFilesVersion = -1;
	private int builtAppCount = -1;
	private int selected = -1;
	private long refreshedAt = Ease.now();
	private int rows = 1;

	Desktop(CubeOS os) {
		this.os = os;
	}

	/** Re-reads the icon list and plays the refresh animation. */
	void refresh() {
		builtFilesVersion = -1;
		refreshedAt = Ease.now();
		selected = -1;
	}

	private void rebuild() {
		int fv = os.dataImpl().filesVersion();
		int ac = AppRegistry.all().size();
		if (fv == builtFilesVersion && ac == builtAppCount) {
			return;
		}
		builtFilesVersion = fv;
		builtAppCount = ac;
		String sel = selected >= 0 && selected < icons.size() ? icons.get(selected).label() : null;
		icons.clear();
		for (String id : SHORTCUTS) {
			AppInfo info = AppRegistry.get(id);
			if (info != null) {
				icons.add(new Icon(info.name(), info.icon(), id, null));
			}
		}
		for (OSData.FileEntry f : os.data().listFiles()) {
			Identifier tex = "image".equals(f.type()) ? Icons.FILE_IMAGE : "text".equals(f.type()) ? Icons.FILE_TEXT : Icons.FILE_TEXT;
			icons.add(new Icon(f.name(), tex, null, f.name()));
		}
		selected = -1;
		if (sel != null) {
			for (int i = 0; i < icons.size(); i++) {
				if (icons.get(i).label().equals(sel)) {
					selected = i;
				}
			}
		}
	}

	private int cellX(int i) {
		return MARGIN + (i / rows) * CELL_W;
	}

	private int cellY(int i) {
		return MARGIN + (i % rows) * CELL_H;
	}

	private int indexAt(double mx, double my) {
		for (int i = 0; i < icons.size(); i++) {
			int x = cellX(i), y = cellY(i);
			if (Gfx.hovered(mx, my, x + 2, y + 1, CELL_W - 4, CELL_H - 4)) {
				return i;
			}
		}
		return -1;
	}

	void render(GuiGraphics g, int width, int deskH, int mouseX, int mouseY, boolean showIcons) {
		Wallpapers.render(g, OSSettings.wallpaper(os.data()), 0, 0, width, deskH + Taskbar.HEIGHT);
		if (!showIcons) {
			return;
		}
		rebuild();
		rows = Math.max(1, (deskH - MARGIN * 2) / CELL_H);
		Theme t = os.theme();
		float appear = Ease.outCubic(Ease.progress(refreshedAt, 350));
		int hover = indexAt(mouseX, mouseY);
		for (int i = 0; i < icons.size(); i++) {
			Icon ic = icons.get(i);
			int x = cellX(i);
			int y = cellY(i) + Math.round((1f - appear) * 6);
			if (x + CELL_W > width) {
				break;
			}
			boolean sel = i == selected;
			List<String> lines = Gfx.wrap(ic.label(), CELL_W - 6);
			int maxLines = sel ? 4 : 2;
			int shown = Math.min(lines.size(), maxLines);
			int boxH = 38 + shown * 9 + 3;
			if (sel) {
				Gfx.roundRect(g, x + 2, y + 1, CELL_W - 4, boxH, 3, Gfx.withAlpha(t.accent(), 0x55));
				Gfx.roundBorder(g, x + 2, y + 1, CELL_W - 4, boxH, 3, Gfx.withAlpha(Gfx.lighten(t.accent(), 0.3f), 0xA0));
			} else if (i == hover) {
				Gfx.roundRect(g, x + 2, y + 1, CELL_W - 4, boxH, 3, 0x30FFFFFF);
			}
			int a = Math.round(255 * appear);
			Gfx.icon(g, ic.texture(), x + (CELL_W - 32) / 2, y + 4, 32, Gfx.withAlpha(0xFFFFFFFF, a));
			for (int l = 0; l < shown; l++) {
				String line = lines.get(l);
				if (l == shown - 1 && lines.size() > shown) {
					line = Gfx.ellipsize(line + "…", CELL_W - 6);
				}
				Gfx.textCenteredShadow(g, line, x + CELL_W / 2, y + 39 + l * 9, Gfx.withAlpha(0xFFFFFFFF, a));
			}
		}
	}

	boolean mouseClicked(double mx, double my, int button, boolean doubleClick, boolean showIcons) {
		int i = showIcons ? indexAt(mx, my) : -1;
		if (button == 1) {
			if (i >= 0) {
				selected = i;
				iconMenu(icons.get(i), mx, my);
			} else {
				selected = -1;
				desktopMenu(mx, my);
			}
			return true;
		}
		if (i < 0) {
			selected = -1;
			return true;
		}
		selected = i;
		if (doubleClick) {
			open(icons.get(i));
		}
		return true;
	}

	private void open(Icon ic) {
		OSSounds.click();
		if (ic.appId() != null) {
			os.openApp(ic.appId(), null);
		} else if (ic.file() != null) {
			os.openFile(ic.file());
		}
	}

	private void iconMenu(Icon ic, double mx, double my) {
		List<MenuItem> items = new ArrayList<>();
		items.add(MenuItem.of("Open", ic.texture(), () -> open(ic)));
		if (ic.file() != null) {
			String f = ic.file();
			items.add(MenuItem.of("Rename…", () -> rename(f)).shortcut("F2"));
			items.add(MenuItem.separator());
			items.add(MenuItem.of("Delete", Icons.TRASH, () -> delete(f)).danger().shortcut("Del"));
		} else {
			AppInfo info = AppRegistry.get(ic.appId());
			if (info != null && !info.singleInstance()) {
				items.add(MenuItem.of("New window", () -> os.openApp(info.id(), null)));
			}
		}
		os.showContextMenu(new ContextMenu(items, mx, my, os.width(), os.desktopHeight()));
	}

	private void desktopMenu(double mx, double my) {
		boolean show = OSSettings.showDesktopIcons(os.data());
		os.showContextMenu(new ContextMenu(List.of(
				MenuItem.of("Change wallpaper…", Icons.SETTINGS, () -> os.openApp("settings", "wallpaper")),
				MenuItem.of("New text file…", Icons.FILE_TEXT, this::newTextFile),
				MenuItem.of("Refresh", this::refresh).shortcut("F5"),
				MenuItem.separator(),
				MenuItem.of("Show desktop icons", () -> os.data().setBool(OSSettings.SHOW_DESKTOP_ICONS, !show)).checked(show),
				MenuItem.of("Open Terminal", Icons.app("terminal"), () -> os.openApp("terminal", null)),
				MenuItem.separator(),
				MenuItem.of("About CubeOS", Icons.INFO, os::showAbout)), mx, my, os.width(), os.desktopHeight()));
	}

	void newTextFile() {
		String suggestion = os.data().uniqueName("New note.txt");
		os.showSystemDialog(Dialog.prompt("New text file", "Name of the new file:", suggestion, name -> {
			String n = name.trim();
			if (!n.isEmpty() && !n.contains(".")) {
				n = n + ".txt";
			}
			if (!OSData.isValidName(n)) {
				os.showSystemDialog(Dialog.alert("Invalid name", "File names need 1–48 characters and may not contain '/'."));
				return;
			}
			if (os.data().exists(n)) {
				os.showSystemDialog(Dialog.alert("File exists", "\"" + n + "\" already exists. Pick another name."));
				return;
			}
			os.data().writeText(n, "");
			os.openApp("notepad", n);
		}));
	}

	private void rename(String file) {
		os.showSystemDialog(Dialog.prompt("Rename", "New name for \"" + file + "\":", file, name -> {
			String n = name.trim();
			if (n.equals(file)) {
				return;
			}
			if (!OSData.isValidName(n)) {
				os.showSystemDialog(Dialog.alert("Invalid name", "File names need 1–48 characters and may not contain '/'."));
				return;
			}
			if (os.data().exists(n)) {
				os.showSystemDialog(Dialog.alert("File exists", "\"" + n + "\" already exists."));
				return;
			}
			os.data().rename(file, n);
		}));
	}

	private void delete(String file) {
		os.showSystemDialog(Dialog.confirm("Delete file", "Delete \"" + file + "\"? This cannot be undone.", "Delete", "Cancel",
				() -> os.data().delete(file), null).danger());
	}

	boolean keyPressed(int key, int mods, boolean showIcons) {
		if (key == GLFW.GLFW_KEY_F5) {
			refresh();
			return true;
		}
		if (!showIcons || icons.isEmpty()) {
			return false;
		}
		switch (key) {
			case GLFW.GLFW_KEY_DOWN -> selected = selected < 0 ? 0 : Math.min(icons.size() - 1, selected + 1);
			case GLFW.GLFW_KEY_UP -> selected = selected < 0 ? 0 : Math.max(0, selected - 1);
			case GLFW.GLFW_KEY_RIGHT -> selected = selected < 0 ? 0 : Math.min(icons.size() - 1, selected + rows);
			case GLFW.GLFW_KEY_LEFT -> selected = selected < 0 ? 0 : Math.max(0, selected - rows);
			case GLFW.GLFW_KEY_ENTER, GLFW.GLFW_KEY_KP_ENTER -> {
				if (selected >= 0) {
					open(icons.get(selected));
				}
			}
			case GLFW.GLFW_KEY_DELETE -> {
				if (selected >= 0 && icons.get(selected).file() != null) {
					delete(icons.get(selected).file());
				}
			}
			case GLFW.GLFW_KEY_F2 -> {
				if (selected >= 0 && icons.get(selected).file() != null) {
					rename(icons.get(selected).file());
				}
			}
			default -> {
				return false;
			}
		}
		return true;
	}
}
