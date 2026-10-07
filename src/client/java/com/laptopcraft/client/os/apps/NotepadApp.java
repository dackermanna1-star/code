package com.laptopcraft.client.os.apps;

import com.laptopcraft.client.os.MenuItem;
import com.laptopcraft.client.os.OSData;
import com.laptopcraft.client.os.Theme;
import com.laptopcraft.client.os.apps.kit.KitApp;
import com.laptopcraft.client.os.ui.Gfx;
import com.laptopcraft.client.os.ui.TextArea;
import com.laptopcraft.client.os.ui.UI;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.client.gui.GuiGraphics;
import org.jspecify.annotations.Nullable;
import org.lwjgl.glfw.GLFW;

/** CubeOS Notepad: a plain-text editor with files, menus, shortcuts and a status bar. */
public class NotepadApp extends KitApp {
	private static final int MENU_H = 14, STATUS_H = 12;
	private final TextArea editor = new TextArea();
	private @Nullable String fileName;
	private String savedText = "";
	private boolean closingAfterSave;

	@Override
	public void init() {
		editor.bordered = false;
		editor.placeholder = "Start typing… (Ctrl+S to save)";
		ui.add(editor);
		ui.setFocus(editor);
	}

	@Override
	public void onLaunchArgument(String arg) {
		if (arg != null && !arg.isBlank()) {
			guard(() -> open(arg));
		}
	}

	@Override
	public String title() {
		return (dirty() ? "• " : "") + (fileName == null ? "Untitled" : fileName) + " — Notepad";
	}

	private boolean dirty() {
		return !editor.getText().equals(savedText);
	}

	private OSData data() {
		return ctx.data();
	}

	private void open(String name) {
		String text = data().readText(name).orElse(null);
		if (text == null) {
			ctx.alert("Can't open file", "\"" + name + "\" isn't a text file (or it was deleted).");
			return;
		}
		fileName = name;
		savedText = text;
		editor.setText(text);
		ui.setFocus(editor);
	}

	/** Runs {@code next} now, or after asking to save unsaved changes. */
	private void guard(Runnable next) {
		if (!dirty()) {
			next.run();
			return;
		}
		ctx.confirm("Unsaved changes", "Discard your changes to " + (fileName == null ? "Untitled" : fileName) + "?", next);
	}

	private void save(boolean as) {
		if (fileName == null || as) {
			String suggestion = fileName != null ? fileName : data().uniqueName("Note.txt");
			ctx.prompt(as ? "Save as" : "Save", "File name:", suggestion, name -> {
				String n = name.trim();
				if (n.isEmpty()) {
					return;
				}
				if (!n.contains(".")) {
					n += ".txt";
				}
				String fn = n;
				if (data().exists(fn) && !fn.equals(fileName)) {
					ctx.confirm("Replace file?", "\"" + fn + "\" already exists. Replace it?", () -> write(fn));
				} else {
					write(fn);
				}
			});
		} else {
			write(fileName);
		}
	}

	private void write(String name) {
		data().writeText(name, editor.getText());
		fileName = name;
		savedText = editor.getText();
		ctx.notify("success", "Saved", name);
		if (closingAfterSave) {
			ctx.close();
		}
	}

	private void openDialog() {
		List<MenuItem> items = new ArrayList<>();
		for (OSData.FileEntry f : data().listFiles()) {
			if (f.type().equals("text")) {
				items.add(MenuItem.of(f.name(), () -> guard(() -> open(f.name()))));
			}
		}
		if (items.isEmpty()) {
			items.add(MenuItem.disabled("No text files yet"));
		}
		ctx.showContextMenu(2, MENU_H, items);
	}

	private void ctrl(int key) {
		editor.keyPressed(key, 0, GLFW.GLFW_MOD_CONTROL);
		ui.setFocus(editor);
	}

