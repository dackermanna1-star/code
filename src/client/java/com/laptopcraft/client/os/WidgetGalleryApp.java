package com.laptopcraft.client.os;

import com.laptopcraft.client.os.ui.Button;
import com.laptopcraft.client.os.ui.Dropdown;
import com.laptopcraft.client.os.ui.Gfx;
import com.laptopcraft.client.os.ui.Glyphs;
import com.laptopcraft.client.os.ui.IconButton;
import com.laptopcraft.client.os.ui.ListView;
import com.laptopcraft.client.os.ui.Slider;
import com.laptopcraft.client.os.ui.TabBar;
import com.laptopcraft.client.os.ui.TextArea;
import com.laptopcraft.client.os.ui.TextField;
import com.laptopcraft.client.os.ui.Toggle;
import com.laptopcraft.client.os.ui.WidgetGroup;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.client.gui.GuiGraphics;

/**
 * Developer showcase of every widget in {@code com.laptopcraft.client.os.ui} (opened with the
 * {@code dev:widgets} hook; not registered for players). Also a compact reference for app authors.
 */
public final class WidgetGalleryApp extends App {
	private final TabBar tabs = new TabBar(List.of("Controls", "Text", "Lists"), this::showPage);
	private final WidgetGroup controls = new WidgetGroup();
	private final WidgetGroup text = new WidgetGroup();
	private final WidgetGroup lists = new WidgetGroup();
	private WidgetGroup page = controls;
	private String status = "Ready.";
	private Slider volume;
	private Dropdown<String> sort;
	private ListView<String> list;

	@Override
	public void init() {
		// controls
		controls.add(new Button("Primary", () -> status = "Primary clicked").style(Button.Style.PRIMARY));
		controls.add(new Button("Secondary", () -> status = "Secondary clicked"));
		controls.add(new Button("Flat", () -> status = "Flat clicked").style(Button.Style.FLAT));
		controls.add(new Button("Danger", () -> status = "Danger clicked").style(Button.Style.DANGER));
		Button disabled = controls.add(new Button("Disabled", null));
		disabled.enabled = false;
		controls.add(new IconButton((g, c) -> Glyphs.plus(g, 0, 0, 7, c), 7, 7, "Add", () -> status = "Add"));
		controls.add(new IconButton((g, c) -> Glyphs.home(g, 0, 0, c), 9, 8, "Home", () -> status = "Home"));
		IconButton star = controls.add(new IconButton((g, c) -> Glyphs.star(g, 0, 0, true, c), 9, 9, "Favorite", null));
		star.onClick = () -> star.toggled = !star.toggled;
		controls.add(new Toggle("Dark mode", ctx.theme().dark(), on -> ctx.data().setString(OSSettings.THEME, on ? "dark" : "light")));
		controls.add(new Toggle("Notifications", true, on -> status = "Notifications " + (on ? "on" : "off")));
		volume = controls.add(new Slider(0, 100, 65, v -> status = "Volume " + Math.round(v)));
		volume.step = 5;
		volume.formatter = v -> Math.round(v) + "%";
		sort = controls.add(new Dropdown<>(List.of("Featured", "Price: low to high", "Price: high to low", "Newest", "Top rated"), s -> s,
				s -> status = "Sort: " + s));
		controls.add(new TabBar(List.of("Day", "Week", "Month"), i -> status = "Range " + i).style(TabBar.Style.PILLS));
		// text
		text.add(new TextField("Your name"));
		TextField search = text.add(new TextField("Search…"));
		search.searchIcon = true;
		search.clearButton = true;
		search.onEnter = s -> status = "Search: " + s;
		TextField pw = text.add(new TextField("Password"));
		pw.password = true;
		TextArea area = text.add(new TextArea());
		area.setText("TextArea supports soft wrapping, selection with shift and mouse drag, ctrl+A/C/X/V, undo/redo (ctrl+Z/Y), "
				+ "home/end, ctrl+arrows and page up/down.\n\nTry typing here! Lines wrap automatically when they get too long "
				+ "for the box, and the scrollbar appears when the text is taller than the editor.");
		// lists
		list = lists.add(new ListView<>(s -> s));
		List<String> items = new ArrayList<>();
		String[] mobs = {"Creeper", "Zombie", "Skeleton", "Enderman", "Spider", "Witch", "Villager", "Iron Golem", "Piglin", "Axolotl",
				"Bee", "Fox", "Panda", "Sniffer", "Allay", "Warden"};
		for (int i = 0; i < 32; i++) {
			items.add(mobs[i % mobs.length] + " #" + (i + 1));
		}
		list.setItems(items);
		list.zebra = true;
		list.bordered = true;
		list.onSelect = s -> status = "Selected " + s;
		list.onActivate = s -> ctx.notify("info", "Activated", s);
		list.onRightClick = (s, x, y) -> ctx.showContextMenu(x, y, List.of(MenuItem.of("Open " + s, () -> status = "Open " + s),
				MenuItem.separator(), MenuItem.of("Delete", Icons.TRASH, () -> status = "Delete " + s).danger()));
	}

