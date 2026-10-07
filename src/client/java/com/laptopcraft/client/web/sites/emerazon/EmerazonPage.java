package com.laptopcraft.client.web.sites.emerazon;

import com.laptopcraft.account.AccountSnapshot;
import com.laptopcraft.account.Order;
import com.laptopcraft.account.OrderLine;
import com.laptopcraft.account.OrderStatus;
import com.laptopcraft.client.os.AccountView;
import com.laptopcraft.client.os.Icons;
import com.laptopcraft.client.os.ui.Ease;
import com.laptopcraft.client.os.ui.Gfx;
import com.laptopcraft.client.os.ui.TextField;
import com.laptopcraft.client.web.WebUrl;
import com.laptopcraft.client.web.kit.Kit;
import com.laptopcraft.client.web.kit.KitPage;
import com.laptopcraft.shop.Catalog;
import com.laptopcraft.shop.Categories;
import com.laptopcraft.shop.DeliveryOption;
import com.laptopcraft.shop.Product;
import com.laptopcraft.shop.Store;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.core.BlockPos;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.ListTag;
import net.minecraft.nbt.StringTag;
import net.minecraft.nbt.Tag;
import net.minecraft.world.item.ItemStack;
import org.jspecify.annotations.Nullable;

/** Every Emerazon page: home, search/category results, product, cart, checkout, confirmation and orders. */
public class EmerazonPage extends KitPage {
	static final int NAVY = 0xFF131921, NAVY2 = 0xFF232F3E, ORANGE = 0xFFFF9900, YELLOW = 0xFFFFD814, BG = 0xFFE3E6E6,
			CARD = 0xFFFFFFFF, TEXT = 0xFF0F1111, DIM = 0xFF565959, LINK = 0xFF007185, PRICE = 0xFFB12704, GREEN = 0xFF067D62,
			STAR = 0xFFFFA41C, STAR_OFF = 0xFFD5D9D9, ICON_BG = 0xFFF7F8F8, LINE = 0xFFD5D9D9;
	private static final int HEADER = 26, NAV = 14, TOP = HEADER + NAV, CARD_W = 96, CARD_H = 122;
	private static final String[] REVIEWERS = {"Librarian Larry", "Farmer Fiona", "xXCreeperSlayerXx", "Cleric Carl", "Wandering Trader",
			"Iron Golem", "Piglin Pete", "Fletcher Fred", "Allay Anna", "Zombie Villager", "Sniffer Sam", "Toolsmith Tina", "Cartographer Cat",
			"Shepherd Shelly", "Mason Max", "Butcher Bob"};

	private final EmerazonSite site;
	private final WebUrl url;
	private final TextField search = new TextField("Search Emerazon");
	private final Map<String, Integer> rowOffset = new HashMap<>();
	private final long shownMs = Ease.now();
	private int docHeight;
	private int heroShift;
	// product page
	private int qty = 1;
	// checkout
	private boolean placing;
	private long placingSince;
	private long baselineOrder;
	private @Nullable String error;
	private @Nullable String toast;
	private long toastAt;

	public EmerazonPage(EmerazonSite site, WebUrl url) {
		this.site = site;
		this.url = url;
	}

	@Override
	public void init() {
		search.searchIcon = true;
		search.maxLength = 64;
		search.setText(url.param("q", ""));
		search.onEnter = q -> {
			if (!q.isBlank()) {
				page.navigate("emerazon.mc/search?q=" + WebUrl.encode(q.trim()));
			}
		};
		ui.add(search);
		if (route().equals("product")) {
			Catalog.get(url.param("id", "")).ifPresent(p -> remember(p.id()));
		}
	}

	private String route() {
		return url.path();
	}

	@Override
	public String title() {
		return switch (route()) {
			case "product" -> Catalog.get(url.param("id", "")).map(p -> "Emerazon.mc: " + p.name()).orElse("Emerazon.mc");
			case "search" -> "Emerazon.mc: " + url.param("q", "Search");
			case "category" -> "Emerazon.mc: " + url.param("c", "Category");
			case "cart" -> "Emerazon.mc Shopping Cart";
			case "checkout" -> "Emerazon.mc Checkout";
			case "orders", "order-placed" -> "Your Orders";
			default -> "Emerazon.mc: Spend less. Smile more.";
		};
	}

	@Override
	public int background() {
		return BG;
	}

	@Override
	public int contentHeight(int width, int viewportHeight) {
		return Math.max(viewportHeight, docHeight);
	}

	// ---------------------------------------------------------------- state helpers

	private AccountView account() {
		return page.app().account();
	}

	private List<OrderLine> cart() {
		return Kit.readCart(page.siteState());
	}

	private void saveCart(List<OrderLine> cart) {
		Kit.writeCart(page.siteState(), cart);
		page.saveSiteState();
	}

	private void addToCart(Product p, int n) {
		saveCart(Kit.addToCart(cart(), p.id(), n));
		toast = "Added to cart: " + p.name() + (n > 1 ? " ×" + n : "");
		toastAt = Ease.now();
	}

	private void remember(String id) {
		CompoundTag s = page.siteState();
		ListTag list = s.getListOrEmpty("recent");
		ListTag out = new ListTag();
		out.add(StringTag.valueOf(id));
		for (Tag t : list) {
			String v = t.asString().orElse("");
			if (!v.equals(id) && out.size() < 12) {
				out.add(StringTag.valueOf(v));
			}
		}
		s.put("recent", out);
		page.saveSiteState();
	}

	private List<Product> recent() {
		List<Product> out = new ArrayList<>();
		for (Tag t : page.siteState().getListOrEmpty("recent")) {
			t.asString().flatMap(Catalog::get).ifPresent(out::add);
		}
		return out;
	}

	private static int oldPrice(Product p) {
		return (int) Math.ceil(p.price() * (1.25 + Kit.rand(p.id(), 3) * 0.5));
	}

	private static boolean isDeal(Product p) {
		return p.badge().equalsIgnoreCase("Deal");
	}

	// ---------------------------------------------------------------- frame

	@Override
	protected void draw(GuiGraphics g, int width, int vh, int scrollY, float pt) {
		int y = TOP + 8;
		y = switch (route()) {
			case "search", "category" -> drawResults(g, width, y);
			case "product" -> drawProduct(g, width, y);
			case "cart" -> drawCart(g, width, y);
			case "checkout" -> drawCheckout(g, width, y);
			case "order-placed" -> drawPlaced(g, width, y);
			case "orders" -> drawOrders(g, width, y);
			case "" -> drawHome(g, width, y);
			default -> drawNotFound(g, width, y);
		};
		y = drawFooter(g, width, y + 12);
		docHeight = y;
		drawHeader(g, width, scrollY);
	}

	@Override
	protected void drawOverlay(GuiGraphics g, int width, int vh, int scrollY, float pt) {
		if (toast != null) {
			float t = (Ease.now() - toastAt) / 2600f;
			if (t >= 1) {
				toast = null;
			} else {
				int a = (int) (255 * Math.min(1, Math.min(t * 8, (1 - t) * 4)));
				String s = "✔ " + toast;
				int w = Math.min(width - 20, Gfx.width(s) + 16);
				int x = (width - w) / 2, ty = scrollY + vh - 30;
				Gfx.roundRect(g, x, ty, w, 18, 4, Gfx.withAlpha(0xFF067D62, a));
				Gfx.textCentered(g, Gfx.ellipsize(s, w - 10), width / 2, ty + 5, Gfx.withAlpha(0xFFFFFFFF, a));
			}
		}
		if (placing) {
			Gfx.rect(g, 0, scrollY, width, vh, 0x99FFFFFF);
			Gfx.spinner(g, width / 2, scrollY + vh / 2 - 8, 9, ORANGE);
			Gfx.textCentered(g, "Placing your order…", width / 2, scrollY + vh / 2 + 8, TEXT);
		}
	}

