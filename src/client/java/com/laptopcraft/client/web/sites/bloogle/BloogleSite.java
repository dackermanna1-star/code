package com.laptopcraft.client.web.sites.bloogle;

import com.laptopcraft.account.Order;
import com.laptopcraft.client.os.Icons;
import com.laptopcraft.client.os.ui.Ease;
import com.laptopcraft.client.os.ui.Gfx;
import com.laptopcraft.client.os.ui.TextField;
import com.laptopcraft.client.web.PlaceholderSite;
import com.laptopcraft.client.web.Site;
import com.laptopcraft.client.web.SiteRegistry;
import com.laptopcraft.client.web.WebPage;
import com.laptopcraft.client.web.WebUrl;
import com.laptopcraft.client.web.kit.Kit;
import com.laptopcraft.client.web.kit.KitPage;
import com.laptopcraft.client.web.sites.blocktube.Videos;
import com.laptopcraft.shop.Catalog;
import com.laptopcraft.shop.Product;
import com.laptopcraft.shop.Restaurant;
import com.laptopcraft.shop.Store;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.core.BlockPos;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import org.jspecify.annotations.Nullable;

/** Bloogle (bloogle.mc) — the browser home page and search engine over sites, products, food and videos. */
public class BloogleSite extends PlaceholderSite {
	public BloogleSite() {
		super("bloogle.mc", "Bloogle", "Search the whole Overworld in a blink.", "bloogle", "bloogle_logo", 0xFF4285F4, List.of("search", "find", "web", "google"));
	}

	@Override
	public WebPage createPage(WebUrl url) {
		return new BlooglePage(this, url);
	}

	static final class BlooglePage extends KitPage {
		private static final int TEXT = 0xFF202124, DIM = 0xFF70757A, LINK = 0xFF1A0DAB, URLC = 0xFF006621, LINE = 0xFFDADCE0;
		private final BloogleSite site;
		private final WebUrl url;
		private final TextField box = new TextField("Search Bloogle or type a URL");
		private int docHeight;

		private record Result(String title, String url, String snippet, @Nullable ItemStack icon, @Nullable String extra) {
		}

		BlooglePage(BloogleSite site, WebUrl url) {
			this.site = site;
			this.url = url;
		}

		private boolean results() {
			return url.path().equals("search");
		}

		@Override
		public void init() {
			box.searchIcon = true;
			box.clearButton = true;
			box.maxLength = 80;
			box.setText(url.param("q", ""));
			box.onEnter = q -> {
				String t = q.trim();
				if (t.isEmpty()) {
					return;
				}
				if (!t.contains(" ") && t.contains(".") && SiteRegistry.get(WebUrl.parse(t).host()) != null) {
					page.navigate(t);
				} else {
					page.navigate("bloogle.mc/search?q=" + WebUrl.encode(t));
				}
			};
			ui.add(box);
			if (!results()) {
				ui.setFocus(box);
			}
		}

		@Override
		public String title() {
			return results() ? url.param("q", "") + " - Bloogle Search" : "Bloogle";
		}

		@Override
		public int contentHeight(int width, int viewportHeight) {
			return Math.max(viewportHeight, docHeight);
		}

		@Override
		protected void draw(GuiGraphics g, int width, int vh, int scrollY, float pt) {
			docHeight = results() ? drawResults(g, width) : drawHome(g, width, vh);
		}

