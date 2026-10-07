package com.laptopcraft.client.web.sites.endereats;

import com.laptopcraft.account.AccountSnapshot;
import com.laptopcraft.account.Order;
import com.laptopcraft.account.OrderLine;
import com.laptopcraft.account.OrderStatus;
import com.laptopcraft.client.os.AccountView;
import com.laptopcraft.client.os.Icons;
import com.laptopcraft.client.os.ui.Ease;
import com.laptopcraft.client.os.ui.Gfx;
import com.laptopcraft.client.web.WebUrl;
import com.laptopcraft.client.web.kit.Kit;
import com.laptopcraft.client.web.kit.KitPage;
import com.laptopcraft.shop.Catalog;
import com.laptopcraft.shop.Categories;
import com.laptopcraft.shop.DeliveryOption;
import com.laptopcraft.shop.Product;
import com.laptopcraft.shop.Restaurant;
import com.laptopcraft.shop.Store;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.world.item.ItemStack;
import org.jspecify.annotations.Nullable;

/** Every Ender Eats page: home, restaurant menu, cart/checkout, live tracking and order history. */
public class EnderEatsPage extends KitPage {
	static final int BG = 0xFF0F0B16, CARD = 0xFF1B1526, CARD2 = 0xFF251D33, TEXT = 0xFFF4F0FA, DIM = 0xFFA79FB5, GREEN = 0xFF3DDC97,
			PURPLE = 0xFFB06BFF, PURPLE_DK = 0xFF5B2A86, LINE = 0xFF33294A, GOLD = 0xFFFFC94D, RED = 0xFFFF5C7A;
	private static final int HEADER = 28;
	private static final int[] TIPS = {0, 1, 2, 3, 5};

	private final EnderEatsSite site;
	private final WebUrl url;
	private final long shownMs = Ease.now();
	private int docHeight;
	private String cuisine = "All";
	private boolean placing;
	private long placingSince;
	private long baselineOrder;
	private @Nullable String error;

	public EnderEatsPage(EnderEatsSite site, WebUrl url) {
		this.site = site;
		this.url = url;
	}

