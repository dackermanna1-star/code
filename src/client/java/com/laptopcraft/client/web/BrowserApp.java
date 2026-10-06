package com.laptopcraft.client.web;

import com.laptopcraft.LaptopCraft;
import com.laptopcraft.client.os.App;
import com.laptopcraft.client.os.AppContext;
import com.laptopcraft.client.os.Icons;
import com.laptopcraft.client.os.MenuItem;
import com.laptopcraft.client.os.OSSettings;
import com.laptopcraft.client.os.Theme;
import com.laptopcraft.client.os.ui.Ease;
import com.laptopcraft.client.os.ui.Gfx;
import com.laptopcraft.client.os.ui.Glyphs;
import com.laptopcraft.client.os.ui.ScrollState;
import com.laptopcraft.client.os.ui.TextField;
import com.laptopcraft.client.os.ui.UI;
import com.mojang.blaze3d.platform.cursor.CursorTypes;
import java.util.ArrayList;
import java.util.List;
import java.util.function.BooleanSupplier;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.navigation.ScreenRectangle;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.ListTag;
import net.minecraft.nbt.Tag;
import org.jspecify.annotations.Nullable;
import org.lwjgl.glfw.GLFW;

/**
 * The CubeOS web browser: up to 6 tabs, back/forward/reload/home, an address bar (Enter navigates;
 * plain words search on Bloogle), bookmarks bar with a star toggle, fake loading bar, smooth
 * scrolling with a draggable scrollbar, link status bubble and keyboard shortcuts (Ctrl+L, Ctrl+T,
 * Ctrl+W, Ctrl+R/F5, Alt+←/→, Ctrl+Tab). Pages that throw are replaced by an error page.
 * Launch argument = URL to open.
 */
public class BrowserApp extends App {
	private static final int TAB_H = 22;
	private static final int TOOL_H = 24;
	private static final int BOOK_H = 16;
	private static final int CHROME_H = TAB_H + TOOL_H + BOOK_H + 1;
	private static final int MAX_TABS = 6;
	private static final int BTN = 20;
	private static final long LOAD_MS = 420;

	/** A bookmark (host cached for per-frame lookups). */
	private record Bookmark(String url, String name, String host) {
		Bookmark(String url, String name) {
			this(url, name, WebUrl.parse(url).host());
		}
	}

	private enum Press {
		NONE,
		PAGE,
		SCROLLBAR,
		ADDRESS,
		CHROME
	}

	/** One tab: history + current page. */
	private final class Tab implements PageContext {
		final List<WebUrl> history = new ArrayList<>();
		int index = -1;
		WebPage page;
		@Nullable Site site;
		final ScrollState scroll = new ScrollState();
		long loadStart;
		long shownAt;
		boolean pristine = true;
		int viewW;
		int viewH;

		WebUrl current() {
			return index >= 0 ? history.get(index) : WebUrl.parse(homepage());
		}

		String title() {
			if (page == null) {
				return "New tab";
			}
			try {
				String t = page.title();
				return t == null || t.isBlank() ? current().host() : t;
			} catch (RuntimeException e) {
				return current().host();
			}
		}

		// ---- PageContext
		@Override
		public AppContext app() {
			return ctx;
		}

		@Override
		public WebUrl url() {
			return current();
		}

		@Override
		public void navigate(String url) {
			load(this, WebUrl.parse(url), true);
		}

		@Override
		public void replace(String url) {
			load(this, WebUrl.parse(url), false);
		}

		@Override
		public void back() {
			goHistory(this, -1);
		}

		@Override
		public void forward() {
			goHistory(this, 1);
		}

		@Override
		public void reload() {
			load(this, current(), false);
		}

		@Override
		public int scrollY() {
			return scroll.offset();
		}

		@Override
		public void scrollTo(int y) {
			scroll.animateTo(y);
		}

		@Override
		public int viewportWidth() {
			return viewW;
		}

		@Override
		public int viewportHeight() {
			return viewH;
		}

		@Override
		public CompoundTag siteState() {
			return siteStateFor(current().host());
		}

		@Override
		public void saveSiteState() {
			ctx.saveAppState();
		}

		@Override
		public void openInNewTab(String url) {
			openTab(WebUrl.parse(url), true);
		}

		@Override
		public @Nullable Site site() {
			return site;
		}

		@Override
		public boolean isLoading() {
			return Ease.now() - loadStart < LOAD_MS;
		}

		@Override
		public long shownAt() {
			return shownAt;
		}

		@Override
		public void hoverLink(String url) {
			hoverLink = url;
		}
	}