	private void drawHeader(GuiGraphics g, int width, int sy) {
		Gfx.rect(g, 0, sy, width, HEADER, NAVY);
		int x = 6;
		int lw = Gfx.textureFit(g, site.logo(), x, sy + 3, 84, 20);
		linkTo(g, x, sy + 2, lw, 22, "emerazon.mc");
		x += lw + 8;
		String name = page.app().username();
		if (width >= 560) {
			linkTo(g, x - 2, sy + 3, 70, 20, "emerazon.mc/orders");
			Gfx.text(g, "Deliver to", x + 9, sy + 4, 0xFFCCCCCC);
			Gfx.text(g, "⌂", x, sy + 13, 0xFFFFFFFF);
			Gfx.textClipped(g, name, x + 9, sy + 13, 58, 0xFFFFFFFF);
			x += 72;
		}
		int right = width - 6;
		// cart
		int cartW = 46;
		int units = Kit.units(cart());
		boolean ch = linkTo(g, right - cartW, sy + 2, cartW, 22, "emerazon.mc/cart");
		if (ch) {
			Gfx.roundBorder(g, right - cartW, sy + 2, cartW, 22, 2, 0xFFFFFFFF);
		}
		Gfx.icon(g, Icons.CART, right - cartW + 3, sy + 5, 16);
		Gfx.textCentered(g, String.valueOf(units), right - cartW + 13, sy + 2, ORANGE);
		Gfx.text(g, "Cart", right - cartW + 21, sy + 10, 0xFFFFFFFF);
		right -= cartW + 4;
		if (width >= 430) {
			int aw = 78;
			boolean ah = linkTo(g, right - aw, sy + 2, aw, 22, "emerazon.mc/orders");
			if (ah) {
				Gfx.roundBorder(g, right - aw, sy + 2, aw, 22, 2, 0xFFFFFFFF);
			}
			Gfx.textClipped(g, "Hello, " + name, right - aw + 4, sy + 4, aw - 6, 0xFFCCCCCC);
			Gfx.price(g, account().balance(), right - aw + 4, sy + 13, 0xFFFFFFFF);
			right -= aw + 4;
		}
		int sw = Math.max(60, right - x - 20);
		search.setBounds(x, sy + 5, sw, 16);
		if (region(g, x + sw, sy + 5, 20, 16, () -> search.onEnter.accept(search.getText()))) {
			page.hoverLink("emerazon.mc/search?q=" + search.getText());
		}
		Gfx.roundRect(g, x + sw - 2, sy + 5, 22, 16, 3, ORANGE, Gfx.TOP_RIGHT | Gfx.BOTTOM_RIGHT);
		Gfx.icon(g, Icons.SEARCH, x + sw + 3, sy + 7, 12, 0xFF131921);
		// nav strip
		int ny = sy + HEADER;
		Gfx.rect(g, 0, ny, width, NAV, NAVY2);
		int nx = 6;
		nx += navLink(g, "☰ All", nx, ny, "emerazon.mc/search?q=") + 10;
		nx += navLink(g, "Today's Deals", nx, ny, "emerazon.mc/search?q=deal") + 10;
		for (String c : Catalog.categories(Store.EMERAZON)) {
			if (nx + Gfx.width(c) > width - 60) {
				break;
			}
			nx += navLink(g, c, nx, ny, "emerazon.mc/category?c=" + WebUrl.encode(c)) + 10;
		}
		navLink(g, "Orders", width - 6 - Gfx.width("Orders"), ny, "emerazon.mc/orders");
	}

	private int navLink(GuiGraphics g, String s, int x, int y, String target) {
		int w = Gfx.width(s);
		boolean h = linkTo(g, x - 2, y + 1, w + 4, NAV - 2, target);
		if (h) {
			Gfx.border(g, x - 2, y + 1, w + 4, NAV - 2, 0xFFFFFFFF);
		}
		Gfx.text(g, s, x, y + 3, 0xFFFFFFFF);
		return w;
	}

	private int drawFooter(GuiGraphics g, int width, int y) {
		region(g, 0, y, width, 16, () -> page.scrollTo(0));
		Gfx.rect(g, 0, y, width, 16, 0xFF37475A);
		Gfx.textCentered(g, "Back to top", width / 2, y + 4, 0xFFFFFFFF);
		Gfx.rect(g, 0, y + 16, width, 38, NAVY2);
		Gfx.textCentered(g, "Get to Know Us · Careers in the Nether · Emerazon Prime Express · Sell on Emerazon · Help", width / 2, y + 24, 0xFFDDDDDD);
		Gfx.textCentered(g, "© 1.21.11 Emerazon.mc, Inc. or its villagers. No creepers were harmed in shipping.", width / 2, y + 38, 0xFF999999);
		return y + 54;
	}

	// ---------------------------------------------------------------- home

	private record Slide(String title, String sub, int top, int bottom, String category) {
	}

	private static final Slide[] SLIDES = {
			new Slide("Fashion Week", "Hats, hoodies & more — look sharp, mine hard", 0xFF2B5876, 0xFF4E4376, Categories.CLOTHING),
			new Slide("Toy Story", "Plushies, poppers and a rubber duck that means business", 0xFFFF7E5F, 0xFFFEB47B, Categories.TOYS),
			new Slide("Gallery Opening", "Masterpieces by Leonardo da Villager & friends", 0xFF134E5E, 0xFF71B280, Categories.PAINTINGS),
			new Slide("Cozy Builds", "Lava lamps, bean bags and other base upgrades", 0xFF41295A, 0xFF2F0743, Categories.HOME),
	};