	@Override
	protected void draw(GuiGraphics g, int w, int h, float pt) {
		Theme t = t();
		Gfx.rect(g, 0, 0, w, h, t.inputBg());
		Gfx.rect(g, 0, 0, w, MENU_H, t.surface());
		Gfx.rect(g, 0, MENU_H - 1, w, 1, t.border());
		int x = 4;
		x = menu(g, "File", x, () -> ctx.showContextMenu(4, MENU_H, List.of(
				MenuItem.of("New", () -> guard(() -> {
					fileName = null;
					savedText = "";
					editor.setText("");
				})).shortcut("Ctrl+N"),
				MenuItem.of("Open…", this::openDialog).shortcut("Ctrl+O"),
				MenuItem.of("Save", () -> save(false)).shortcut("Ctrl+S"),
				MenuItem.of("Save as…", () -> save(true)).shortcut("Ctrl+Shift+S"),
				MenuItem.separator(),
				MenuItem.of("Delete file", () -> {
					if (fileName != null) {
						String n = fileName;
						ctx.confirm("Delete \"" + n + "\"?", "This can't be undone. Not even with a totem.", () -> {
							data().delete(n);
							fileName = null;
							savedText = "";
							editor.setText("");
						});
					}
				}).enabled(fileName != null).danger(),
				MenuItem.of("Close", ctx::close))));
		int editX = x;
		x = menu(g, "Edit", x, () -> ctx.showContextMenu(editX, MENU_H, List.of(
				MenuItem.of("Undo", () -> ctrl(GLFW.GLFW_KEY_Z)).shortcut("Ctrl+Z"),
				MenuItem.of("Redo", () -> ctrl(GLFW.GLFW_KEY_Y)).shortcut("Ctrl+Y"),
				MenuItem.separator(),
				MenuItem.of("Cut", () -> ctrl(GLFW.GLFW_KEY_X)).shortcut("Ctrl+X").enabled(editor.hasSelection()),
				MenuItem.of("Copy", () -> ctrl(GLFW.GLFW_KEY_C)).shortcut("Ctrl+C").enabled(editor.hasSelection()),
				MenuItem.of("Paste", () -> ctrl(GLFW.GLFW_KEY_V)).shortcut("Ctrl+V"),
				MenuItem.of("Select all", () -> {
					editor.selectAll();
					ui.setFocus(editor);
				}).shortcut("Ctrl+A"))));
		int insX = x;
		menu(g, "Insert", x, () -> ctx.showContextMenu(insX, MENU_H, List.of(
				MenuItem.of("Date & time (real)", () -> insert(LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")))),
				MenuItem.of("In-game day & time", () -> insert("Day " + ctx.day() + ", " + ctx.clockText())),
				MenuItem.of("Coordinates", () -> {
					var p = ctx.mc().player;
					insert(p == null ? "(unknown)" : p.getBlockX() + ", " + p.getBlockY() + ", " + p.getBlockZ());
				}),
				MenuItem.of("Shopping list template", () -> insert("Shopping list\n- [ ] \n- [ ] \n- [ ] \n")))));
		editor.setBounds(0, MENU_H, w, h - MENU_H - STATUS_H);
		Gfx.rect(g, 0, h - STATUS_H, w, STATUS_H, t.surface());
		int[] lc = editor.caretLineColumn();
		String text = editor.getText();
		int words = text.isBlank() ? 0 : text.trim().split("\\s+").length;
		Gfx.text(g, "Ln " + (lc[0] + 1) + ", Col " + (lc[1] + 1), 6, h - STATUS_H + 2, t.textDim());
		Gfx.textRight(g, words + " words · " + text.length() + " chars · UTF-8", w - 6, h - STATUS_H + 2, t.textDim());
	}

	private void insert(String s) {
		editor.insert(s);
		ui.setFocus(editor);
	}

	private int menu(GuiGraphics g, String label, int x, Runnable open) {
		int w = Gfx.width(label) + 10;
		boolean hov = region(g, x, 1, w, MENU_H - 2, open);
		if (hov) {
			Gfx.roundRect(g, x, 1, w, MENU_H - 2, 3, t().hover());
		}
		Gfx.text(g, label, x + 5, 3, t().text());
		return x + w;
	}

	@Override
	public boolean keyPressed(int key, int scan, int mods) {
		if (UI.hasCtrl(mods)) {
			switch (key) {
				case GLFW.GLFW_KEY_S -> {
					save(UI.hasShift(mods));
					return true;
				}
				case GLFW.GLFW_KEY_O -> {
					openDialog();
					return true;
				}
				case GLFW.GLFW_KEY_N -> {
					guard(() -> {
						fileName = null;
						savedText = "";
						editor.setText("");
					});
					return true;
				}
				default -> {
				}
			}
		}
		return super.keyPressed(key, scan, mods);
	}

	@Override
	public boolean onCloseRequested() {
		if (!dirty() || editor.getText().isEmpty() && fileName == null) {
			return true;
		}
		ctx.confirm("Save changes?", "Close without saving " + (fileName == null ? "Untitled" : fileName) + "?", () -> {
			savedText = editor.getText();
			ctx.close();
		});
		return false;
	}
}