	private final List<Tab> tabs = new ArrayList<>();
	private int active;
	private final List<Bookmark> bookmarks = new ArrayList<>();
	private final TextField address = new TextField("Search Bloogle or type a URL");
	private @Nullable String hoverLink;
	private @Nullable String statusText;
	private long statusSince;
	private Press press = Press.NONE;
	private int width;
	private int height;
	private @Nullable Tab pressedCloseTab;

	// ------------------------------------------------------------------ lifecycle

	@Override
	public void init() {
		address.bordered = false;
		address.maxLength = 256;
		address.onEnter = this::submitAddress;
		loadBookmarks();
		openTab(WebUrl.parse(homepage()), true);
		tabs.get(0).pristine = true;
	}

	@Override
	public void onLaunchArgument(String arg) {
		if (arg == null || arg.isBlank()) {
			return;
		}
		WebUrl url = WebUrl.parse(arg);
		Tab cur = tab();
		if (cur != null && cur.pristine) {
			cur.history.clear();
			cur.index = -1;
			load(cur, url, true);
		} else {
			openTab(url, true);
		}
	}

	@Override
	public void onResize(int w, int h) {
		width = w;
		height = h;
	}

	@Override
	public @Nullable String title() {
		Tab t = tab();
		return t == null ? "Browser" : t.title();
	}

	@Override
	public void tick() {
		Tab t = tab();
		if (t != null && t.page != null) {
			safe(t, () -> t.page.tick());
		}
	}

	@Override
	public void onClose() {
		for (Tab t : tabs) {
			if (t.page != null) {
				safe(t, () -> t.page.onHide());
			}
		}
		ctx.saveAppState();
	}

	private String homepage() {
		return OSSettings.homepage(ctx.data());
	}

	private @Nullable Tab tab() {
		return tabs.isEmpty() ? null : tabs.get(Math.max(0, Math.min(active, tabs.size() - 1)));
	}

	// ------------------------------------------------------------------ state

	private CompoundTag siteStateFor(String host) {
		CompoundTag state = ctx.appState();
		CompoundTag sites;
		if (state.get("sites") instanceof CompoundTag c) {
			sites = c;
		} else {
			sites = new CompoundTag();
			state.put("sites", sites);
		}
		String key = host.isEmpty() ? "_" : host;
		if (sites.get(key) instanceof CompoundTag c) {
			return c;
		}
		CompoundTag c = new CompoundTag();
		sites.put(key, c);
		return c;
	}

	private void loadBookmarks() {
		bookmarks.clear();
		CompoundTag state = ctx.appState();
		if (state.get("bookmarks") instanceof ListTag list) {
			for (Tag t : list) {
				if (t instanceof CompoundTag c) {
					String url = c.getStringOr("url", "");
					if (!url.isEmpty()) {
						bookmarks.add(new Bookmark(url, c.getStringOr("name", url)));
					}
				}
			}
			return;
		}
		bookmarks.add(new Bookmark("bloogle.mc", "Bloogle"));
		bookmarks.add(new Bookmark("emerazon.mc", "Emerazon"));
		bookmarks.add(new Bookmark("blocktube.mc", "BlockTube"));
		bookmarks.add(new Bookmark("endereats.mc", "Ender Eats"));
		bookmarks.add(new Bookmark("emeraldbank.mc", "Emerald Bank"));
	}

	private void saveBookmarks() {
		ListTag list = new ListTag();
		for (Bookmark b : bookmarks) {
			CompoundTag c = new CompoundTag();
			c.putString("url", b.url());
			c.putString("name", b.name());
			list.add(c);
		}
		ctx.appState().put("bookmarks", list);
		ctx.saveAppState();
	}

	private @Nullable Bookmark bookmarkFor(WebUrl url) {
		String s = url.toString();
		for (Bookmark b : bookmarks) {
			if (WebUrl.parse(b.url()).toString().equals(s)) {
				return b;
			}
		}
		return null;
	}

	private void toggleBookmark() {
		Tab t = tab();
		if (t == null) {
			return;
		}
		Bookmark existing = bookmarkFor(t.current());
		if (existing != null) {
			bookmarks.remove(existing);
		} else {
			String name = t.site != null && t.current().isHome() ? t.site.name() : Gfx.ellipsize(t.title(), 90);
			bookmarks.add(new Bookmark(t.current().toString(), name));
		}
		saveBookmarks();
	}

	// ------------------------------------------------------------------ navigation