	private int drawHome(GuiGraphics g, int width, int y) {
		int heroH = Math.max(90, Math.min(130, width / 4));
		int idx = Math.floorMod((int) ((Ease.now() - shownMs) / 6000) + heroShift, SLIDES.length);
		Slide s = SLIDES[idx];
		Gfx.gradientV(g, 0, TOP, width, heroH, s.top, s.bottom);
		int tx = 22;
		Gfx.textScaledShadow(g, s.title, tx, TOP + 18, 2f, 0xFFFFFFFF);
		Gfx.textClippedShadow(g, s.sub, tx, TOP + 40, width / 2, 0xFFEEEEEE);
		button(g, tx, TOP + 54, 70, 16, "Shop now ›", YELLOW, TEXT, () -> page.navigate("emerazon.mc/category?c=" + WebUrl.encode(s.category)));
		List<Product> items = Catalog.byCategory(Store.EMERAZON, s.category);
		int shown = Math.min(3, items.size());
		for (int i = 0; i < shown; i++) {
			float bob = (float) Math.sin((Ease.now() / 400.0) + i * 1.7) * 3;
			int ix = width - 30 - (shown - i) * 58;
			if (ix > width / 2) {
				Gfx.itemScaled(g, Kit.stack(items.get(i)), ix, TOP + 16 + (int) bob, 3f);
			}
		}
		if (region(g, 2, TOP + heroH / 2 - 12, 14, 24, () -> heroShift--)) {
			Gfx.rect(g, 2, TOP + heroH / 2 - 12, 14, 24, 0x33FFFFFF);
		}
		Gfx.textCentered(g, "‹", 9, TOP + heroH / 2 - 4, 0xFFFFFFFF);
		if (region(g, width - 16, TOP + heroH / 2 - 12, 14, 24, () -> heroShift++)) {
			Gfx.rect(g, width - 16, TOP + heroH / 2 - 12, 14, 24, 0x33FFFFFF);
		}
		Gfx.textCentered(g, "›", width - 9, TOP + heroH / 2 - 4, 0xFFFFFFFF);
		for (int i = 0; i < SLIDES.length; i++) {
			Gfx.rect(g, width / 2 - SLIDES.length * 6 + i * 12, TOP + heroH - 30, 8, 2, i == idx ? 0xFFFFFFFF : 0x66FFFFFF);
		}
		Gfx.gradientV(g, 0, TOP + heroH - 26, width, 26, 0x00E3E6E6, BG);
		y = TOP + heroH - 22;

		// category tiles overlapping the hero
		List<String> cats = Catalog.categories(Store.EMERAZON);
		int cols = Math.max(1, Math.min(4, (width - 12) / 150));
		int tw = (width - 12 - (cols - 1) * 8) / cols, th = 128;
		for (int i = 0; i < cols && i < cats.size(); i++) {
			String c = cats.get(i);
			int x = 6 + i * (tw + 8);
			Gfx.rect(g, x, y, tw, th, CARD);
			Gfx.textClipped(g, c, x + 8, y + 7, tw - 16, TEXT);
			List<Product> ps = Catalog.byCategory(Store.EMERAZON, c);
			int cell = (tw - 22) / 2;
			for (int k = 0; k < 4 && k < ps.size(); k++) {
				int cx = x + 8 + (k % 2) * (cell + 6), cy = y + 20 + (k / 2) * 46;
				Product p = ps.get(k);
				boolean h = linkTo(g, cx, cy, cell, 42, "emerazon.mc/product?id=" + p.id());
				Gfx.rect(g, cx, cy, cell, 34, h ? 0xFFEDEFEF : ICON_BG);
				Gfx.itemScaled(g, Kit.stack(p), cx + (cell - 24) / 2, cy + 5, 1.5f);
				Gfx.textClipped(g, p.name(), cx, cy + 36, cell, DIM);
			}
			textLink(g, "See more", x + 8, y + th - 12, LINK, "emerazon.mc/category?c=" + WebUrl.encode(c));
		}
		y += th + 10;

		List<Product> deals = Catalog.byStore(Store.EMERAZON).stream().filter(EmerazonPage::isDeal).toList();
		if (deals.size() < 4) {
			deals = Catalog.byStore(Store.EMERAZON).stream().filter(p -> Kit.rand(p.id(), 9) < 0.18).toList();
		}
		y = drawRow(g, "deals", "Today's Deals", "emerazon.mc/search?q=deal", deals, width, y);
		List<Product> rec = recent();
		if (!rec.isEmpty()) {
			y = drawRow(g, "recent", "Your browsing history", null, rec, width, y);
		}
		for (String c : cats) {
			y = drawRow(g, "cat:" + c, "Best Sellers in " + c, "emerazon.mc/category?c=" + WebUrl.encode(c), Catalog.byCategory(Store.EMERAZON, c), width, y);
		}
		return y;
	}

	private int drawRow(GuiGraphics g, String key, String title, @Nullable String seeAll, List<Product> items, int width, int y) {
		if (items.isEmpty()) {
			return y;
		}
		int x = 6, w = width - 12, h = CARD_H + 30;
		Gfx.rect(g, x, y, w, h, CARD);
		Gfx.text(g, title, x + 8, y + 7, TEXT);
		if (seeAll != null) {
			textLink(g, "See all", x + 16 + Gfx.width(title), y + 7, LINK, seeAll);
		}
		int visible = Math.max(1, (w - 32) / (CARD_W + 6));
		int max = Math.max(0, items.size() - visible);
		int off = Math.min(max, Math.max(0, rowOffset.getOrDefault(key, 0)));
		int cx = x + 16;
		for (int i = off; i < Math.min(items.size(), off + visible); i++) {
			drawCard(g, items.get(i), cx, y + 22, CARD_W, CARD_H, false);
			cx += CARD_W + 6;
		}
		if (off > 0) {
			arrow(g, x + 1, y + 22 + CARD_H / 2 - 14, "‹", () -> rowOffset.put(key, Math.max(0, off - visible)));
		}
		if (off < max) {
			arrow(g, x + w - 15, y + 22 + CARD_H / 2 - 14, "›", () -> rowOffset.put(key, Math.min(max, off + visible)));
		}
		return y + h + 8;
	}

	private void arrow(GuiGraphics g, int x, int y, String s, Runnable action) {
		boolean h = region(g, x, y, 14, 28, action);
		Gfx.roundRect(g, x, y, 14, 28, 2, h ? 0xFFFFFFFF : 0xEEF7F8F8);
		Gfx.roundBorder(g, x, y, 14, 28, 2, LINE);
		Gfx.textCentered(g, s, x + 7, y + 10, TEXT);
	}

	private void drawCard(GuiGraphics g, Product p, int x, int y, int w, int h, boolean withAdd) {
		boolean hov = linkTo(g, x, y, w, h, "emerazon.mc/product?id=" + p.id());
		Gfx.rect(g, x, y, w, h, CARD);
		if (hov) {
			Gfx.border(g, x - 1, y - 1, w + 2, h + 2, LINE);
		}
		Gfx.rect(g, x, y, w, 56, ICON_BG);
		float bob = hov ? (float) Math.sin(Ease.now() / 180.0) * 1.5f : 0;
		Gfx.itemScaled(g, Kit.stack(p), x + (w - 40) / 2, y + 8 + (int) bob, 2.5f);
		if (!p.badge().isEmpty()) {
			int bw = Gfx.width(p.badge()) + 6;
			Gfx.rect(g, x, y + 4, bw, 11, isDeal(p) ? 0xFFCC0C39 : 0xFFE47911);
			Gfx.text(g, p.badge(), x + 3, y + 6, 0xFFFFFFFF);
		}
		List<String> lines = Gfx.wrap(p.name(), w - 6);
		Gfx.text(g, lines.get(0), x + 3, y + 60, hov ? 0xFFC7511F : TEXT);
		if (lines.size() > 1) {
			Gfx.textClipped(g, lines.size() > 2 ? lines.get(1) + "…" : lines.get(1), x + 3, y + 70, w - 6, hov ? 0xFFC7511F : TEXT);
		}
		Kit.stars(g, x + 3, y + 82, p.rating(), STAR, STAR_OFF);
		Gfx.text(g, Gfx.formatNumber(p.reviews()), x + 45, y + 82, LINK);
		int px = x + 3;
		px += Gfx.price(g, p.price(), px, y + 94, PRICE);
		if (isDeal(p)) {
			String old = Gfx.formatNumber(oldPrice(p));
			int ow = Gfx.width(old);
			Gfx.text(g, old, px + 4, y + 95, DIM);
			Gfx.rect(g, px + 4, y + 99, ow, 1, DIM);
		}
		Gfx.text(g, p.price() >= 10 ? "FREE delivery" : "Express available", x + 3, y + 108, DIM);
	}

	// ---------------------------------------------------------------- results