		private int drawHome(GuiGraphics g, int width, int vh) {
			int cy = Math.max(30, vh / 2 - 70);
			int lw = Math.min(200, width - 40);
			int[] size = Gfx.textureSize(site.logo());
			int lh = size[0] > 0 ? lw * size[1] / size[0] : 40;
			float bob = (float) Math.sin(Ease.now() / 700.0) * 2;
			Gfx.textureFit(g, site.logo(), (width - lw) / 2, cy + (int) bob, lw, lh);
			for (int i = 0; i < 5; i++) {
				double a = Ease.now() / 900.0 + i * 1.25;
				int sx = width / 2 + (int) (Math.cos(a) * (lw / 2 + 8));
				int sy = cy + lh / 2 + (int) (Math.sin(a) * (lh / 2 + 6));
				Gfx.rect(g, sx, sy, 2, 2, new int[] {0xFF4285F4, 0xFFEA4335, 0xFFFBBC05, 0xFF34A853, 0xFF4285F4}[i]);
			}
			int bw = Math.min(360, width - 40);
			int by = cy + lh + 18;
			box.setBounds((width - bw) / 2, by, bw, 18);
			int b1 = Gfx.width("Bloogle Search") + 16, b2 = Gfx.width("I'm Feeling Blocky") + 16;
			int bx = width / 2 - (b1 + b2 + 8) / 2;
			button(g, bx, by + 28, b1, 18, "Bloogle Search", 0xFFF8F9FA, TEXT, () -> box.onEnter.accept(box.getText()));
			button(g, bx + b1 + 8, by + 28, b2, 18, "I'm Feeling Blocky", 0xFFF8F9FA, TEXT, () -> {
				List<Site> sites = new ArrayList<>(SiteRegistry.all());
				sites.removeIf(s -> s == site);
				if (!sites.isEmpty()) {
					page.navigate(sites.get((int) (Math.random() * sites.size())).host());
				}
			});
			// shortcut tiles
			List<Site> sites = SiteRegistry.all().stream().filter(s -> s != site).toList();
			int tile = 64, gap = 10;
			int perRow = Math.max(1, Math.min(sites.size(), (width - 20) / (tile + gap)));
			int ty = by + 62;
			for (int i = 0; i < sites.size(); i++) {
				Site s = sites.get(i);
				int row = i / perRow, col = i % perRow;
				int rowCount = Math.min(perRow, sites.size() - row * perRow);
				int tx = (width - rowCount * (tile + gap) + gap) / 2 + col * (tile + gap);
				int yy = ty + row * (tile + gap);
				boolean h = linkTo(g, tx, yy, tile, tile, s.host());
				Gfx.roundRect(g, tx, yy, tile, tile, 8, h ? 0xFFF1F3F4 : 0xFFFFFFFF);
				Gfx.roundRect(g, tx + tile / 2 - 14, yy + 8, 28, 28, 14, 0xFFF1F3F4);
				Gfx.icon(g, s.favicon(), tx + tile / 2 - 10, yy + 12, 20);
				Gfx.textCentered(g, Gfx.ellipsize(s.name(), tile - 4), tx + tile / 2, yy + 44, TEXT);
			}
			int end = ty + ((sites.size() + perRow - 1) / perRow) * (tile + gap) + 10;
			Gfx.textCentered(g, "Bloogle offered in: English · Villager (hmm) · Enderian", width / 2, Math.max(end, vh - 18), DIM);
			return Math.max(vh, end + 20);
		}

		private int drawResults(GuiGraphics g, int width) {
			String q = url.param("q", "").trim();
			Gfx.rect(g, 0, 0, width, 30, 0xFFFFFFFF);
			int lw = Gfx.textureFit(g, site.logo(), 10, 6, 70, 18);
			linkTo(g, 10, 4, lw, 22, "bloogle.mc");
			box.setBounds(lw + 20, 6, Math.min(340, width - lw - 30), 18);
			Gfx.rect(g, 0, 30, width, 1, LINE);
			List<Result> results = search(q);
			int x = Math.min(lw + 20, 110), w = Math.min(width - x - 12, 420);
			int y = 38;
			Gfx.text(g, "About " + Gfx.formatNumber(results.size() * 1_237L + q.length() * 31L) + " results (0." + (10 + q.length() % 80) + " seconds)", x, y, DIM);
			y += 16;
			y = answerCard(g, q, x, y, w);
			if (q.toLowerCase(Locale.ROOT).contains("herobrine")) {
				Gfx.text(g, "Did you mean: ", x, y, 0xFFD93025);
				Gfx.text(g, "nothing. There is nothing here.", x + Gfx.width("Did you mean: "), y, LINK);
				y += 16;
			}
			if (results.isEmpty()) {
				Gfx.text(g, "Your search - " + q + " - did not match any documents.", x, y, TEXT);
				Gfx.text(g, "Suggestions: try \"hat\", \"pizza\", \"creeper\" or \"speedrun\".", x, y + 14, DIM);
				return y + 40;
			}
			for (Result r : results) {
				int tx = x;
				if (r.icon != null) {
					Gfx.roundRect(g, x, y, 20, 20, 4, 0xFFF1F3F4);
					Gfx.item(g, r.icon, x + 2, y + 2);
					tx += 26;
				}
				Gfx.textClipped(g, r.url, tx, y, w - (tx - x), URLC);
				boolean h = linkTo(g, tx, y + 10, Math.min(w - (tx - x), Gfx.width(r.title)), 11, r.url);
				Gfx.textClipped(g, r.title, tx, y + 11, w - (tx - x), LINK);
				if (h) {
					Gfx.rect(g, tx, y + 20, Math.min(w - (tx - x), Gfx.width(r.title)), 1, LINK);
				}
				int sh = Gfx.textWrapped(g, r.snippet, tx, y + 23, w - (tx - x), 10, DIM);
				if (r.extra != null) {
					Gfx.text(g, r.extra, tx, y + 24 + sh, 0xFF70757A);
					sh += 10;
				}
				y += 28 + sh;
			}
			return y + 20;
		}