	private void openTab(WebUrl url, boolean activate) {
		if (tabs.size() >= MAX_TABS) {
			Tab t = tab();
			if (t != null) {
				load(t, url, true);
			}
			return;
		}
		Tab t = new Tab();
		int insertAt = tabs.isEmpty() ? 0 : Math.min(tabs.size(), active + 1);
		tabs.add(insertAt, t);
		if (activate) {
			switchTo(insertAt);
		}
		load(t, url, true);
	}

	private void switchTo(int index) {
		Tab old = tab();
		active = Math.max(0, Math.min(index, tabs.size() - 1));
		Tab now = tab();
		if (old != now) {
			if (old != null && old.page != null) {
				safe(old, () -> old.page.onHide());
			}
			if (now != null && now.page != null) {
				safe(now, () -> now.page.onShow());
			}
		}
		address.setFocused(false);
	}

	private void closeTab(Tab t) {
		int i = tabs.indexOf(t);
		if (i < 0) {
			return;
		}
		if (t.page != null) {
			safe(t, () -> t.page.onHide());
		}
		tabs.remove(i);
		if (tabs.isEmpty()) {
			ctx.close();
			openTab(WebUrl.parse(homepage()), true);
			return;
		}
		if (active >= i) {
			active = Math.max(0, active - 1);
		}
		switchTo(active);
	}

	private void load(Tab t, WebUrl url, boolean push) {
		if (t.page != null) {
			WebPage old = t.page;
			safe(t, old::onHide);
		}
		t.pristine = false;
		if (push) {
			while (t.history.size() > t.index + 1) {
				t.history.remove(t.history.size() - 1);
			}
			t.history.add(url);
			t.index = t.history.size() - 1;
			while (t.history.size() > 50) {
				t.history.remove(0);
				t.index--;
			}
		} else if (t.index >= 0) {
			t.history.set(t.index, url);
		} else {
			t.history.add(url);
			t.index = 0;
		}
		showPage(t, url);
	}

	private void goHistory(Tab t, int dir) {
		int ni = t.index + dir;
		if (ni < 0 || ni >= t.history.size()) {
			return;
		}
		if (t.page != null) {
			WebPage old = t.page;
			safe(t, old::onHide);
		}
		t.index = ni;
		showPage(t, t.history.get(ni));
	}

	private void showPage(Tab t, WebUrl url) {
		Site site = SiteRegistry.get(url.host());
		t.site = site;
		WebPage page;
		try {
			page = site != null ? site.createPage(url) : new NotFoundPage(url);
			if (page == null) {
				page = new NotFoundPage(url);
			}
		} catch (RuntimeException | LinkageError e) {
			LaptopCraft.LOGGER.error("Browser: {} failed to create a page for {}", url.host(), url, e);
			page = new ErrorPage(url, e);
		}
		t.page = page;
		page.page = t;
		t.scroll.scrollTo(0);
		t.loadStart = Ease.now();
		t.shownAt = Ease.now();
		WebPage p = page;
		safe(t, p::init);
		if (t.page == p) {
			safe(t, p::onShow);
		}
		if (t == tab()) {
			address.setFocused(false);
		}
	}

	/** Runs page code; on failure the tab shows an error page instead. */
	private void safe(Tab t, Runnable r) {
		try {
			r.run();
		} catch (RuntimeException | LinkageError | StackOverflowError e) {
			fail(t, e);
		}
	}

	private boolean safeBool(Tab t, BooleanSupplier r) {
		try {
			return r.getAsBoolean();
		} catch (RuntimeException | LinkageError | StackOverflowError e) {
			fail(t, e);
			return true;
		}
	}

	private void fail(Tab t, Throwable e) {
		if (t.page instanceof ErrorPage) {
			return;
		}
		LaptopCraft.LOGGER.error("Browser: page {} crashed", t.current(), e);
		ErrorPage ep = new ErrorPage(t.current(), e);
		ep.page = t;
		t.page = ep;
	}

	private void submitAddress(String input) {
		String s = input.trim();
		if (s.isEmpty()) {
			return;
		}
		// text without a '.' or with spaces is a Bloogle search
		boolean looksLikeUrl = !s.contains(" ") && s.contains(".");
		String target = looksLikeUrl ? s : "bloogle.mc/search?q=" + WebUrl.encode(s);
		Tab t = tab();
		if (t == null) {
			openTab(WebUrl.parse(target), true);
		} else {
			load(t, WebUrl.parse(target), true);
		}
		address.setFocused(false);
	}

	private void focusAddress() {
		Tab t = tab();
		address.setText(t == null ? "" : t.current().toString());
		address.setFocused(true);
		address.selectAll();
	}