	private int drawResults(GuiGraphics g, int width, int y) {
		boolean cat = route().equals("category");
		String q = url.param("q", "");
		String c = url.param("c", "");
		int minRating = url.intParam("minr", 0);
		String sort = url.param("sort", "featured");
		List<Product> list = new ArrayList<>(cat ? Catalog.byCategory(Store.EMERAZON, c)
				: q.equalsIgnoreCase("deal") ? Catalog.byStore(Store.EMERAZON).stream().filter(EmerazonPage::isDeal).toList()
				: Catalog.search(Store.EMERAZON, q));
		list.removeIf(p -> p.rating() < minRating);
		switch (sort) {
			case "price_asc" -> list.sort(Comparator.comparingInt(Product::price));
			case "price_desc" -> list.sort(Comparator.comparingInt(Product::price).reversed());
			case "rating" -> list.sort(Comparator.comparingInt(Product::rating).reversed());
			case "reviews" -> list.sort(Comparator.comparingInt(Product::reviews).reversed());
			default -> {
			}
		}
		Gfx.rect(g, 0, y - 8, width, 18, CARD);
		String head = cat ? c : q.isEmpty() ? "All products" : "\"" + q + "\"";
		Gfx.text(g, list.size() + " results for ", 8, y - 3, TEXT);
		Gfx.text(g, head, 8 + Gfx.width(list.size() + " results for "), y - 3, 0xFFC7511F);
		y += 16;
		int gx = 6;
		if (width >= 420) {
			int sw = 112;
			int sy = y;
			Gfx.text(g, "Department", 10, sy, TEXT);
			sy += 12;
			for (String k : Catalog.categories(Store.EMERAZON)) {
				boolean sel = cat && k.equals(c);
				textLink(g, Gfx.ellipsize(k, sw - 10), 14, sy, sel ? 0xFFC7511F : TEXT, "emerazon.mc/category?c=" + WebUrl.encode(k));
				sy += 11;
			}
			sy += 6;
			Gfx.text(g, "Customer Reviews", 10, sy, TEXT);
			sy += 12;
			for (int r : new int[] {40, 30}) {
				String target = url.withParam("minr", String.valueOf(r)).toString();
				Kit.stars(g, 14, sy, r, STAR, STAR_OFF);
				textLink(g, "& Up", 58, sy, minRating == r ? 0xFFC7511F : LINK, target);
				sy += 11;
			}
			sy += 6;
			Gfx.text(g, "Sort by", 10, sy, TEXT);
			sy += 12;
			String[][] sorts = {{"featured", "Featured"}, {"price_asc", "Price: Low to High"}, {"price_desc", "Price: High to Low"}, {"rating", "Avg. Customer Review"}, {"reviews", "Most reviewed"}};
			for (String[] s : sorts) {
				textLink(g, s[1], 14, sy, sort.equals(s[0]) ? 0xFFC7511F : LINK, url.withParam("sort", s[0]).toString());
				sy += 11;
			}
			gx = sw + 10;
		}
		int gw = width - gx - 6;
		int cols = Math.max(1, (gw + 6) / (CARD_W + 6));
		int cw = (gw - (cols - 1) * 6) / cols;
		if (list.isEmpty()) {
			Gfx.rect(g, gx, y, gw, 60, CARD);
			Gfx.text(g, "No results. Even the Wandering Trader doesn't sell that.", gx + 10, y + 14, TEXT);
			textLink(g, "Browse all products", gx + 10, y + 30, LINK, "emerazon.mc/search?q=");
			return y + 70;
		}
		for (int i = 0; i < list.size(); i++) {
			int col = i % cols, row = i / cols;
			drawCard(g, list.get(i), gx + col * (cw + 6), y + row * (CARD_H + 6), cw, CARD_H, true);
		}
		return y + ((list.size() + cols - 1) / cols) * (CARD_H + 6);
	}

	// ---------------------------------------------------------------- product

	private int drawProduct(GuiGraphics g, int width, int y) {
		Optional<Product> op = Catalog.get(url.param("id", ""));
		if (op.isEmpty() || op.get().store() != Store.EMERAZON) {
			return drawNotFound(g, width, y);
		}
		Product p = op.get();
		int x = 8;
		x += textLink(g, "Emerazon", x, y, LINK, "emerazon.mc");
		Gfx.text(g, " › ", x, y, DIM);
		x += Gfx.width(" › ");
		textLink(g, p.category(), x, y, LINK, "emerazon.mc/category?c=" + WebUrl.encode(p.category()));
		y += 14;
		Gfx.rect(g, 4, y - 4, width - 8, 1, LINE);
		boolean wide = width >= 470;
		int imgW = wide ? 150 : width - 16;
		int imgH = wide ? 150 : 120;
		Gfx.rect(g, 8, y, imgW, imgH, CARD);
		Gfx.rect(g, 12, y + 4, imgW - 8, imgH - 8, ICON_BG);
		float bob = (float) Math.sin(Ease.now() / 500.0) * 3;
		float scale = 6f;
		Gfx.itemScaled(g, Kit.stack(p), 8 + (imgW - 96) / 2, y + (imgH - 96) / 2 + (int) bob, scale);
		Gfx.text(g, "Roll over image to zoom in", 8 + (imgW - Gfx.width("Roll over image to zoom in")) / 2, y + imgH + 4, DIM);
		int infoX = wide ? 8 + imgW + 12 : 8;
		int buyW = wide && width >= 620 ? 146 : 0;
		int infoW = wide ? width - infoX - 8 - (buyW > 0 ? buyW + 10 : 0) : width - 16;
		int iy = wide ? y : y + imgH + 16;
		for (String line : Gfx.wrap(p.name(), infoW)) {
			Gfx.textScaled(g, line, infoX, iy, 1.0f, TEXT);
			iy += 11;
		}
		iy += 2;
		textLink(g, "Visit the " + brand(p) + " Store", infoX, iy, LINK, "emerazon.mc/category?c=" + WebUrl.encode(p.category()));
		iy += 12;
		Gfx.text(g, Kit.rating(p.rating()), infoX, iy, TEXT);
		Kit.stars(g, infoX + 18, iy, p.rating(), STAR, STAR_OFF);
		Gfx.text(g, Gfx.formatNumber(p.reviews()) + " ratings", infoX + 62, iy, LINK);
		iy += 12;
		if (!p.badge().isEmpty()) {
			int bw = Gfx.width(p.badge()) + 8;
			Gfx.rect(g, infoX, iy, bw, 11, isDeal(p) ? 0xFFCC0C39 : 0xFFE47911);
			Gfx.text(g, p.badge(), infoX + 4, iy + 2, 0xFFFFFFFF);
			Gfx.text(g, "in " + p.category(), infoX + bw + 4, iy + 2, DIM);
			iy += 14;
		}
		Gfx.rect(g, infoX, iy, infoW, 1, LINE);
		iy += 6;
		if (isDeal(p)) {
			int off = 100 - p.price() * 100 / oldPrice(p);
			Gfx.textScaled(g, "-" + off + "%", infoX, iy, 2f, 0xFFCC0C39);
			iy += 2;
			drawBigPrice(g, p.price(), infoX + Gfx.width("-" + off + "%") * 2 + 8, iy - 2);
			iy += 18;
			Gfx.text(g, "List price: ", infoX, iy, DIM);
			int lw = Gfx.width("List price: ");
			String old = Gfx.formatNumber(oldPrice(p));
			Gfx.text(g, old, infoX + lw, iy, DIM);
			Gfx.rect(g, infoX + lw, iy + 4, Gfx.width(old), 1, DIM);
			iy += 12;
		} else {
			drawBigPrice(g, p.price(), infoX, iy);
			iy += 20;
		}
		Gfx.text(g, "About this item", infoX, iy, TEXT);
		iy += 12;
		for (String bullet : bullets(p)) {
			Gfx.text(g, "•", infoX + 2, iy, TEXT);
			iy += Gfx.textWrapped(g, bullet, infoX + 10, iy, infoW - 10, 10, TEXT) + 2;
		}
		int boxY = buyW > 0 ? y : iy + 6;
		int boxX = buyW > 0 ? width - 8 - buyW : 8;
		int boxW = buyW > 0 ? buyW : Math.min(width - 16, 220);
		int by = drawBuyBox(g, p, boxX, boxY, boxW);
		y = Math.max(Math.max(y + imgH + 16, iy), by) + 10;
		List<Product> similar = new ArrayList<>(Catalog.byCategory(Store.EMERAZON, p.category()));
		similar.removeIf(o -> o.id().equals(p.id()));
		y = drawRow(g, "similar", "Customers who viewed this item also viewed", null, similar, width, y);
		return drawReviews(g, p, width, y);
	}