	@Override
	public String title() {
		return switch (url.path()) {
			case "restaurant" -> Catalog.restaurant(url.param("id", "")).map(r -> r.name() + " · Ender Eats").orElse("Ender Eats");
			case "cart" -> "Your order · Ender Eats";
			case "track" -> "Tracking your order · Ender Eats";
			case "orders" -> "Past orders · Ender Eats";
			default -> "Ender Eats: Food, teleported.";
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

	private AccountView account() {
		return page.app().account();
	}

	private CompoundTag state() {
		return page.siteState();
	}

	private List<OrderLine> cart() {
		return Kit.readCart(state());
	}

	private String cartRestaurant() {
		return state().getStringOr("restaurant", "");
	}

	private void saveCart(String restaurantId, List<OrderLine> cart) {
		Kit.writeCart(state(), cart);
		state().putString("restaurant", cart.isEmpty() ? "" : restaurantId);
		page.saveSiteState();
	}

	private boolean followMe() {
		return state().getBooleanOr("follow", false);
	}

	private void add(Restaurant r, Product p) {
		String current = cartRestaurant();
		if (!current.isEmpty() && !current.equals(r.id()) && !cart().isEmpty()) {
			String other = Catalog.restaurant(current).map(Restaurant::name).orElse("another restaurant");
			page.app().confirm("Start a new order?", "Your cart has items from " + other + ". Clear it and add " + p.name() + " from " + r.name() + "?",
					() -> saveCart(r.id(), Kit.addToCart(List.of(), p.id(), 1)));
			return;
		}
		saveCart(r.id(), Kit.addToCart(cart(), p.id(), 1));
	}

	private int qtyInCart(String productId) {
		for (OrderLine l : cart()) {
			if (l.productId().equals(productId)) {
				return l.quantity();
			}
		}
		return 0;
	}

	// ---------------------------------------------------------------- frame

	@Override
	protected void draw(GuiGraphics g, int width, int vh, int scrollY, float pt) {
		int y = HEADER + 10;
		y = switch (url.path()) {
			case "restaurant" -> drawRestaurant(g, width, HEADER);
			case "cart" -> drawCart(g, width, y);
			case "track" -> drawTrack(g, width, y);
			case "orders" -> drawOrders(g, width, y);
			default -> drawHome(g, width, y);
		};
		y += 14;
		Gfx.rect(g, 0, y, width, 30, 0xFF08060C);
		Gfx.textCentered(g, "Ender Eats · Couriers never look you in the eye · © 1.21.11", width / 2, y + 11, DIM);
		docHeight = y + 30;
		drawHeader(g, width, scrollY);
	}

	@Override
	protected void drawOverlay(GuiGraphics g, int width, int vh, int scrollY, float pt) {
		if (placing) {
			Gfx.rect(g, 0, scrollY, width, vh, 0xB00F0B16);
			Gfx.spinner(g, width / 2, scrollY + vh / 2 - 10, 10, PURPLE);
			Gfx.textCentered(g, "Summoning a courier…", width / 2, scrollY + vh / 2 + 8, TEXT);
		}
	}

	private void drawHeader(GuiGraphics g, int width, int sy) {
		Gfx.rect(g, 0, sy, width, HEADER, 0xF2120D1B);
		Gfx.rect(g, 0, sy + HEADER - 1, width, 1, LINE);
		int lw = Gfx.textureFit(g, site.logo(), 8, sy + 4, 96, 20);
		linkTo(g, 6, sy + 2, lw + 4, 24, "endereats.mc");
		int x = 8 + lw + 10;
		boolean follow = followMe();
		String addr = follow ? "☺ Follow me" : "⌂ My laptop";
		int aw = Gfx.width(addr) + 22;
		if (width > 360) {
			boolean h = region(g, x, sy + 6, aw, 16, () -> {
				state().putBoolean("follow", !followMe());
				page.saveSiteState();
			});
			Gfx.roundRect(g, x, sy + 6, aw, 16, 8, h ? CARD2 : CARD);
			Gfx.text(g, addr + " ▾", x + 8, sy + 10, TEXT);
			x += aw + 8;
		}
		List<OrderLine> cart = cart();
		int units = Kit.units(cart);
		String cs = units == 0 ? "Cart" : units + " · ◆" + Kit.subtotal(cart);
		int cw = Gfx.width(cs) + 30;
		int cx = width - 8 - cw;
		boolean ch = region(g, cx, sy + 5, cw, 18, () -> page.navigate("endereats.mc/cart"));
		Gfx.roundRect(g, cx, sy + 5, cw, 18, 9, units > 0 ? (ch ? Gfx.lighten(GREEN, 0.1f) : GREEN) : (ch ? CARD2 : CARD));
		Gfx.icon(g, Icons.CART, cx + 6, sy + 8, 12, units > 0 ? 0xFF0F0B16 : TEXT);
		Gfx.text(g, cs, cx + 22, sy + 10, units > 0 ? 0xFF0F0B16 : TEXT);
		int ow = Gfx.width("Orders") + 12;
		if (cx - ow - 6 > x) {
			boolean oh = region(g, cx - ow - 6, sy + 5, ow, 18, () -> page.navigate("endereats.mc/orders"));
			Gfx.roundRect(g, cx - ow - 6, sy + 5, ow, 18, 9, oh ? CARD2 : CARD);
			Gfx.text(g, "Orders", cx - ow, sy + 10, TEXT);
		}
	}

	// ---------------------------------------------------------------- home

	private int drawHome(GuiGraphics g, int width, int y) {
		long dt = page.app().dayTime() % 24000;
		String greet = dt < 6000 ? "Good morning" : dt < 12000 ? "Good afternoon" : dt < 18000 ? "Good evening" : "Late-night cravings";
		Gfx.textScaled(g, greet + ", " + page.app().username() + "!", 12, y, 1.5f, TEXT);
		Gfx.text(g, "What are you hungry for? Endermen are standing by.", 12, y + 16, DIM);
		y += 32;
		// promo banner
		int bh = 56;
		Gfx.gradientH(g, 10, y, width - 20, bh, PURPLE_DK, 0xFF1E6B57);
		float p = Ease.pulse(2400);
		for (int i = 0; i < 14; i++) {
			int px = 10 + (int) (Kit.rand("promo", i) * (width - 30));
			int py = y + 4 + (int) ((Kit.rand("promoY", i) * bh + (Ease.now() / 60.0)) % (bh - 8));
			Gfx.rect(g, px, py, 2, 2, Gfx.withAlpha(0xFFE7B6FF, (int) (120 + 100 * p)));
		}
		Gfx.textScaledShadow(g, "Priority Teleport", 22, y + 10, 2f, TEXT);
		Gfx.textClippedShadow(g, "Twice as fast for ◆" + Catalog.ENDER_EATS_PRIORITY_FEE + ". The Endermen insist.", 22, y + 32, width / 2 + 40, 0xFFE9DDF7);
		Gfx.itemScaled(g, new ItemStack(net.minecraft.world.item.Items.ENDER_PEARL), width - 80, y + 8, 2.5f);
		y += bh + 12;
		// cuisine chips
		Set<String> cuisines = new LinkedHashSet<>();
		cuisines.add("All");
		for (Restaurant r : Catalog.restaurants()) {
			cuisines.add(r.cuisine().split("[·,]")[0].trim());
		}
		int cx = 10;
		for (String c : cuisines) {
			int cw = Gfx.width(c) + 16;
			if (cx + cw > width - 10) {
				cx = 10;
				y += 20;
			}
			boolean sel = c.equals(cuisine);
			boolean h = region(g, cx, y, cw, 16, () -> cuisine = c);
			Gfx.roundRect(g, cx, y, cw, 16, 8, sel ? TEXT : h ? CARD2 : CARD);
			Gfx.text(g, c, cx + 8, y + 4, sel ? BG : TEXT);
			cx += cw + 6;
		}
		y += 26;
		Gfx.text(g, cuisine.equals("All") ? "All restaurants" : cuisine + " near you", 12, y, TEXT);
		y += 14;
		List<Restaurant> list = Catalog.restaurants().stream()
				.filter(r -> cuisine.equals("All") || r.cuisine().toLowerCase(Locale.ROOT).contains(cuisine.toLowerCase(Locale.ROOT))).toList();
		int cols = Math.max(1, Math.min(3, (width - 20) / 170));
		int cw = (width - 20 - (cols - 1) * 10) / cols, ch = 104;
		for (int i = 0; i < list.size(); i++) {
			Restaurant r = list.get(i);
			int x = 10 + (i % cols) * (cw + 10), ry = y + (i / cols) * (ch + 10);
			boolean h = linkTo(g, x, ry, cw, ch, "endereats.mc/restaurant?id=" + r.id());
			int lift = h ? -2 : 0;
			Gfx.roundRect(g, x, ry + lift, cw, ch, 6, CARD);
			Gfx.roundRect(g, x, ry + lift, cw, 54, 6, r.accentColor(), Gfx.TOP);
			Gfx.gradientV(g, x, ry + lift + 24, cw, 30, 0x00000000, 0x55000000);
			Gfx.itemScaled(g, new ItemStack(r.iconItem()), x + cw / 2 - 20, ry + lift + 7, 2.5f);
			if (r.deliveryFee() == 0) {
				Gfx.roundRect(g, x + 6, ry + lift + 6, Gfx.width("Free delivery") + 8, 12, 6, GREEN);
				Gfx.text(g, "Free delivery", x + 10, ry + lift + 8, BG);
			}
			Gfx.textClipped(g, r.name(), x + 8, ry + lift + 60, cw - 50, TEXT);
			Gfx.roundRect(g, x + cw - 36, ry + lift + 58, 28, 12, 6, CARD2);
			Gfx.text(g, Kit.rating(r.rating()), x + cw - 30, ry + lift + 60, TEXT);
			Gfx.textClipped(g, r.cuisine(), x + 8, ry + lift + 72, cw - 16, DIM);
			String eta = "≈" + r.etaSeconds() + "s · " + (r.deliveryFee() == 0 ? "◆0 delivery" : "◆" + r.deliveryFee() + " delivery");
			Gfx.textClipped(g, eta, x + 8, ry + lift + 84, cw - 16, DIM);
			Gfx.text(g, "★", x + cw - 46, ry + lift + 60, GOLD);
		}
		return y + ((list.size() + cols - 1) / cols) * (ch + 10);
	}

	// ---------------------------------------------------------------- restaurant

	private int drawRestaurant(GuiGraphics g, int width, int y) {
		Optional<Restaurant> or = Catalog.restaurant(url.param("id", ""));
		if (or.isEmpty()) {
			Gfx.textCentered(g, "This restaurant teleported away. Try another!", width / 2, y + 40, TEXT);
			textLink(g, "Back to all restaurants", width / 2 - 50, y + 56, GREEN, "endereats.mc");
			return y + 80;
		}
		Restaurant r = or.get();
		int bh = 92;
		Gfx.gradientV(g, 0, y, width, bh, r.accentColor(), Gfx.darken(r.accentColor(), 0.55f));
		float bob = (float) Math.sin(Ease.now() / 600.0) * 2;
		Gfx.itemScaled(g, new ItemStack(r.iconItem()), width - 92, y + 14 + (int) bob, 4f);
		Gfx.textScaledShadow(g, r.name(), 14, y + 16, 2f, 0xFFFFFFFF);
		Gfx.textClippedShadow(g, r.tagline(), 14, y + 38, width - 120, 0xFFF0F0F0);
		String meta = "★ " + Kit.rating(r.rating()) + "  ·  " + r.cuisine() + "  ·  ≈" + r.etaSeconds() + "s  ·  " + (r.deliveryFee() == 0 ? "Free delivery" : "◆" + r.deliveryFee() + " delivery");
		Gfx.roundRect(g, 12, y + 56, Math.min(width - 120, Gfx.width(meta) + 12), 16, 8, 0x66000000);
		Gfx.textClipped(g, meta, 18, y + 60, width - 132, 0xFFFFFFFF);
		y += bh + 10;
		textLink(g, "← All restaurants", 12, y, GREEN, "endereats.mc");
		y += 16;
		List<Product> menu = Catalog.menu(r.id());
		List<String> sections = new ArrayList<>();
		for (String s : new String[] {Categories.MENU_MAINS, Categories.MENU_SIDES, Categories.MENU_DRINKS, Categories.MENU_DESSERTS}) {
			if (menu.stream().anyMatch(p -> p.category().equals(s))) {
				sections.add(s);
			}
		}
		menu.stream().map(Product::category).distinct().filter(s -> !sections.contains(s)).forEach(sections::add);
		int cols = width >= 460 ? 2 : 1;
		int cw = (width - 20 - (cols - 1) * 10) / cols, rh = 56;
		for (String s : sections) {
			Gfx.textScaled(g, s, 12, y, 1.5f, TEXT);
			y += 18;
			List<Product> items = menu.stream().filter(p -> p.category().equals(s)).toList();
			for (int i = 0; i < items.size(); i++) {
				Product p = items.get(i);
				int x = 10 + (i % cols) * (cw + 10), iy = y + (i / cols) * (rh + 8);
				boolean h = hover(x, iy, cw, rh);
				Gfx.roundRect(g, x, iy, cw, rh, 6, h ? CARD2 : CARD);
				int textW = cw - 70;
				Gfx.textClipped(g, p.name(), x + 8, iy + 7, textW, TEXT);
				List<String> desc = Gfx.wrap(p.description(), textW);
				for (int k = 0; k < Math.min(2, desc.size()); k++) {
					Gfx.textClipped(g, k == 1 && desc.size() > 2 ? desc.get(k) + "…" : desc.get(k), x + 8, iy + 19 + k * 10, textW, DIM);
				}
				Gfx.price(g, p.price(), x + 8, iy + 41, GREEN);
				if (!p.badge().isEmpty()) {
					int bx = x + 14 + Gfx.priceWidth(p.price());
					Gfx.roundRect(g, bx, iy + 40, Gfx.width(p.badge()) + 8, 11, 5, PURPLE_DK);
					Gfx.text(g, p.badge(), bx + 4, iy + 42, 0xFFE9DDF7);
				}
				Gfx.roundRect(g, x + cw - 56, iy + 6, 44, 44, 6, 0xFF2E2540);
				Gfx.itemScaled(g, Kit.stack(p), x + cw - 50, iy + 12, 2f);
				int q = qtyInCart(p.id());
				boolean ph = region(g, x + cw - 22, iy + 36, 18, 18, () -> add(r, p));
				Gfx.roundRect(g, x + cw - 22, iy + 36, 18, 18, 9, ph ? Gfx.lighten(GREEN, 0.15f) : GREEN);
				Gfx.textCentered(g, q > 0 ? String.valueOf(q) : "+", x + cw - 13, iy + 41, BG);
			}
			y += ((items.size() + cols - 1) / cols) * (rh + 8) + 8;
		}
		return y;
	}

	// ---------------------------------------------------------------- cart + checkout

	private int drawCart(GuiGraphics g, int width, int y) {
		List<OrderLine> cart = cart();
		Optional<Restaurant> or = Catalog.restaurant(cartRestaurant());
		int w = Math.min(width - 20, 420), x = (width - w) / 2;
		Gfx.textScaled(g, "Your order", x, y, 2f, TEXT);
		y += 24;
		if (cart.isEmpty() || or.isEmpty()) {
			Gfx.roundRect(g, x, y, w, 70, 8, CARD);
			Gfx.text(g, "Your cart is empty — and so is your stomach.", x + 12, y + 16, TEXT);
			button(g, x + 12, y + 36, 120, 18, "Browse restaurants", GREEN, BG, () -> page.navigate("endereats.mc"));
			return y + 80;
		}
		Restaurant r = or.get();
		if (error != null) {
			Gfx.roundRect(g, x, y, w, 26, 6, 0xFF3A1422);
			Gfx.textClipped(g, "⚠ " + error, x + 10, y + 9, w - 20, RED);
			y += 32;
		}
		// items
		int ih = 30 + cart.size() * 24;
		Gfx.roundRect(g, x, y, w, ih, 8, CARD);
		Gfx.item(g, new ItemStack(r.iconItem()), x + 10, y + 7);
		textLink(g, r.name(), x + 30, y + 11, TEXT, "endereats.mc/restaurant?id=" + r.id());
		int iy = y + 30;
		for (OrderLine l : cart) {
			Product p = Catalog.get(l.productId()).orElseThrow();
			Gfx.item(g, Kit.stack(p), x + 10, iy);
			Gfx.textClipped(g, p.name(), x + 32, iy + 4, w - 160, TEXT);
			int sx = x + w - 130;
			miniStepper(g, sx, iy + 1, l.quantity(), n -> saveCart(r.id(), Kit.setQty(cart(), p.id(), n)));
			int pw = Gfx.priceWidth(p.price() * l.quantity());
			Gfx.price(g, p.price() * l.quantity(), x + w - 10 - pw, iy + 4, TEXT);
			iy += 24;
		}
		y += ih + 10;
		// delivery speed
		CompoundTag st = state();
		DeliveryOption opt = st.getBooleanOr("priority", false) ? DeliveryOption.EXPRESS : DeliveryOption.STANDARD;
		Gfx.roundRect(g, x, y, w, 62, 8, CARD);
		Gfx.text(g, "Delivery", x + 10, y + 8, TEXT);
		int half = (w - 30) / 2;
		choice(g, x + 10, y + 22, half, 32, opt == DeliveryOption.STANDARD, "Standard", "≈" + Catalog.deliverySeconds(Store.ENDER_EATS, r, DeliveryOption.STANDARD) + "s", () -> {
			st.putBoolean("priority", false);
			page.saveSiteState();
		});
		choice(g, x + 20 + half, y + 22, half, 32, opt == DeliveryOption.EXPRESS, "Priority Teleport ⚡", "≈" + Catalog.deliverySeconds(Store.ENDER_EATS, r, DeliveryOption.EXPRESS) + "s · +◆" + Catalog.ENDER_EATS_PRIORITY_FEE, () -> {
			st.putBoolean("priority", true);
			page.saveSiteState();
		});
		y += 70;
		// tip
		int tip = Math.min(Catalog.MAX_TIP, st.getIntOr("tip", 1));
		Gfx.roundRect(g, x, y, w, 50, 8, CARD);
		Gfx.text(g, "Tip your Enderman", x + 10, y + 8, TEXT);
		Gfx.text(g, "100% goes to Endy (he's saving up for a block of his own)", x + 10, y + 19, DIM);
		int tx = x + 10;
		for (int t : TIPS) {
			String s = t == 0 ? "None" : "◆" + t;
			int tw = Gfx.width(s) + 16;
			boolean sel = t == tip;
			boolean h = region(g, tx, y + 31, tw, 14, () -> {
				st.putInt("tip", t);
				page.saveSiteState();
			});
			Gfx.roundRect(g, tx, y + 31, tw, 14, 7, sel ? GREEN : h ? CARD2 : 0xFF2E2540);
			Gfx.text(g, s, tx + 8, y + 34, sel ? BG : TEXT);
			tx += tw + 6;
		}
		y += 58;
		// summary
		int sub = Kit.subtotal(cart);
		int fee = Catalog.deliveryFee(Store.ENDER_EATS, r, opt);
		int total = sub + fee + tip;
		int bal = account().balance();
		Gfx.roundRect(g, x, y, w, 98, 8, CARD);
		int sy = y + 8;
		sy = line(g, "Subtotal", sub, x + 10, sy, w - 20, DIM);
		sy = line(g, opt == DeliveryOption.EXPRESS ? "Delivery (Priority)" : "Delivery", fee, x + 10, sy, w - 20, DIM);
		sy = line(g, "Tip", tip, x + 10, sy, w - 20, DIM);
		Gfx.rect(g, x + 10, sy, w - 20, 1, LINE);
		sy = line(g, "Total", total, x + 10, sy + 4, w - 20, TEXT);
		String where = followMe() ? "Delivering to you, wherever you are" : "Delivering next to your laptop";
		Gfx.textClipped(g, where, x + 10, sy, w - 20, DIM);
		sy += 12;
		if (bal >= total) {
			button(g, x + 10, sy, w - 20, 18, "Place order · ◆" + total, GREEN, BG, () -> placeOrder(r, cart, opt, tip));
		} else {
			button(g, x + 10, sy, w - 20, 18, "Not enough emeralds (◆" + bal + ") — visit Emerald Bank", 0xFF3A2F4D, TEXT, () -> page.app().openUrl("emeraldbank.mc"));
		}
		return y + 106;
	}

	private int line(GuiGraphics g, String label, int amount, int x, int y, int w, int color) {
		Gfx.text(g, label, x, y, color);
		Gfx.price(g, amount, x + w - Gfx.priceWidth(amount), y - 1, color);
		return y + 12;
	}

	private void choice(GuiGraphics g, int x, int y, int w, int h, boolean on, String title, String sub, Runnable select) {
		boolean hov = region(g, x, y, w, h, select);
		Gfx.roundRect(g, x, y, w, h, 6, on ? 0xFF1F3B33 : hov ? CARD2 : 0xFF2E2540);
		if (on) {
			Gfx.roundBorder(g, x, y, w, h, 6, GREEN);
		}
		Gfx.textClipped(g, title, x + 8, y + 6, w - 16, TEXT);
		Gfx.textClipped(g, sub, x + 8, y + 18, w - 16, on ? GREEN : DIM);
	}

	private interface IntSink {
		void accept(int value);
	}

	private void miniStepper(GuiGraphics g, int x, int y, int value, IntSink set) {
		Gfx.roundRect(g, x, y, 56, 14, 7, 0xFF2E2540);
		if (region(g, x, y, 16, 14, () -> set.accept(value - 1))) {
			Gfx.roundRect(g, x, y, 16, 14, 7, CARD2);
		}
		if (region(g, x + 40, y, 16, 14, () -> set.accept(value + 1))) {
			Gfx.roundRect(g, x + 40, y, 16, 14, 7, CARD2);
		}
		Gfx.textCentered(g, "-", x + 8, y + 3, TEXT);
		Gfx.textCentered(g, String.valueOf(value), x + 28, y + 3, TEXT);
		Gfx.textCentered(g, "+", x + 48, y + 3, TEXT);
	}

	private void placeOrder(Restaurant r, List<OrderLine> cart, DeliveryOption opt, int tip) {
		if (placing) {
			return;
		}
		error = null;
		account().consumeLastError();
		baselineOrder = Kit.newestOrderId(account().snapshot());
		placing = true;
		placingSince = Ease.now();
		account().purchase(Store.ENDER_EATS, r.id(), cart, opt, tip, followMe());
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
			saveCart("", List.of());
			page.navigate("endereats.mc/track?id=" + newest);
		} else if (Ease.now() - placingSince > 7000) {
			placing = false;
			error = "No courier answered. Check your orders before trying again.";
		}
	}

	// ---------------------------------------------------------------- tracking

	private @Nullable Order order(long id) {
		for (Order o : account().snapshot().orders()) {
			if (o.id() == id) {
				return o;
			}
		}
		return null;
	}

	private int drawTrack(GuiGraphics g, int width, int y) {
		Order o = order(url.intParam("id", -1));
		if (o == null) {
			Gfx.textCentered(g, "We couldn't find that order.", width / 2, y + 30, TEXT);
			textLink(g, "See your orders", width / 2 - 36, y + 46, GREEN, "endereats.mc/orders");
			return y + 70;
		}
		Restaurant r = Catalog.restaurant(o.restaurantId()).orElse(null);
		long now = page.app().gameTime();
		boolean done = o.status() == OrderStatus.DELIVERED;
		float prog = done ? 1f : o.progress(now);
		int secs = Kit.secondsLeft(o, now);
		String status = done ? "Delivered! Enjoy your meal." : prog < 0.08f ? "Order confirmed" : prog < 0.4f ? "Preparing your food…"
				: prog < 0.5f ? "Endy picked up your order" : "Teleporting to you…";
		Gfx.textScaled(g, status, 12, y, 1.5f, done ? GREEN : TEXT);
		Gfx.text(g, done ? "Order #" + o.id() + " from " + (r == null ? "the restaurant" : r.name())
				: "Arriving in " + Kit.duration(secs) + " · Order #" + o.id(), 12, y + 16, DIM);
		y += 30;
		// map
		int mw = width - 20, mh = Math.min(170, Math.max(110, mw / 3));
		int mx0 = 10, my0 = y;
		drawMap(g, o, mx0, my0, mw, mh, prog, done);
		y += mh + 10;
		// timeline
		String[] steps = {"Confirmed", "Preparing", "Picked up", "Teleporting", "Delivered"};
		float[] at = {0f, 0.08f, 0.4f, 0.5f, 1f};
		int tw = mw - 20, tx = mx0 + 10;
		Gfx.roundRect(g, mx0, y, mw, 36, 8, CARD);
		Gfx.rect(g, tx, y + 11, tw, 2, LINE);
		Gfx.rect(g, tx, y + 11, (int) (tw * prog), 2, GREEN);
		for (int i = 0; i < steps.length; i++) {
			int dx = tx + (int) (tw * (i / (float) (steps.length - 1)));
			boolean reached = prog >= at[i] - 0.0001f && (i < steps.length - 1 || done);
			Gfx.roundRect(g, dx - 4, y + 8, 8, 8, 4, reached ? GREEN : 0xFF3A2F4D);
			int sw = Gfx.width(steps[i]);
			int lx = i == 0 ? dx - 4 : i == steps.length - 1 ? dx + 4 - sw : dx - sw / 2;
			if (tw > 260 || i % 2 == 0) {
				Gfx.text(g, steps[i], lx, y + 21, reached ? TEXT : DIM);
			}
		}
		y += 44;
		// courier + summary
		int cw = width >= 460 ? (mw - 10) / 2 : mw;
		Gfx.roundRect(g, mx0, y, cw, 60, 8, CARD);
		enderHead(g, mx0 + 10, y + 12, 4);
		Gfx.text(g, "Endy", mx0 + 50, y + 12, TEXT);
		Gfx.text(g, "★ 4.97 · 12,403 teleports", mx0 + 50, y + 24, DIM);
		Gfx.textClipped(g, "\"Please don't look me in the eyes.\"", mx0 + 50, y + 38, cw - 60, PURPLE);
		int sx = width >= 460 ? mx0 + cw + 10 : mx0;
		int sy = width >= 460 ? y : y + 70;
		int lh = 22 + o.lines().size() * 18;
		Gfx.roundRect(g, sx, sy, cw, Math.max(60, lh + 14), 8, CARD);
		Gfx.text(g, "Your order", sx + 10, sy + 8, TEXT);
		int ly = sy + 22;
		for (OrderLine l : o.lines()) {
			Optional<Product> p = Catalog.get(l.productId());
			if (p.isPresent()) {
				Gfx.item(g, Kit.stack(p.get()), sx + 10, ly - 4);
				Gfx.textClipped(g, l.quantity() + "× " + p.get().name(), sx + 30, ly, cw - 40, DIM);
			}
			ly += 18;
		}
		Gfx.text(g, "Total", sx + 10, ly, TEXT);
		Gfx.price(g, o.total(), sx + cw - 10 - Gfx.priceWidth(o.total()), ly - 1, TEXT);
		y = Math.max(y + 60, sy + Math.max(60, lh + 14)) + 10;
		if (done) {
			int rating = state().getIntOr("rated/" + o.id(), 0);
			Gfx.roundRect(g, mx0, y, mw, 40, 8, CARD);
			Gfx.text(g, rating == 0 ? "How was it? Rate your delivery:" : "Thanks for rating! Endy blushed (purple).", mx0 + 10, y + 8, TEXT);
			for (int i = 1; i <= 5; i++) {
				int stars = i;
				int sxx = mx0 + 10 + (i - 1) * 16;
				boolean h = region(g, sxx, y + 20, 14, 14, () -> {
					state().putInt("rated/" + o.id(), stars);
					page.saveSiteState();
				});
				Gfx.textScaled(g, "★", sxx, y + 20, 1.5f, (h || stars <= rating) ? GOLD : 0xFF4A3F5E);
			}
			if (r != null) {
				button(g, mx0 + mw - 110, y + 12, 100, 18, "Order again", GREEN, BG, () -> {
					List<OrderLine> c = new ArrayList<>();
					for (OrderLine l : o.lines()) {
						c = Kit.addToCart(c, l.productId(), l.quantity());
					}
					saveCart(r.id(), c);
					page.navigate("endereats.mc/cart");
				});
			}
			y += 48;
		}
		return y;
	}

	private void drawMap(GuiGraphics g, Order o, int x, int y, int w, int h, float prog, boolean done) {
		String seed = "order" + o.id();
		Gfx.scissor(g, x, y, w, h);
		Gfx.rect(g, x, y, w, h, 0xFF3F7A3A);
		int tile = 8;
		for (int ty = 0; ty < h; ty += tile) {
			for (int tx = 0; tx < w; tx += tile) {
				double n = Kit.rand(seed, tx * 131 + ty);
				if (n < 0.18) {
					Gfx.rect(g, x + tx, y + ty, tile, tile, n < 0.06 ? 0xFF356B31 : 0xFF46853F);
				}
			}
		}
		// lake
		int lx = x + (int) (Kit.rand(seed, 1) * (w - 80)) + 20, ly = y + (int) (Kit.rand(seed, 2) * (h - 50)) + 10;
		Gfx.roundRect(g, lx, ly, 56, 30, 8, 0xFF2F6FB0);
		Gfx.roundRect(g, lx + 6, ly + 4, 40, 6, 3, 0xFF4D8BCB);
		// roads: two horizontal, three vertical
		int[] rows = {y + h / 3, y + h * 2 / 3};
		int[] colsX = {x + w / 6, x + w / 2, x + w * 5 / 6};
		for (int ry : rows) {
			Gfx.rect(g, x, ry - 4, w, 8, 0xFF6B6B6B);
			for (int dx = 0; dx < w; dx += 14) {
				Gfx.rect(g, x + dx, ry, 6, 1, 0xFFD9D9D9);
			}
		}
		for (int cx : colsX) {
			Gfx.rect(g, cx - 4, y, 8, h, 0xFF6B6B6B);
		}
		// trees + houses
		for (int i = 0; i < 26; i++) {
			int tx = x + (int) (Kit.rand(seed, 100 + i) * (w - 8));
			int ty = y + (int) (Kit.rand(seed, 200 + i) * (h - 8));
			if (i % 3 == 0) {
				Gfx.rect(g, tx, ty, 9, 7, 0xFF9C6B3F);
				Gfx.rect(g, tx - 1, ty - 3, 11, 3, 0xFF7A3B2E);
			} else {
				Gfx.rect(g, tx + 2, ty + 4, 2, 3, 0xFF5B3A1E);
				Gfx.roundRect(g, tx, ty, 6, 5, 2, 0xFF2C5E27);
			}
		}
		// route: restaurant (left road, top row) → home (right road, bottom row)
		int ax = colsX[0], ay = rows[0], bx = colsX[2], by = rows[1];
		int[][] pts = {{ax, ay}, {colsX[1], ay}, {colsX[1], by}, {bx, by}};
		float total = 0;
		float[] seg = new float[pts.length - 1];
		for (int i = 0; i < seg.length; i++) {
			seg[i] = Math.abs(pts[i + 1][0] - pts[i][0]) + Math.abs(pts[i + 1][1] - pts[i][1]);
			total += seg[i];
		}
		// route line (traveled part green)
		float travel = prog < 0.4f ? 0 : Math.min(1f, (prog - 0.4f) / 0.6f);
		float remaining = travel * total;
		for (int i = 0; i < seg.length; i++) {
			int x1 = Math.min(pts[i][0], pts[i + 1][0]), x2 = Math.max(pts[i][0], pts[i + 1][0]);
			int y1 = Math.min(pts[i][1], pts[i + 1][1]), y2 = Math.max(pts[i][1], pts[i + 1][1]);
			Gfx.rect(g, x1 - 1, y1 - 1, x2 - x1 + 3, y2 - y1 + 3, 0xFFB06BFF);
		}
		int cx = ax, cy = ay;
		for (int i = 0; i < seg.length; i++) {
			float part = Math.min(remaining, seg[i]);
			float f = seg[i] == 0 ? 0 : part / seg[i];
			int ex = (int) (pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f), ey = (int) (pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f);
			Gfx.rect(g, Math.min(pts[i][0], ex) - 1, Math.min(pts[i][1], ey) - 1, Math.abs(ex - pts[i][0]) + 3, Math.abs(ey - pts[i][1]) + 3, GREEN);
			cx = ex;
			cy = ey;
			remaining -= part;
			if (remaining <= 0) {
				break;
			}
		}
		// pins
		pin(g, ax, ay, 0xFFFF7043, "R");
		pin(g, bx, by, GREEN, "⌂");
		if (!done) {
			// teleport sparkle burst every ~1.6 s
			float phase = (Ease.now() % 1600) / 1600f;
			for (int i = 0; i < 8; i++) {
				double ang = i / 8.0 * Math.PI * 2 + phase * 2;
				int rr = (int) (4 + phase * 10);
				int px = cx + (int) (Math.cos(ang) * rr), py = cy + (int) (Math.sin(ang) * rr);
				Gfx.rect(g, px, py, 2, 2, Gfx.withAlpha(0xFFD58CFF, (int) (255 * (1 - phase))));
			}
			enderHead(g, cx - 6, cy - 6, 1.5f);
		}
		Gfx.endScissor(g);
		Gfx.roundBorder(g, x, y, w, h, 4, LINE);
		if (o.status() == OrderStatus.DELIVERED) {
			Gfx.roundRect(g, x + w / 2 - 50, y + h / 2 - 10, 100, 20, 10, 0xE01B1526);
			Gfx.textCentered(g, "✔ Delivered", x + w / 2, y + h / 2 - 4, GREEN);
		}
	}

	private void pin(GuiGraphics g, int x, int y, int color, String label) {
		Gfx.roundRect(g, x - 7, y - 16, 14, 14, 7, color);
		Gfx.rect(g, x - 1, y - 3, 2, 4, color);
		Gfx.textCentered(g, label, x, y - 13, 0xFFFFFFFF);
	}

	/** Pixel Enderman head (8x8 base, scaled). */
	private static void enderHead(GuiGraphics g, int x, int y, float scale) {
		int px = Math.max(1, Math.round(scale));
		int size = px * 8;
		Gfx.rect(g, x, y, size, size, 0xFF151017);
		Gfx.rect(g, x, y + px * 5, size, px, 0xFF1F1724);
		Gfx.rect(g, x + px, y + px * 4, px * 2, px, 0xFFE07BFF);
		Gfx.rect(g, x + px * 5, y + px * 4, px * 2, px, 0xFFE07BFF);
		Gfx.rect(g, x + px * 2, y + px * 4, px, px, 0xFFB43EE0);
		Gfx.rect(g, x + px * 5, y + px * 4, px, px, 0xFFB43EE0);
	}

	// ---------------------------------------------------------------- orders

	private int drawOrders(GuiGraphics g, int width, int y) {
		List<Order> orders = account().snapshot().orders().stream().filter(o -> o.store() == Store.ENDER_EATS)
				.sorted(Comparator.comparingLong(Order::id).reversed()).toList();
		int w = Math.min(width - 20, 460), x = (width - w) / 2;
		Gfx.textScaled(g, "Your orders", x, y, 2f, TEXT);
		y += 24;
		if (orders.isEmpty()) {
			Gfx.roundRect(g, x, y, w, 50, 8, CARD);
			Gfx.text(g, "No orders yet. Your stomach is filing a complaint.", x + 12, y + 12, TEXT);
			textLink(g, "Find something tasty", x + 12, y + 28, GREEN, "endereats.mc");
			return y + 60;
		}
		long now = page.app().gameTime();
		for (Order o : orders) {
			Restaurant r = Catalog.restaurant(o.restaurantId()).orElse(null);
			boolean done = o.status() == OrderStatus.DELIVERED;
			boolean h = linkTo(g, x, y, w, 46, "endereats.mc/track?id=" + o.id());
			Gfx.roundRect(g, x, y, w, 46, 8, h ? CARD2 : CARD);
			Gfx.roundRect(g, x + 8, y + 7, 32, 32, 6, r == null ? CARD2 : r.accentColor());
			if (r != null) {
				Gfx.item(g, new ItemStack(r.iconItem()), x + 16, y + 15);
			}
			Gfx.textClipped(g, r == null ? "Restaurant" : r.name(), x + 48, y + 9, w - 140, TEXT);
			Gfx.textClipped(g, Kit.when(o.placedAt()) + " · " + Kit.units(o.lines()) + " items", x + 48, y + 21, w - 140, DIM);
			String st = done ? "Delivered" : o.status() == OrderStatus.CANCELLED ? "Cancelled" : "Arriving in " + Kit.duration(Kit.secondsLeft(o, now));
			Gfx.textClipped(g, st, x + 48, y + 32, w - 140, done ? GREEN : PURPLE);
			Gfx.price(g, o.total(), x + w - 12 - Gfx.priceWidth(o.total()), y + 9, TEXT);
			Gfx.textRight(g, done ? "Details ›" : "Track ›", x + w - 12, y + 30, GREEN);
			y += 52;
		}
		return y;
	}
}