	// ------------------------------------------------------------------ layout helpers

	private int tabWidth() {
		int avail = width - 8 - 24;
		return Math.max(40, Math.min(150, avail / Math.max(1, tabs.size())));
	}

	private int tabX(int i) {
		return 4 + i * tabWidth();
	}

	private int plusX() {
		return tabX(tabs.size()) + 2;
	}

	private int addrX() {
		return 4 + 4 * (BTN + 1) + 4;
	}

	private int addrW() {
		return Math.max(40, width - addrX() - 6);
	}

	// ------------------------------------------------------------------ render

	@Override
	public void render(GuiGraphics g, int w, int h, int mouseX, int mouseY, float partialTick) {
		width = w;
		height = h;
		Theme t = ctx.theme();
		hoverLink = null;
		Tab cur = tab();
		renderViewport(g, t, cur, w, h, mouseX, mouseY, partialTick);
		renderChrome(g, t, cur, w, mouseX, mouseY);
		renderStatus(g, t, w, h);
	}

	private void renderChrome(GuiGraphics g, Theme t, @Nullable Tab cur, int w, int mouseX, int mouseY) {
		// tab strip
		Gfx.rect(g, 0, 0, w, TAB_H, t.surfaceAlt());
		int tw = tabWidth();
		for (int i = 0; i < tabs.size(); i++) {
			Tab tab = tabs.get(i);
			int x = tabX(i);
			boolean act = i == active;
			boolean hov = Gfx.hovered(mouseX, mouseY, x, 3, tw, TAB_H - 3);
			if (act) {
				Gfx.roundRect(g, x, 3, tw, TAB_H - 3, 4, t.surface(), Gfx.TOP);
			} else if (hov) {
				Gfx.roundRect(g, x + 1, 5, tw - 2, TAB_H - 8, 4, t.hover());
			} else if (i + 1 != active && i < tabs.size() - 1) {
				Gfx.rect(g, x + tw - 1, 8, 1, TAB_H - 14, t.border());
			}
			if (act && tab.site != null) {
				Gfx.roundRect(g, x + 6, 3, tw - 12, 2, 1, tab.site.themeColor() | 0xFF000000);
			}
			boolean loading = tab.isLoading();
			if (loading) {
				Gfx.spinner(g, x + 12, 12, 4, t.accent());
			} else {
				Gfx.icon(g, tab.site != null ? tab.site.favicon() : Icons.WARNING, x + 6, 6, 12);
			}
			boolean showClose = act || hov;
			int textMax = tw - 26 - (showClose ? 12 : 0);
			Gfx.textClipped(g, tab.title(), x + 22, 9, textMax, act ? t.text() : t.textDim());
			if (showClose) {
				int cx = x + tw - 15;
				boolean ch = Gfx.hovered(mouseX, mouseY, cx - 2, 6, 12, 12);
				if (ch) {
					Gfx.roundRect(g, cx - 2, 6, 12, 12, 3, t.hover());
				}
				Glyphs.close(g, cx + 1, 9, 6, ch ? t.text() : t.textDim());
			}
		}
		if (tabs.size() < MAX_TABS) {
			int px = plusX();
			boolean ph = Gfx.hovered(mouseX, mouseY, px, 4, 18, 16);
			if (ph) {
				Gfx.roundRect(g, px, 4, 18, 16, 4, t.hover());
			}
			Glyphs.plus(g, px + 5, 8, 7, t.text());
			if (ph) {
				Gfx.tooltip(g, "New tab (Ctrl+T)", mouseX, mouseY);
			}
		}

		// toolbar
		int ty = TAB_H;
		Gfx.rect(g, 0, ty, w, TOOL_H + BOOK_H, t.surface());
		boolean canBack = cur != null && cur.index > 0;
		boolean canFwd = cur != null && cur.index < cur.history.size() - 1;
		for (int i = 0; i < 4; i++) {
			int bx = 4 + i * (BTN + 1);
			int by = ty + 2;
			boolean enabled = i == 0 ? canBack : i == 1 ? canFwd : true;
			boolean hov = enabled && Gfx.hovered(mouseX, mouseY, bx, by, BTN, BTN);
			if (hov) {
				Gfx.roundRect(g, bx, by, BTN, BTN, 10, press == Press.CHROME ? t.pressed() : t.hover());
			}
			int col = enabled ? t.text() : Gfx.fade(t.textDim(), 0.5f);
			switch (i) {
				case 0 -> Glyphs.arrowLeft(g, bx + 6, by + 7, col);
				case 1 -> Glyphs.arrowRight(g, bx + 6, by + 7, col);
				case 2 -> Glyphs.reload(g, bx + 6, by + 6, col);
				default -> Glyphs.home(g, bx + 6, by + 6, col);
			}
		}
		// address pill
		int ax = addrX(), aw = addrW(), ay = ty + 3;
		boolean addrHov = Gfx.hovered(mouseX, mouseY, ax, ay, aw, 18);
		int pillBg = address.isFocused() ? t.inputBg() : addrHov ? Gfx.lerp(t.surfaceAlt(), t.inputBg(), 0.5f) : t.surfaceAlt();
		Gfx.roundRect(g, ax, ay, aw, 18, 6, pillBg);
		if (address.isFocused()) {
			Gfx.roundBorder(g, ax, ay, aw, 18, 6, t.accent());
		}
		Glyphs.padlock(g, ax + 7, ay + 5, cur != null && cur.site != null ? t.success() : t.textDim());
		int starX = ax + aw - 20;
		int fieldX = ax + 18;
		int fieldW = starX - fieldX - 2;
		if (address.isFocused()) {
			address.setBounds(fieldX, ay + 1, fieldW, 16);
			address.render(g, mouseX, mouseY, 0);
		} else if (cur != null) {
			WebUrl u = cur.current();
			String host = u.host();
			String full = u.toString();
			String rest = full.substring(Math.min(full.length(), host.length()));
			int hw = Gfx.width(host);
			Gfx.scissor(g, fieldX, ay, fieldW, 18);
			Gfx.text(g, host, fieldX + 4, ay + 5, t.text());
			Gfx.text(g, Gfx.ellipsize(rest, Math.max(0, fieldW - hw - 8)), fieldX + 4 + hw, ay + 5, t.textDim());
			Gfx.endScissor(g);
			if (addrHov && mouseX < starX) {
				g.requestCursor(CursorTypes.IBEAM);
			}
		}
		boolean starred = cur != null && bookmarkFor(cur.current()) != null;
		boolean sh = Gfx.hovered(mouseX, mouseY, starX, ay + 1, 16, 16);
		if (sh) {
			Gfx.roundRect(g, starX, ay + 1, 16, 16, 8, t.hover());
			Gfx.tooltip(g, starred ? "Remove bookmark" : "Bookmark this page", mouseX, mouseY);
		}
		Gfx.text(g, starred ? "★" : "☆", starX + 4, ay + 5, starred ? 0xFFF5B400 : (sh ? t.text() : t.textDim()));

		// bookmarks bar
		int by = ty + TOOL_H;
		int bx = 6;
		for (Bookmark b : bookmarks) {
			Site s = SiteRegistry.get(b.host());
			int bw = Gfx.width(b.name()) + 16;
			if (bx + bw > w - 6) {
				break;
			}
			boolean hov = Gfx.hovered(mouseX, mouseY, bx, by + 1, bw, BOOK_H - 2);
			if (hov) {
				Gfx.roundRect(g, bx, by + 1, bw, BOOK_H - 2, 4, t.hover());
				hoverLink = b.url();
			}
			int dot = s != null ? s.themeColor() | 0xFF000000 : t.accent();
			if (t.dark() && Gfx.luminance(dot) < 0.22f) {
				dot = Gfx.lighten(dot, 0.45f);
			} else if (!t.dark() && Gfx.luminance(dot) > 0.85f) {
				dot = Gfx.darken(dot, 0.3f);
			}
			Gfx.roundRect(g, bx + 4, by + 5, 6, 6, 2, dot);
			Gfx.text(g, b.name(), bx + 13, by + 4, t.text());
			bx += bw + 2;
		}
		Gfx.rect(g, 0, CHROME_H - 1, w, 1, t.border());
		// loading bar
		if (cur != null) {
			float p = Ease.progress(cur.loadStart, LOAD_MS);
			float fadeOut = Ease.clamp01((Ease.now() - cur.loadStart - LOAD_MS) / 200f);
			if (fadeOut < 1f) {
				int col = cur.site != null ? Gfx.lighten(cur.site.themeColor() | 0xFF000000, 0.15f) : t.accent();
				int lw = Math.round(w * Ease.outCubic(p) * 0.9f + (p >= 1f ? w * 0.1f : 0));
				Gfx.rect(g, 0, CHROME_H - 2, lw, 2, Gfx.fade(col, 1f - fadeOut));
			}
		}
	}