	private void drawBigPrice(GuiGraphics g, int price, int x, int y) {
		Gfx.emerald(g, x, y + 3);
		Gfx.textScaled(g, Gfx.formatNumber(price), x + 12, y, 2f, TEXT);
	}

	private int drawBuyBox(GuiGraphics g, Product p, int x, int y, int w) {
		int h = 150;
		Gfx.rect(g, x, y, w, h, CARD);
		Gfx.border(g, x, y, w, h, LINE);
		int ix = x + 8, iy = y + 8;
		drawBigPrice(g, p.price(), ix, iy);
		iy += 22;
		Gfx.text(g, "FREE delivery in " + Catalog.EMERAZON_STANDARD_SECONDS + "s", ix, iy, TEXT);
		iy += 10;
		Gfx.textClipped(g, "or Express in " + Catalog.EMERAZON_EXPRESS_SECONDS + "s for ◆" + Catalog.EMERAZON_EXPRESS_FEE, ix, iy, w - 16, DIM);
		iy += 12;
		Gfx.text(g, "In Stock", ix, iy, GREEN);
		iy += 13;
		Gfx.text(g, "Qty:", ix, iy + 3, TEXT);
		int sx = ix + 26;
		stepper(g, sx, iy, qty, n -> qty = Math.max(1, Math.min(Catalog.MAX_UNITS_PER_LINE, n)));
		iy += 18;
		button(g, ix, iy, w - 16, 16, "Add to Cart", YELLOW, TEXT, () -> addToCart(p, qty));
		iy += 20;
		button(g, ix, iy, w - 16, 16, "Buy Now", 0xFFFFA41C, TEXT, () -> {
			saveCart(Kit.addToCart(cart(), p.id(), qty));
			page.navigate("emerazon.mc/checkout");
		});
		iy += 21;
		Gfx.textClipped(g, "Ships from & sold by Emerazon", ix, iy, w - 16, DIM);
		return y + h;
	}

	private interface IntSink {
		void accept(int value);
	}

	private void stepper(GuiGraphics g, int x, int y, int value, IntSink set) {
		Gfx.roundRect(g, x, y, 54, 14, 3, 0xFFF0F2F2);
		Gfx.roundBorder(g, x, y, 54, 14, 3, LINE);
		if (region(g, x, y, 16, 14, () -> set.accept(value - 1))) {
			Gfx.rect(g, x + 1, y + 1, 15, 12, 0xFFE3E6E6);
		}
		if (region(g, x + 38, y, 16, 14, () -> set.accept(value + 1))) {
			Gfx.rect(g, x + 38, y + 1, 15, 12, 0xFFE3E6E6);
		}
		Gfx.textCentered(g, "-", x + 8, y + 3, TEXT);
		Gfx.textCentered(g, String.valueOf(value), x + 27, y + 3, TEXT);
		Gfx.textCentered(g, "+", x + 46, y + 3, TEXT);
	}

	private static String brand(Product p) {
		String[] brands = {"CraftLuxe", "Blockwell", "Overworld Basics", "Ender & Co.", "Pixelia", "Netherfield", "Cubique"};
		return brands[(int) (Kit.rand(p.category(), 1) * brands.length)];
	}

	private static List<String> bullets(Product p) {
		List<String> out = new ArrayList<>();
		for (String s : p.description().split("(?<=[.!?])\\s+")) {
			if (!s.isBlank()) {
				out.add(s.trim());
			}
		}
		String extra = switch (p.category()) {
			case Categories.CLOTHING -> "Machine washable in any river. Creeper-proof stitching (not guaranteed).";
			case Categories.HATS -> "One size fits all heads, including big villager noses.";
			case Categories.TOYS -> "Ages 3 to 300. Not suitable for Endermen (they will take it).";
			case Categories.PAINTINGS -> "Arrives framed and ready to hang. Wall not included.";
			case Categories.HOME -> "Assembly required: place it. That's it, that's the assembly.";
			case Categories.ELECTRONICS -> "Powered by 100% renewable redstone.";
			default -> "Packed with love by our Allay fulfillment team.";
		};
		out.add(extra);
		out.add("Delivered right next to your CubeBook — or wherever you are with \"Follow me\" delivery.");
		return out;
	}

	private int drawReviews(GuiGraphics g, Product p, int width, int y) {
		int x = 6, w = width - 12;
		int n = 5 + (int) (Kit.rand(p.id(), 11) * 3);
		int h = 64 + n * 52;
		Gfx.rect(g, x, y, w, h, CARD);
		Gfx.text(g, "Customer reviews", x + 8, y + 8, TEXT);
		Kit.stars(g, x + 8, y + 22, p.rating(), STAR, STAR_OFF);
		Gfx.text(g, Kit.rating(p.rating()) + " out of 5 · " + Gfx.formatNumber(p.reviews()) + " global ratings", x + 52, y + 22, TEXT);
		int[] pct = histogram(p);
		for (int i = 0; i < 5; i++) {
			int ry = y + 34 + i * 0;
			int bx = x + 8 + i * Math.max(52, (w - 16) / 5);
			Gfx.text(g, (5 - i) + "★", bx, ry + 2, LINK);
			Gfx.progressBar(g, bx + 14, ry + 3, 26, 6, pct[i] / 100f, 0xFFF0F2F2, STAR);
			Gfx.text(g, pct[i] + "%", bx + 14, ry + 12, DIM);
		}
		int ry = y + 60;
		for (int i = 0; i < n; i++) {
			String who = REVIEWERS[(int) (Kit.rand(p.id(), 20 + i) * REVIEWERS.length)];
			int stars = Math.max(10, Math.min(50, (p.rating() + (int) ((Kit.rand(p.id(), 40 + i) - 0.35) * 30)) / 10 * 10));
			Gfx.roundRect(g, x + 8, ry, 12, 12, 6, Gfx.lerp(0xFF5C6BC0, 0xFFEF6C00, (float) Kit.rand(who, 1)));
			Gfx.textCentered(g, Kit.initial(who), x + 14, ry + 2, 0xFFFFFFFF);
			Gfx.text(g, who, x + 24, ry + 2, TEXT);
			Kit.stars(g, x + 8, ry + 15, stars, STAR, STAR_OFF);
			Gfx.textClipped(g, reviewTitle(p, stars, i), x + 52, ry + 15, w - 70, TEXT);
			Gfx.text(g, "Reviewed on Day " + (1 + (int) (Kit.rand(p.id(), 60 + i) * 90)) + " · Verified Purchase", x + 8, ry + 26, 0xFFC45500);
			Gfx.textClipped(g, reviewBody(p, stars, i), x + 8, ry + 37, w - 20, TEXT);
			ry += 52;
		}
		return y + h + 8;
	}