		private List<Result> search(String q) {
			String s = q.toLowerCase(Locale.ROOT);
			List<Result> out = new ArrayList<>();
			if (s.isEmpty()) {
				return out;
			}
			for (Site site : SiteRegistry.all()) {
				boolean match = site.name().toLowerCase(Locale.ROOT).contains(s) || site.description().toLowerCase(Locale.ROOT).contains(s)
						|| site.host().contains(s) || site.keywords().stream().anyMatch(k -> s.contains(k) || k.contains(s));
				if (match) {
					out.add(new Result(site.name() + " — " + site.description(), site.host(), "Official site of " + site.name() + ". " + site.description(), null, null));
				}
			}
			for (Product p : Catalog.search(Store.EMERAZON, s)) {
				out.add(new Result(p.name() + " : Emerazon.mc", "emerazon.mc/product?id=" + p.id(), p.description(), Kit.stack(p),
						"★ " + Kit.rating(p.rating()) + " (" + Gfx.formatNumber(p.reviews()) + ") · ◆" + p.price() + " · In stock"));
			}
			for (Restaurant r : Catalog.restaurants()) {
				if (r.name().toLowerCase(Locale.ROOT).contains(s) || r.cuisine().toLowerCase(Locale.ROOT).contains(s)) {
					out.add(new Result(r.name() + " — Order online | Ender Eats", "endereats.mc/restaurant?id=" + r.id(), r.tagline(), new ItemStack(r.iconItem()),
							"★ " + Kit.rating(r.rating()) + " · " + r.cuisine() + " · delivery in ≈" + r.etaSeconds() + "s"));
				}
			}
			for (Product p : Catalog.search(Store.ENDER_EATS, s)) {
				String rest = Catalog.restaurant(p.restaurantId()).map(Restaurant::name).orElse("Ender Eats");
				out.add(new Result(p.name() + " at " + rest, "endereats.mc/restaurant?id=" + p.restaurantId(), p.description(), Kit.stack(p), "◆" + p.price() + " · Ender Eats"));
			}
			for (Videos.Video v : Videos.ALL) {
				if (v.title().toLowerCase(Locale.ROOT).contains(s) || v.channel().name().toLowerCase(Locale.ROOT).contains(s)) {
					out.add(new Result(v.title(), "blocktube.mc/watch?v=" + v.id(), v.description(), v.channel().avatar(),
							v.channel().name() + " · " + Videos.views(v.views()) + " · " + v.duration()));
				}
			}
			return out.size() > 40 ? out.subList(0, 40) : out;
		}

		/** Instant-answer cards (math, weather, time, location, account). */
		private int answerCard(GuiGraphics g, String q, int x, int y, int w) {
			String s = q.toLowerCase(Locale.ROOT).trim();
			String title = null, body = null;
			Double math = MathEval.tryEval(s.replace("calc", "").replace("=", ""));
			Minecraft mc = Minecraft.getInstance();
			Player p = mc.player;
			Level level = mc.level;
			if (math != null && s.matches(".*[0-9].*")) {
				title = q + " =";
				body = MathEval.format(math);
			} else if (s.contains("weather")) {
				title = "Weather";
				body = level == null ? "Sunny with a chance of creepers." : level.isThundering() ? "⚡ Thunderstorm — stay inside, charged creepers about." : level.isRaining() ? "☂ Rain — perfect fishing weather." : "☀ Clear skies — great day for building.";
			} else if (s.equals("time") || s.startsWith("what time")) {
				title = "Current time";
				body = page.app().clockText() + " · Day " + page.app().day();
			} else if (s.contains("where am i") || s.contains("coords") || s.contains("my location")) {
				title = "Your location";
				BlockPos pos = p != null ? p.blockPosition() : page.app().laptopPos();
				body = "X " + pos.getX() + ", Y " + pos.getY() + ", Z " + pos.getZ() + (level != null ? " · " + level.dimension().identifier().getPath().replace('_', ' ') : "");
			} else if (s.contains("balance") || s.contains("emerald")) {
				title = "Your EmeraldPay balance";
				body = "◆ " + Gfx.formatNumber(page.app().account().balance()) + " — manage it at emeraldbank.mc";
			} else if (s.contains("order")) {
				List<Order> orders = page.app().account().snapshot().orders();
				title = "Your orders";
				body = orders.isEmpty() ? "No orders yet. Try emerazon.mc or endereats.mc!" : orders.size() + " orders — latest #" + orders.get(0).id() + " (" + orders.get(0).status().getSerializedName() + ")";
			} else if (s.equals("creeper")) {
				title = "Creeper";
				body = "A green, explosive mob that approaches silently. Known for ruining builds and BlockTube dance videos.";
			} else if (s.equals("diamond")) {
				title = "Diamond";
				body = "Rare gem found near Y=-59. Worth less than friendship, more than dirt.";
			}
			if (title == null) {
				return y;
			}
			int h = 50;
			Gfx.roundRect(g, x, y, w, h, 6, 0xFFFFFFFF);
			Gfx.roundBorder(g, x, y, w, h, 6, LINE);
			Gfx.text(g, title, x + 10, y + 8, DIM);
			Gfx.textScaled(g, Gfx.ellipsize(body, (w - 20) / (body.length() > 30 ? 1 : 2)), x + 10, y + 22, body.length() > 30 ? 1f : 2f, TEXT);
			Gfx.icon(g, Icons.INFO, x + w - 18, y + 6, 12);
			return y + h + 12;
		}
	}
}