	private void renderViewport(GuiGraphics g, Theme t, @Nullable Tab cur, int w, int h, int mouseX, int mouseY, float pt) {
		int vy = CHROME_H;
		int vh = Math.max(1, h - vy);
		if (cur == null || cur.page == null) {
			Gfx.rect(g, 0, vy, w, vh, 0xFFFFFFFF);
			return;
		}
		WebPage page = cur.page;
		int ch = safeHeight(cur, w, vh);
		int pw = w;
		if (ch > vh) {
			pw = w - ScrollState.BAR_WIDTH;
			ch = safeHeight(cur, pw, vh);
		}
		cur.viewW = pw;
		cur.viewH = vh;
		cur.scroll.setContent(ch, vh);
		int scrollY = cur.scroll.offset();
		int bg;
		try {
			bg = page.background();
		} catch (RuntimeException e) {
			bg = 0xFFFFFFFF;
		}
		Gfx.rect(g, 0, vy, w, vh, bg | 0xFF000000);
		boolean inside = Gfx.hovered(mouseX, mouseY, 0, vy, pw, vh) && press != Press.SCROLLBAR;
		int dmx = inside || press == Press.PAGE ? mouseX : Integer.MIN_VALUE / 2;
		int dmy = inside || press == Press.PAGE ? mouseY - vy + scrollY : Integer.MIN_VALUE / 2;
		ScreenRectangle before = g.scissorStack.peek();
		g.enableScissor(0, vy, pw, vy + vh);
		g.pose().pushMatrix();
		g.pose().translate(0, vy - scrollY);
		try {
			page.render(g, pw, vh, scrollY, dmx, dmy, pt);
		} catch (RuntimeException | LinkageError | StackOverflowError e) {
			fail(cur, e);
		}
		g.pose().popMatrix();
		for (int i = 0; i < 32 && g.scissorStack.peek() != null && g.scissorStack.peek() != before; i++) {
			g.disableScissor();
		}
		// fade-in after navigation
		float fade = 1f - Ease.clamp01((Ease.now() - cur.shownAt) / 180f);
		if (fade > 0f) {
			Gfx.rect(g, 0, vy, w, vh, Gfx.withAlpha(bg, Math.round(200 * fade)));
		}
		cur.scroll.renderScrollbar(g, w - ScrollState.BAR_WIDTH, vy + 1, vh - 2, mouseX, mouseY);
		if (hoverLink != null && inside) {
			g.requestCursor(CursorTypes.POINTING_HAND);
		}
	}