	private static int[] histogram(Product p) {
		double r = p.rating() / 10.0;
		double[] raw = new double[5];
		double sum = 0;
		for (int i = 0; i < 5; i++) {
			double star = 5 - i;
			raw[i] = Math.exp(-Math.pow(star - r, 2) * 1.6) + 0.03;
			sum += raw[i];
		}
		int[] out = new int[5];
		int total = 0;
		for (int i = 0; i < 5; i++) {
			out[i] = (int) Math.round(raw[i] / sum * 100);
			total += out[i];
		}
		out[0] += 100 - total;
		return out;
	}

	private static String reviewTitle(Product p, int stars, int i) {
		String[] good = {"Exactly as described!", "My villagers are jealous", "Best purchase this side of the Nether", "10/10 would mine again",
				"Arrived faster than a creeper's fuse", "Absolutely blocktastic", "Worth every emerald"};
		String[] meh = {"Decent, but the box was slightly crushed", "Good, not great", "An Enderman stared at it all night", "Fine. Just fine."};
		String[] bad = {"A creeper blew up my delivery", "Not what I expected (I expected diamonds)", "The llama spat on it"};
		String[] pool = stars >= 40 ? good : stars >= 30 ? meh : bad;
		return pool[(int) (Kit.rand(p.id(), 80 + i) * pool.length)];
	}

	private static String reviewBody(Product p, int stars, int i) {
		String n = p.name().toLowerCase(Locale.ROOT);
		String[] good = {"Bought the " + n + " for my base and now everyone visits. Even the zombies knock first.",
				"The Allay courier was so polite. The " + n + " is great quality.",
				"I put it right next to my crafting table. Productivity is up 300%.",
				"My cat sat on it immediately, which is the highest possible rating.",
				"Gifted one to a villager. He said \"hmm\". I think he loved it."};
		String[] meh = {"It's nice but my iron golem keeps staring at it.", "Works as advertised. Delivery was quick.", "Would be 5 stars if it came in netherite."};
		String[] bad = {"Package arrived next to a creeper. You can guess the rest.", "I wanted it in pink. Life is pain."};
		String[] pool = stars >= 40 ? good : stars >= 30 ? meh : bad;
		return pool[(int) (Kit.rand(p.id(), 90 + i) * pool.length)];
	}

	// ---------------------------------------------------------------- cart

	private int drawCart(GuiGraphics g, int width, int y) {
		List<OrderLine> cart = cart();
		boolean wide = width >= 460;
		int sideW = wide ? 150 : 0;
		int x = 6, w = width - 12 - (wide ? sideW + 8 : 0);
		int lineH = 42;
		int h = 30 + Math.max(1, cart.size()) * lineH + 20;
		Gfx.rect(g, x, y, w, h, CARD);
		Gfx.textScaled(g, "Shopping Cart", x + 10, y + 8, 1.5f, TEXT);
		Gfx.textRight(g, "Price", x + w - 10, y + 14, DIM);
		int ly = y + 26;
		Gfx.rect(g, x + 10, ly, w - 20, 1, LINE);
		if (cart.isEmpty()) {
			Gfx.text(g, "Your Emerazon Cart is empty.", x + 10, ly + 10, TEXT);
			Gfx.text(g, "Even the Endermen took nothing from here.", x + 10, ly + 22, DIM);
			textLink(g, "Continue shopping", x + 10, ly + 34, LINK, "emerazon.mc");
			ly += lineH + 10;
		}
		for (OrderLine l : cart) {
			Product p = Catalog.get(l.productId()).orElseThrow();
			int iy = ly + 6;
			linkTo(g, x + 10, iy, 30, 30, "emerazon.mc/product?id=" + p.id());
			Gfx.rect(g, x + 10, iy, 30, 30, ICON_BG);
			Gfx.itemScaled(g, Kit.stack(p), x + 13, iy + 3, 1.5f);
			textLink(g, Gfx.ellipsize(p.name(), w - 120), x + 48, iy, TEXT, "emerazon.mc/product?id=" + p.id());
			Gfx.text(g, "In Stock", x + 48, iy + 10, GREEN);
			stepper(g, x + 48, iy + 21, l.quantity(), n -> saveCart(Kit.setQty(cart(), p.id(), n)));
			if (region(g, x + 108, iy + 23, Gfx.width("Delete"), 11, () -> saveCart(Kit.setQty(cart(), p.id(), 0)))) {
				Gfx.rect(g, x + 108, iy + 33, Gfx.width("Delete"), 1, LINK);
			}
			Gfx.text(g, "Delete", x + 108, iy + 24, LINK);
			int pw = Gfx.priceWidth(p.price() * l.quantity());
			Gfx.price(g, p.price() * l.quantity(), x + w - 10 - pw, iy, TEXT);
			ly += lineH;
			Gfx.rect(g, x + 10, ly, w - 20, 1, LINE);
		}
		int sub = Kit.subtotal(cart);
		String st = "Subtotal (" + Kit.units(cart) + " items): ";
		int stw = Gfx.width(st) + Gfx.priceWidth(sub);
		Gfx.text(g, st, x + w - 10 - stw, ly + 6, TEXT);
		Gfx.price(g, sub, x + w - 10 - Gfx.priceWidth(sub), ly + 5, TEXT);
		int sx = wide ? width - 6 - sideW : 6, sy = wide ? y : y + h + 8, sw = wide ? sideW : width - 12;
		Gfx.rect(g, sx, sy, sw, 76, CARD);
		if (sub >= 10) {
			Gfx.textClipped(g, "✔ Your order qualifies for", sx + 8, sy + 6, sw - 16, GREEN);
			Gfx.textClipped(g, "FREE delivery.", sx + 8, sy + 16, sw - 16, GREEN);
		} else {
			Gfx.textClipped(g, "Standard delivery is always free!", sx + 8, sy + 10, sw - 16, GREEN);
		}
		Gfx.text(g, "Subtotal: ", sx + 8, sy + 30, TEXT);
		Gfx.price(g, sub, sx + 8 + Gfx.width("Subtotal: "), sy + 29, TEXT);
		if (!cart.isEmpty()) {
			button(g, sx + 8, sy + 46, sw - 16, 18, "Proceed to checkout", YELLOW, TEXT, () -> page.navigate("emerazon.mc/checkout"));
		}
		y = Math.max(y + h, sy + 76) + 10;
		return drawRow(g, "recentcart", "Your browsing history", null, recent(), width, y);
	}

	// ---------------------------------------------------------------- checkout