	private void showPage(int i) {
		page = switch (i) {
			case 1 -> text;
			case 2 -> lists;
			default -> controls;
		};
	}

	@Override
	public void onResize(int w, int h) {
		tabs.setBounds(0, 0, w, 18);
		int y = 28;
		List<com.laptopcraft.client.os.ui.Widget> c = controls.widgets();
		int x = 8;
		for (int i = 0; i < 5; i++) {
			Button b = (Button) c.get(i);
			int bw = b.preferredWidth();
			b.setBounds(x, y, bw, 18);
			x += bw + 6;
		}
		for (int i = 5; i < 8; i++) {
			c.get(i).setBounds(8 + (i - 5) * 22, y + 26, 20, 20);
		}
		c.get(8).setBounds(8, y + 54, Math.min(180, w - 16), 14);
		c.get(9).setBounds(8, y + 72, Math.min(180, w - 16), 14);
		c.get(10).setBounds(8, y + 94, Math.min(200, w - 16), 12);
		c.get(11).setBounds(8, y + 114, 140, 16);
		c.get(12).setBounds(Math.min(160, w - 150), y + 114, 140, 16);
		List<com.laptopcraft.client.os.ui.Widget> t = text.widgets();
		t.get(0).setBounds(8, y, Math.min(200, w - 16), 16);
		t.get(1).setBounds(8, y + 22, Math.min(200, w - 16), 16);
		t.get(2).setBounds(8, y + 44, Math.min(200, w - 16), 16);
		t.get(3).setBounds(8, y + 68, w - 16, Math.max(40, h - y - 68 - 18));
		list.setBounds(8, y, w - 16, Math.max(40, h - y - 18));
	}

	@Override
	public void render(GuiGraphics g, int w, int h, int mx, int my, float pt) {
		Theme t = ctx.theme();
		Gfx.rect(g, 0, 0, w, h, t.bg());
		tabs.render(g, mx, my, pt);
		page.render(g, mx, my, pt);
		Gfx.rect(g, 0, h - 14, w, 14, t.surfaceAlt());
		Gfx.textClipped(g, status, 6, h - 11, w - 12, t.textDim());
	}

	@Override
	public boolean mouseClicked(double x, double y, int b) {
		if (tabs.mouseClicked(x, y, b)) {
			return true;
		}
		return page.mouseClicked(x, y, b);
	}

	@Override
	public boolean mouseReleased(double x, double y, int b) {
		return page.mouseReleased(x, y, b);
	}

	@Override
	public boolean mouseDragged(double x, double y, int b, double dx, double dy) {
		return page.mouseDragged(x, y, b, dx, dy);
	}

	@Override
	public boolean mouseScrolled(double x, double y, double amount) {
		return page.mouseScrolled(x, y, amount);
	}

	@Override
	public boolean keyPressed(int k, int s, int m) {
		return page.keyPressed(k, s, m);
	}

	@Override
	public boolean charTyped(int c, int m) {
		return page.charTyped(c, m);
	}

	@Override
	public void tick() {
		page.tick();
	}

	/** Opens the dropdown (dev hook helper for screenshots). */
	void openDropdown() {
		sort.mouseClicked(sort.x + 2, sort.y + 2, 0);
	}

	/** Selects the text page (dev hook helper). */
	void page(int i) {
		tabs.setSelected(i);
		showPage(i);
	}
}