	private int safeHeight(Tab cur, int w, int vh) {
		try {
			return Math.max(vh, cur.page.contentHeight(w, vh));
		} catch (RuntimeException | LinkageError | StackOverflowError e) {
			fail(cur, e);
			return vh;
		}
	}

	private void renderStatus(GuiGraphics g, Theme t, int w, int h) {
		if (hoverLink != null) {
			if (!hoverLink.equals(statusText)) {
				statusText = hoverLink;
				statusSince = Ease.now();
			}
		} else if (statusText != null && Ease.now() - statusSince > 50) {
			statusText = null;
		}
		if (statusText == null) {
			return;
		}
		String s = Gfx.ellipsize(WebUrl.parse(statusText).toString(), Math.max(40, w * 2 / 3));
		int sw = Gfx.width(s) + 10;
		int sy = h - 14;
		Gfx.roundRect(g, 2, sy, sw, 13, 3, t.dark() ? 0xF0303238 : 0xF0F1F3F5);
		Gfx.roundBorder(g, 2, sy, sw, 13, 3, t.border());
		Gfx.text(g, s, 7, sy + 3, t.text());
	}

	// ------------------------------------------------------------------ input

	@Override
	public boolean mouseClicked(double x, double y, int button) {
		Tab cur = tab();
		press = Press.NONE;
		if (y < TAB_H) {
			press = Press.CHROME;
			clickTabs(x, y, button);
			return true;
		}
		if (y < TAB_H + TOOL_H) {
			int ax = addrX(), aw = addrW();
			int starX = ax + aw - 20;
			if (Gfx.hovered(x, y, starX, TAB_H + 4, 16, 16)) {
				UI.playClick();
				toggleBookmark();
				return true;
			}
			if (Gfx.hovered(x, y, ax, TAB_H + 3, aw, 18)) {
				if (!address.isFocused()) {
					focusAddress();
				} else {
					address.mouseClicked(x, y, button);
					press = Press.ADDRESS;
				}
				return true;
			}
			address.setFocused(false);
			for (int i = 0; i < 4; i++) {
				int bx = 4 + i * (BTN + 1);
				if (Gfx.hovered(x, y, bx, TAB_H + 2, BTN, BTN) && cur != null) {
					press = Press.CHROME;
					UI.playClick();
					switch (i) {
						case 0 -> cur.back();
						case 1 -> cur.forward();
						case 2 -> cur.reload();
						default -> load(cur, WebUrl.parse(homepage()), true);
					}
					return true;
				}
			}
			return true;
		}
		if (y < CHROME_H) {
			address.setFocused(false);
			clickBookmarks(x, y, button);
			return true;
		}
		address.setFocused(false);
		if (cur == null || cur.page == null) {
			return true;
		}
		if (cur.scroll.mouseClicked(x, y, width - ScrollState.BAR_WIDTH, CHROME_H + 1, height - CHROME_H - 2)) {
			press = Press.SCROLLBAR;
			return true;
		}
		press = Press.PAGE;
		double dy = y - CHROME_H + cur.scroll.offset();
		WebPage p = cur.page;
		safeBool(cur, () -> p.mouseClicked(x, dy, button));
		return true;
	}