	private int drawCheckout(GuiGraphics g, int width, int y) {
		List<OrderLine> cart = cart();
		if (cart.isEmpty() && !placing) {
			return drawCart(g, width, y);
		}
		CompoundTag st = page.siteState();
		boolean follow = st.getBooleanOr("follow", false);
		DeliveryOption opt = st.getBooleanOr("express", false) ? DeliveryOption.EXPRESS : DeliveryOption.STANDARD;
		boolean wide = width >= 480;
		int sideW = wide ? 160 : 0;
		int x = 6, w = width - 12 - (wide ? sideW + 8 : 0);
		Gfx.rect(g, 0, y - 8, width, 22, 0xFFF6F6F6);
		Gfx.textScaled(g, "Checkout (" + Kit.units(cart) + " items)", 10, y - 2, 1.0f, TEXT);
		y += 20;
		if (error != null) {
			Gfx.rect(g, x, y, w, 24, 0xFFFFF5F5);
			Gfx.border(g, x, y, w, 24, 0xFFCC0C39);
			Gfx.text(g, "⚠ There was a problem", x + 8, y + 3, 0xFFCC0C39);
			Gfx.textClipped(g, error, x + 8, y + 13, w - 16, TEXT);
			y += 30;
		}
		// 1. address
		Gfx.rect(g, x, y, w, 58, CARD);
		Gfx.text(g, "1  Delivery address", x + 8, y + 7, TEXT);
		BlockPos lp = page.app().laptopPos();
		y += 20;
		radio(g, x + 10, y, w - 20, !follow, "Next to my CubeBook", "Laptop at " + lp.getX() + ", " + lp.getY() + ", " + lp.getZ(), () -> {
			st.putBoolean("follow", false);
			page.saveSiteState();
		});
		radio(g, x + 10, y + 18, w - 20, follow, "Wherever I am (Follow me)", "A courier finds you anywhere in the world", () -> {
			st.putBoolean("follow", true);
			page.saveSiteState();
		});
		y += 44;
		// 2. speed
		Gfx.rect(g, x, y, w, 58, CARD);
		Gfx.text(g, "2  Choose a delivery option", x + 8, y + 7, TEXT);
		y += 20;
		radio(g, x + 10, y, w - 20, opt == DeliveryOption.STANDARD, "FREE Standard delivery", "Arrives in " + Catalog.EMERAZON_STANDARD_SECONDS + " seconds", () -> {
			st.putBoolean("express", false);
			page.saveSiteState();
		});
		radio(g, x + 10, y + 18, w - 20, opt == DeliveryOption.EXPRESS, "Prime Express — ◆" + Catalog.EMERAZON_EXPRESS_FEE, "Arrives in " + Catalog.EMERAZON_EXPRESS_SECONDS + " seconds by Allay air", () -> {
			st.putBoolean("express", true);
			page.saveSiteState();
		});
		y += 44;
		// 3. items
		int ih = 22 + cart.size() * 22;
		Gfx.rect(g, x, y, w, ih, CARD);
		Gfx.text(g, "3  Review items", x + 8, y + 7, TEXT);
		int iy = y + 20;
		for (OrderLine l : cart) {
			Product p = Catalog.get(l.productId()).orElseThrow();
			Gfx.item(g, Kit.stack(p), x + 10, iy + 1);
			Gfx.textClipped(g, p.name() + "  ×" + l.quantity(), x + 30, iy + 5, w - 90, TEXT);
			int pw = Gfx.priceWidth(p.price() * l.quantity());
			Gfx.price(g, p.price() * l.quantity(), x + w - 10 - pw, iy + 4, PRICE);
			iy += 22;
		}
		y += ih + 8;
		// summary
		int sub = Kit.subtotal(cart);
		int fee = Catalog.deliveryFee(Store.EMERAZON, null, opt);
		int total = sub + fee;
		int bal = account().balance();
		int sx = wide ? width - 6 - sideW : 6, sy = wide ? TOP + 36 : y, sw = wide ? sideW : width - 12;
		Gfx.rect(g, sx, sy, sw, 120, CARD);
		Gfx.border(g, sx, sy, sw, 120, LINE);
		boolean enough = bal >= total;
		int bx = sx + 8, by = sy + 8;
		if (enough) {
			button(g, bx, by, sw - 16, 18, "Place your order", YELLOW, TEXT, () -> placeOrder(cart, opt, follow));
		} else {
			button(g, bx, by, sw - 16, 18, "Add emeralds at Emerald Bank", 0xFFE7E9EC, TEXT, () -> page.app().openUrl("emeraldbank.mc"));
		}
		by += 26;
		Gfx.text(g, "Order Summary", bx, by, TEXT);
		by += 12;
		by = summaryLine(g, "Items:", sub, bx, by, sw - 16, TEXT);
		by = summaryLine(g, "Delivery:", fee, bx, by, sw - 16, TEXT);
		Gfx.rect(g, bx, by, sw - 16, 1, LINE);
		by += 4;
		by = summaryLine(g, "Order total:", total, bx, by, sw - 16, PRICE);
		by = summaryLine(g, "Your balance:", bal, bx, by, sw - 16, enough ? GREEN : 0xFFCC0C39);
		if (!enough) {
			Gfx.textClipped(g, "You need ◆" + (total - bal) + " more.", bx, by + 2, sw - 16, 0xFFCC0C39);
		}
		return Math.max(y, sy + 128);
	}

	private int summaryLine(GuiGraphics g, String label, int amount, int x, int y, int w, int color) {
		Gfx.text(g, label, x, y, color);
		Gfx.price(g, amount, x + w - Gfx.priceWidth(amount), y - 1, color);
		return y + 12;
	}

	private void radio(GuiGraphics g, int x, int y, int w, boolean on, String label, String sub, Runnable select) {
		boolean h = region(g, x, y, w, 16, select);
		if (on || h) {
			Gfx.roundRect(g, x - 2, y - 2, w + 4, 18, 3, on ? 0xFFFCF5EE : 0xFFF7F8F8);
		}
		Gfx.roundRect(g, x, y + 1, 10, 10, 5, on ? 0xFF007185 : 0xFFFFFFFF);
		Gfx.roundBorder(g, x, y + 1, 10, 10, 5, on ? 0xFF007185 : 0xFF888C8C);
		if (on) {
			Gfx.roundRect(g, x + 3, y + 4, 4, 4, 2, 0xFFFFFFFF);
		}
		Gfx.text(g, label, x + 16, y + 3, TEXT);
		Gfx.textClipped(g, sub, x + 22 + Gfx.width(label), y + 3, w - 30 - Gfx.width(label), DIM);
	}

	private void placeOrder(List<OrderLine> cart, DeliveryOption opt, boolean follow) {
		if (placing) {
			return;
		}
		error = null;
		account().consumeLastError();
		baselineOrder = Kit.newestOrderId(account().snapshot());
		placing = true;
		placingSince = Ease.now();
		account().purchase(Store.EMERAZON, "", cart, opt, 0, follow);
	}

	@Override
	public void tick() {
		super.tick();
		if (!placing) {
			return;
		}
		String err = account().consumeLastError();
		if (err != null) {
			placing = false;
			error = err;
			return;
		}
		AccountSnapshot s = account().snapshot();
		long newest = Kit.newestOrderId(s);
		if (newest > baselineOrder) {
			placing = false;
			saveCart(List.of());
			page.navigate("emerazon.mc/order-placed?id=" + newest);
		} else if (Ease.now() - placingSince > 7000) {
			placing = false;
			error = "Emerazon didn't hear back from the server. Check your orders before trying again.";
		}
	}

	// ---------------------------------------------------------------- confirmation + orders

	private @Nullable Order order(long id) {
		for (Order o : account().snapshot().orders()) {
			if (o.id() == id) {
				return o;
			}
		}
		return null;
	}