	private void clickTabs(double x, double y, int button) {
		int tw = tabWidth();
		for (int i = 0; i < tabs.size(); i++) {
			int tx = tabX(i);
			if (x >= tx && x < tx + tw) {
				Tab t = tabs.get(i);
				boolean onClose = Gfx.hovered(x, y, tx + tw - 17, 6, 12, 12);
				if (button == 2 || (button == 0 && onClose)) {
					UI.playClick();
					closeTab(t);
				} else if (button == 0) {
					switchTo(i);
				} else if (button == 1) {
					tabMenu(t, x, y);
				}
				return;
			}
		}
		if (tabs.size() < MAX_TABS && Gfx.hovered(x, y, plusX(), 4, 18, 16)) {
			UI.playClick();
			openTab(WebUrl.parse(homepage()), true);
			focusAddress();
		}
	}

	private void tabMenu(Tab t, double x, double y) {
		List<MenuItem> items = new ArrayList<>();
		items.add(MenuItem.of("New tab", () -> openTab(WebUrl.parse(homepage()), true)).shortcut("Ctrl+T"));
		items.add(MenuItem.of("Reload", t::reload).shortcut("F5"));
		items.add(MenuItem.of("Duplicate", () -> openTab(t.current(), true)).enabled(tabs.size() < MAX_TABS));
		items.add(MenuItem.separator());
		items.add(MenuItem.of("Close tab", () -> closeTab(t)).shortcut("Ctrl+W"));
		items.add(MenuItem.of("Close other tabs", () -> {
			for (Tab o : new ArrayList<>(tabs)) {
				if (o != t) {
					closeTab(o);
				}
			}
		}).enabled(tabs.size() > 1));
		ctx.showContextMenu(x, y, items);
	}

	private void clickBookmarks(double x, double y, int button) {
		int bx = 6;
		for (Bookmark b : bookmarks) {
			int bw = Gfx.width(b.name()) + 16;
			if (bx + bw > width - 6) {
				break;
			}
			if (x >= bx && x < bx + bw) {
				Tab cur = tab();
				if (button == 1) {
					ctx.showContextMenu(x, y, List.of(
							MenuItem.of("Open", () -> {
								if (cur != null) {
									cur.navigate(b.url());
								}
							}),
							MenuItem.of("Open in new tab", () -> openTab(WebUrl.parse(b.url()), true)).enabled(tabs.size() < MAX_TABS),
							MenuItem.separator(),
							MenuItem.of("Remove bookmark", () -> {
								bookmarks.remove(b);
								saveBookmarks();
							}).danger()));
				} else if (button == 2) {
					openTab(WebUrl.parse(b.url()), false);
				} else if (cur != null) {
					UI.playClick();
					cur.navigate(b.url());
				}
				return;
			}
			bx += bw + 2;
		}
	}

	@Override
	public boolean mouseDragged(double x, double y, int button, double dx, double dy) {
		Tab cur = tab();
		switch (press) {
			case ADDRESS -> {
				return address.mouseDragged(x, y, button, dx, dy);
			}
			case SCROLLBAR -> {
				return cur != null && cur.scroll.mouseDragged(y);
			}
			case PAGE -> {
				if (cur != null && cur.page != null) {
					WebPage p = cur.page;
					double docY = y - CHROME_H + cur.scroll.offset();
					return safeBool(cur, () -> p.mouseDragged(x, docY, button, dx, dy));
				}
				return false;
			}
			default -> {
				return false;
			}
		}
	}

	@Override
	public boolean mouseReleased(double x, double y, int button) {
		Tab cur = tab();
		Press p = press;
		press = Press.NONE;
		switch (p) {
			case ADDRESS -> {
				return address.mouseReleased(x, y, button);
			}
			case SCROLLBAR -> {
				return cur != null && cur.scroll.mouseReleased();
			}
			case PAGE -> {
				if (cur != null && cur.page != null) {
					WebPage page = cur.page;
					double docY = y - CHROME_H + cur.scroll.offset();
					return safeBool(cur, () -> page.mouseReleased(x, docY, button));
				}
				return false;
			}
			default -> {
				return false;
			}
		}
	}

	@Override
	public boolean mouseScrolled(double x, double y, double amount) {
		Tab cur = tab();
		if (cur == null || cur.page == null) {
			return false;
		}
		if (y < TAB_H && tabs.size() > 1) {
			switchTo(Math.floorMod(active - (int) Math.signum(amount), tabs.size()));
			return true;
		}
		if (y >= CHROME_H) {
			WebPage p = cur.page;
			double docY = y - CHROME_H + cur.scroll.offset();
			if (safeBool(cur, () -> p.mouseScrolled(x, docY, amount))) {
				return true;
			}
		}
		cur.scroll.mouseScrolled(amount);
		return true;
	}

	@Override
	public boolean keyPressed(int key, int scan, int mods) {
		Tab cur = tab();
		boolean ctrl = UI.hasCtrl(mods);
		boolean alt = UI.hasAlt(mods);
		if (ctrl && key == GLFW.GLFW_KEY_L) {
			focusAddress();
			return true;
		}
		if (ctrl && key == GLFW.GLFW_KEY_T) {
			if (tabs.size() < MAX_TABS) {
				openTab(WebUrl.parse(homepage()), true);
				focusAddress();
			}
			return true;
		}
		if (ctrl && key == GLFW.GLFW_KEY_W) {
			if (cur != null) {
				closeTab(cur);
			}
			return true;
		}
		if (ctrl && key == GLFW.GLFW_KEY_TAB && tabs.size() > 1) {
			switchTo(Math.floorMod(active + (UI.hasShift(mods) ? -1 : 1), tabs.size()));
			return true;
		}
		if (ctrl && key == GLFW.GLFW_KEY_D && cur != null) {
			toggleBookmark();
			return true;
		}
		if ((ctrl && key == GLFW.GLFW_KEY_R) || key == GLFW.GLFW_KEY_F5) {
			if (cur != null) {
				cur.reload();
			}
			return true;
		}
		if (alt && key == GLFW.GLFW_KEY_LEFT && cur != null) {
			cur.back();
			return true;
		}
		if (alt && key == GLFW.GLFW_KEY_RIGHT && cur != null) {
			cur.forward();
			return true;
		}
		if (address.isFocused()) {
			if (key == GLFW.GLFW_KEY_ESCAPE) {
				address.setFocused(false);
				return true;
			}
			address.keyPressed(key, scan, mods);
			return true;
		}
		if (cur != null && cur.page != null) {
			WebPage p = cur.page;
			if (safeBool(cur, () -> p.keyPressed(key, scan, mods))) {
				return true;
			}
			// keyboard scrolling
			int vh = Math.max(20, cur.viewH);
			switch (key) {
				case GLFW.GLFW_KEY_DOWN -> cur.scroll.scrollBy(30);
				case GLFW.GLFW_KEY_UP -> cur.scroll.scrollBy(-30);
				case GLFW.GLFW_KEY_PAGE_DOWN, GLFW.GLFW_KEY_SPACE -> cur.scroll.scrollBy(vh - 30);
				case GLFW.GLFW_KEY_PAGE_UP -> cur.scroll.scrollBy(-(vh - 30));
				case GLFW.GLFW_KEY_HOME -> cur.scroll.animateTo(0);
				case GLFW.GLFW_KEY_END -> cur.scroll.animateTo(cur.scroll.maxOffset());
				case GLFW.GLFW_KEY_BACKSPACE -> cur.back();
				default -> {
					return false;
				}
			}
			return true;
		}
		return false;
	}

	@Override
	public boolean charTyped(int cp, int mods) {
		if (address.isFocused()) {
			return address.charTyped(cp, mods);
		}
		Tab cur = tab();
		if (cur != null && cur.page != null) {
			WebPage p = cur.page;
			return safeBool(cur, () -> p.charTyped(cp, mods));
		}
		return false;
	}
}