	private int drawPlaced(GuiGraphics g, int width, int y) {
		Order o = order(url.intParam("id", -1));
		int x = 6, w = width - 12;
		Gfx.rect(g, x, y, w, 120, CARD);
		long t = Ease.now() - shownMs;
		if (t < 3500) {
			for (int i = 0; i < 40; i++) {
				double fx = Kit.rand("confetti", i);
				float fall = (t / 1000f) * (40 + (float) Kit.rand("speed", i) * 60);
				int cx = x + (int) (fx * w);
				int cy = y + (int) (fall - Kit.rand("off", i) * 40);
				if (cy > y && cy < y + 118) {
					int[] cols = {0xFFFF9900, 0xFF067D62, 0xFF007185, 0xFFCC0C39, 0xFFFFD814};
					Gfx.rect(g, cx, cy, 3, 2 + i % 2, cols[i % cols.length]);
				}
			}
		}
		Gfx.roundRect(g, x + 14, y + 14, 22, 22, 11, GREEN);
		Gfx.textCentered(g, "✔", x + 25, y + 21, 0xFFFFFFFF);
		Gfx.textScaled(g, "Order placed, thank you!", x + 44, y + 16, 1.5f, GREEN);
		if (o != null) {
			int secs = Kit.secondsLeft(o, page.app().gameTime());
			Gfx.text(g, "Order #" + o.id() + " · " + o.lines().size() + " item(s) · confirmation sent to CubeMail", x + 44, y + 34, TEXT);
			Gfx.text(g, o.status() == OrderStatus.DELIVERED ? "Delivered! Check next to " + (o.destination().isEmpty() ? "your laptop" : o.destination()) + "."
					: "Arriving in " + Kit.duration(secs) + " — " + o.destination(), x + 44, y + 46, TEXT);
			int ix = x + 44;
			for (OrderLine l : o.lines()) {
				Optional<Product> p = Catalog.get(l.productId());
				if (p.isPresent() && ix < x + w - 24) {
					Gfx.rect(g, ix, y + 60, 22, 22, ICON_BG);
					Gfx.item(g, Kit.stack(p.get()), ix + 3, y + 63);
					ix += 26;
				}
			}
		}
		button(g, x + 44, y + 92, 96, 18, "Track package", YELLOW, TEXT, () -> page.navigate("emerazon.mc/orders"));
		outlineButton(g, x + 148, y + 92, 110, 18, "Continue shopping", LINE, TEXT, 0xFFF7F8F8, () -> page.navigate("emerazon.mc"));
		return y + 130;
	}

	private int drawOrders(GuiGraphics g, int width, int y) {
		List<Order> orders = account().snapshot().orders().stream().filter(o -> o.store() == Store.EMERAZON)
				.sorted(Comparator.comparingLong(Order::id).reversed()).toList();
		Gfx.textScaled(g, "Your Orders", 8, y, 1.5f, TEXT);
		y += 18;
		if (orders.isEmpty()) {
			Gfx.rect(g, 6, y, width - 12, 50, CARD);
			Gfx.text(g, "You haven't placed any orders yet.", 16, y + 12, TEXT);
			textLink(g, "Start shopping", 16, y + 26, LINK, "emerazon.mc");
			return y + 60;
		}
		long now = page.app().gameTime();
		for (Order o : orders) {
			int x = 6, w = width - 12, h = 98;
			Gfx.rect(g, x, y, w, h, CARD);
			Gfx.border(g, x, y, w, h, LINE);
			Gfx.rect(g, x + 1, y + 1, w - 2, 22, 0xFFF0F2F2);
			Gfx.text(g, "ORDER PLACED", x + 8, y + 4, DIM);
			Gfx.text(g, Kit.when(o.placedAt()), x + 8, y + 13, TEXT);
			if (w > 300) {
				Gfx.text(g, "TOTAL", x + 108, y + 4, DIM);
				Gfx.price(g, o.total(), x + 108, y + 12, TEXT);
			}
			Gfx.textRight(g, "ORDER # " + o.id(), x + w - 8, y + 4, DIM);
			Gfx.textRight(g, Gfx.ellipsize(o.destination(), 140), x + w - 8, y + 13, TEXT);
			boolean done = o.status() == OrderStatus.DELIVERED;
			boolean cancelled = o.status() == OrderStatus.CANCELLED;
			float prog = done ? 1f : o.progress(now);
			String headline = cancelled ? "Cancelled" : done ? "Delivered" : "Arriving in " + Kit.duration(Kit.secondsLeft(o, now));
			Gfx.text(g, headline, x + 8, y + 30, cancelled ? 0xFFCC0C39 : done ? GREEN : TEXT);
			// tracker
			String[] steps = {"Ordered", "Shipped", "Out for delivery", "Delivered"};
			int tx = x + 12, tw = Math.min(w - 24, 300), ty = y + 48;
			Gfx.rect(g, tx, ty, tw, 3, 0xFFE3E6E6);
			Gfx.rect(g, tx, ty, (int) (tw * prog), 3, done ? GREEN : 0xFF007185);
			for (int i = 0; i < 4; i++) {
				int dx = tx + tw * i / 3;
				boolean reached = prog >= i / 3f - 0.001f;
				Gfx.roundRect(g, dx - 4, ty - 3, 9, 9, 4, reached ? (done ? GREEN : 0xFF007185) : 0xFFD5D9D9);
				String s = steps[i];
				int sw = Gfx.width(s);
				int lx = i == 0 ? dx - 4 : i == 3 ? dx + 4 - sw : dx - sw / 2;
				if (tw > 200 || i == 0 || i == 3) {
					Gfx.text(g, s, lx, ty + 9, reached ? TEXT : DIM);
				}
			}
			if (!done && !cancelled) {
				int cx = tx + (int) (tw * prog);
				Gfx.itemScaled(g, new ItemStack(net.minecraft.world.item.Items.MINECART), cx - 6, ty - 14, 0.75f);
			}
			int ix = x + 8;
			for (OrderLine l : o.lines()) {
				Optional<Product> p = Catalog.get(l.productId());
				if (p.isPresent() && ix < x + w - 110) {
					Gfx.item(g, Kit.stack(p.get()), ix, y + 72);
					if (l.quantity() > 1) {
						Gfx.text(g, "×" + l.quantity(), ix + 12, y + 82, DIM);
					}
					ix += 24;
				}
			}
			button(g, x + w - 92, y + 72, 84, 16, "Buy it again", YELLOW, TEXT, () -> {
				List<OrderLine> c = cart();
				for (OrderLine l : o.lines()) {
					if (Catalog.get(l.productId()).isPresent()) {
						c = Kit.addToCart(c, l.productId(), l.quantity());
					}
				}
				saveCart(c);
				page.navigate("emerazon.mc/cart");
			});
			y += h + 8;
		}
		return y;
	}

	private int drawNotFound(GuiGraphics g, int width, int y) {
		int x = 6, w = width - 12;
		Gfx.rect(g, x, y, w, 120, CARD);
		Gfx.textScaled(g, "SORRY", x + 16, y + 16, 2f, TEXT);
		Gfx.text(g, "we couldn't find that page", x + 16, y + 36, TEXT);
		Gfx.text(g, "Try searching or go to Emerazon's home page.", x + 16, y + 50, DIM);
		textLink(g, "Emerazon home", x + 16, y + 64, LINK, "emerazon.mc");
		Gfx.itemScaled(g, new ItemStack(net.minecraft.world.item.Items.BONE), x + w - 90, y + 20, 4f);
		Gfx.textRight(g, "Meet Rex, one of the Wolves of Emerazon", x + w - 10, y + 100, DIM);
		return y + 130;
	}
}
