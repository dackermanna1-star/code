package com.laptopcraft.client.web.sites.blocktube;

import com.laptopcraft.client.os.Icons;
import com.laptopcraft.client.os.ui.Ease;
import com.laptopcraft.client.os.ui.Gfx;
import com.laptopcraft.client.os.ui.TextField;
import com.laptopcraft.client.os.ui.UI;
import com.laptopcraft.client.web.WebUrl;
import com.laptopcraft.client.web.kit.Kit;
import com.laptopcraft.client.web.kit.KitPage;
import com.laptopcraft.client.web.sites.blocktube.Videos.Channel;
import com.laptopcraft.client.web.sites.blocktube.Videos.Video;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.ListTag;
import net.minecraft.nbt.StringTag;
import net.minecraft.nbt.Tag;
import org.jspecify.annotations.Nullable;
import org.lwjgl.glfw.GLFW;

/** BlockTube pages: home feed, watch page (player, likes, comments, up next), search results and channels. */
public class BlockTubePage extends KitPage {
	private static final int HEADER = 26;
	private static final String[] COMMENTERS = {"xXCreeperSlayerXx", "Librarian Larry", "PigLover99", "Allay Anna", "Steve", "Alex", "NotHerobrine",
			"Wandering Trader", "IronGolemFan", "Sniffer Sam", "Bee Keeper Bea", "Redstone Rick"};
	private static final String[] COMMENTS = {"who's watching this in Day 1,204?", "the part at {t} got me 😂".replace("😂", "lol"),
			"my villagers stopped trading to watch this", "this is peak content", "I tried this and a creeper blew up my house. 10/10",
			"underrated channel fr", "the algorithm brought me here and I'm not mad", "{t} is the best moment in BlockTube history",
			"me: watching this instead of mining", "can we get this to 1 million likes?", "my cat watched the whole thing", "first",
			"subscribed because of this video", "the editing on this is insane", "Endermen in chat: *teleports*"};

	private final BlockTubeSite site;
	private final WebUrl url;
	private final TextField search = new TextField("Search");
	private final TextField comment = new TextField("Add a comment…");
	private int docHeight;
	private final long shownMs = Ease.now();
	// player
	private @Nullable Video video;
	private double time;
	private boolean playing = true;
	private long lastFrame = Ease.now();
	private boolean fullscreen;
	private boolean seeking;
	private int barX, barW;
	private boolean descOpen;
	private String category = "All";

	public BlockTubePage(BlockTubeSite site, WebUrl url) {
		this.site = site;
		this.url = url;
	}

	private boolean dark() {
		return page.app().theme().dark();
	}

	private int bg() {
		return dark() ? 0xFF0F0F0F : 0xFFFFFFFF;
	}

	private int fg() {
		return dark() ? 0xFFF1F1F1 : 0xFF0F0F0F;
	}

	private int dim() {
		return dark() ? 0xFFAAAAAA : 0xFF606060;
	}

	private int chip() {
		return dark() ? 0xFF272727 : 0xFFF2F2F2;
	}

	@Override
	public void init() {
		search.searchIcon = true;
		search.maxLength = 64;
		search.setText(url.param("q", ""));
		search.onEnter = q -> page.navigate("blocktube.mc/results?q=" + WebUrl.encode(q.trim()));
		ui.add(search);
		if (url.path().equals("watch")) {
			video = Videos.get(url.param("v", "")).orElse(null);
			if (video != null) {
				comment.maxLength = 120;
				comment.onEnter = this::postComment;
				ui.add(comment);
				CompoundTag s = page.siteState();
				ListTag hist = s.getListOrEmpty("history");
				ListTag out = new ListTag();
				out.add(StringTag.valueOf(video.id()));
				for (Tag t : hist) {
					String v = t.asString().orElse("");
					if (!v.equals(video.id()) && out.size() < 20) {
						out.add(StringTag.valueOf(v));
					}
				}
				s.put("history", out);
				page.saveSiteState();
			}
		}
	}

	@Override
	public String title() {
		if (video != null) {
			return video.title() + " - BlockTube";
		}
		return switch (url.path()) {
			case "results" -> url.param("q", "") + " - BlockTube";
			case "channel" -> channel().map(c -> c.name() + " - BlockTube").orElse("BlockTube");
			default -> "BlockTube";
		};
	}

	@Override
	public int background() {
		return bg();
	}

	@Override
	public int contentHeight(int width, int viewportHeight) {
		return fullscreen ? viewportHeight : Math.max(viewportHeight, docHeight);
	}

	private Optional<Channel> channel() {
		String id = url.param("id", "");
		return Videos.CHANNELS.stream().filter(c -> c.id().equals(id)).findFirst();
	}

	// ---------------------------------------------------------------- frame

	@Override
	protected void draw(GuiGraphics g, int width, int vh, int scrollY, float pt) {
		long now = Ease.now();
		if (video != null) {
			if (playing && !seeking) {
				time += (now - lastFrame) / 1000.0;
				if (time >= video.seconds()) {
					time = video.seconds();
					playing = false;
				}
			}
		}
		lastFrame = now;
		if (video != null && fullscreen) {
			comment.visible = false;
			search.visible = false;
			drawPlayer(g, 0, scrollY, width, vh);
			docHeight = vh;
			return;
		}
		search.visible = true;
		comment.visible = video != null;
		int y = HEADER + 8;
		y = switch (url.path()) {
			case "watch" -> video == null ? drawMissing(g, width, y) : drawWatch(g, width, y);
			case "results" -> drawGrid(g, width, y, results(url.param("q", "")), "Results for \"" + url.param("q", "") + "\"");
			case "channel" -> drawChannel(g, width, y);
			case "feed/library" -> drawGrid(g, width, y, history(), "History");
			default -> drawHome(g, width, y);
		};
		docHeight = y + 16;
		drawHeader(g, width, scrollY);
	}

	private void drawHeader(GuiGraphics g, int width, int sy) {
		Gfx.rect(g, 0, sy, width, HEADER, bg());
		int lw = Gfx.textureFit(g, site.logo(), 8, sy + 4, 90, 18);
		linkTo(g, 6, sy + 2, lw + 4, 22, "blocktube.mc");
		int sw = Math.min(260, width - lw - 110);
		int sx = Math.max(lw + 16, (width - sw) / 2);
		search.setBounds(sx, sy + 5, Math.max(60, sw), 16);
		int ax = width - 22;
		Gfx.roundRect(g, ax, sy + 5, 16, 16, 8, 0xFF7E57C2);
		Gfx.textCentered(g, page.app().username().substring(0, 1).toUpperCase(Locale.ROOT), ax + 8, sy + 9, 0xFFFFFFFF);
		if (width > 380 && region(g, ax - 60, sy + 5, 54, 16, () -> page.navigate("blocktube.mc/feed/library"))) {
			Gfx.roundRect(g, ax - 60, sy + 5, 54, 16, 8, chip());
		}
		if (width > 380) {
			Gfx.text(g, "History", ax - 52, sy + 9, fg());
		}
		Gfx.rect(g, 0, sy + HEADER - 1, width, 1, dark() ? 0xFF222222 : 0xFFE5E5E5);
	}

	// ---------------------------------------------------------------- home / grids

	private List<Video> results(String q) {
		String s = q.toLowerCase(Locale.ROOT);
		return Videos.ALL.stream().filter(v -> v.title().toLowerCase(Locale.ROOT).contains(s) || v.channel().name().toLowerCase(Locale.ROOT).contains(s)
				|| v.description().toLowerCase(Locale.ROOT).contains(s)).toList();
	}

	private List<Video> history() {
		List<Video> out = new ArrayList<>();
		for (Tag t : page.siteState().getListOrEmpty("history")) {
			t.asString().flatMap(Videos::get).ifPresent(out::add);
		}
		return out;
	}

	private int drawHome(GuiGraphics g, int width, int y) {
		String[] cats = {"All", "Music", "Gaming", "Relaxing", "Tutorials", "Animals", "Unboxing"};
		int cx = 10;
		for (String c : cats) {
			int cw = Gfx.width(c) + 14;
			if (cx + cw > width - 8) {
				break;
			}
			boolean sel = c.equals(category);
			boolean h = region(g, cx, y, cw, 16, () -> category = c);
			Gfx.roundRect(g, cx, y, cw, 16, 5, sel ? fg() : h ? Gfx.lighten(chip(), 0.08f) : chip());
			Gfx.text(g, c, cx + 7, y + 4, sel ? bg() : fg());
			cx += cw + 6;
		}
		y += 24;
		List<Video> list = Videos.ALL.stream().filter(v -> switch (category) {
			case "Music" -> v.channel() == Videos.MINE_BEATS;
			case "Gaming" -> v.channel() == Videos.SPEEDY || v.channel() == Videos.DIGGER;
			case "Relaxing" -> v.channel() == Videos.CHILL || v.id().equals("sheep");
			case "Tutorials" -> v.channel() == Videos.TUTS || v.channel() == Videos.BUILDER;
			case "Animals" -> v.channel() == Videos.FARM || v.id().equals("pigs");
			case "Unboxing" -> v.channel() == Videos.UNBOX;
			default -> true;
		}).toList();
		return drawGrid(g, width, y, list, null);
	}

	private int drawGrid(GuiGraphics g, int width, int y, List<Video> list, @Nullable String heading) {
		if (heading != null) {
			Gfx.text(g, heading, 10, y, fg());
			y += 14;
		}
		if (list.isEmpty()) {
			Gfx.text(g, "No videos found. Maybe the Endermen took them.", 10, y + 6, dim());
			return y + 24;
		}
		int cols = Math.max(1, Math.min(4, (width - 10) / 150));
		int cw = (width - 20 - (cols - 1) * 10) / cols;
		int th = cw * 9 / 16;
		int ch = th + 48;
		for (int i = 0; i < list.size(); i++) {
			Video v = list.get(i);
			int x = 10 + (i % cols) * (cw + 10), vy = y + (i / cols) * (ch + 8);
			boolean h = linkTo(g, x, vy, cw, ch, "blocktube.mc/watch?v=" + v.id());
			double t = h ? (v.seconds() * 0.3 + (Ease.now() - shownMs) / 1000.0) % v.seconds() : v.seconds() * 0.3;
			thumbnail(g, v, x, vy, cw, th, t);
			Gfx.roundRect(g, x + 4, vy + 4 + th + 2, 16, 16, 8, v.channel().color());
			Gfx.itemScaled(g, v.channel().avatar(), x + 6, vy + th + 8, 0.75f);
			List<String> lines = Gfx.wrap(v.title(), cw - 28);
			Gfx.text(g, lines.get(0), x + 24, vy + th + 6, fg());
			if (lines.size() > 1) {
				Gfx.textClipped(g, lines.size() > 2 ? lines.get(1) + "…" : lines.get(1), x + 24, vy + th + 16, cw - 28, fg());
			}
			Gfx.textClipped(g, v.channel().name(), x + 24, vy + th + 27, cw - 28, dim());
			Gfx.textClipped(g, Videos.views(v.views()) + " · " + Videos.age(v.ageDays()), x + 24, vy + th + 37, cw - 28, dim());
		}
		return y + ((list.size() + cols - 1) / cols) * (ch + 8);
	}

	private void thumbnail(GuiGraphics g, Video v, int x, int y, int w, int h, double t) {
		Gfx.scissor(g, x, y, w, h);
		v.scene().render(g, x, y, w, h, t);
		Gfx.endScissor(g);
		String d = v.duration();
		int dw = Gfx.width(d) + 6;
		Gfx.roundRect(g, x + w - dw - 3, y + h - 13, dw, 10, 2, 0xDD000000);
		Gfx.text(g, d, x + w - dw, y + h - 12, 0xFFFFFFFF);
	}

	// ---------------------------------------------------------------- watch

	private int drawWatch(GuiGraphics g, int width, int y) {
		Video v = video;
		boolean side = width >= 560;
		int mainW = side ? width - 20 - 180 : width - 20;
		int ph = mainW * 9 / 16;
		drawPlayer(g, 10, y, mainW, ph);
		int iy = y + ph + 8;
		for (String line : Gfx.wrap(v.title(), mainW)) {
			Gfx.text(g, line, 10, iy, fg());
			iy += 11;
		}
		iy += 4;
		// channel row
		Gfx.roundRect(g, 10, iy, 20, 20, 10, v.channel().color());
		Gfx.item(g, v.channel().avatar(), 12, iy + 2);
		linkTo(g, 34, iy, Gfx.width(v.channel().name()), 10, "blocktube.mc/channel?id=" + v.channel().id());
		Gfx.text(g, v.channel().name(), 34, iy + 1, fg());
		Gfx.text(g, v.channel().subscribers() + " subscribers", 34, iy + 11, dim());
		CompoundTag st = page.siteState();
		boolean subbed = st.getBooleanOr("sub/" + v.channel().id(), false);
		int sbx = 40 + Math.max(Gfx.width(v.channel().name()), Gfx.width(v.channel().subscribers() + " subscribers")) + 6;
		button(g, sbx, iy + 2, subbed ? 72 : 62, 16, subbed ? "Subscribed ✔" : "Subscribe", subbed ? chip() : fg(), subbed ? fg() : bg(), () -> {
			st.putBoolean("sub/" + v.channel().id(), !subbed);
			page.saveSiteState();
			if (!subbed) {
				page.app().notify("info", "Subscribed!", "You'll never miss a " + v.channel().name() + " upload.");
			}
		});
		int liked = st.getIntOr("like/" + v.id(), 0);
		String likes = "▲ " + compact(v.likes() + (liked == 1 ? 1 : 0));
		int lw = Gfx.width(likes) + 14;
		int lx = 10 + mainW - lw - 38;
		if (lx > sbx + 80) {
			boolean lh = region(g, lx, iy + 2, lw, 16, () -> {
				st.putInt("like/" + v.id(), liked == 1 ? 0 : 1);
				page.saveSiteState();
			});
			Gfx.roundRect(g, lx, iy + 2, lw + 34, 16, 8, lh ? Gfx.lighten(chip(), 0.08f) : chip());
			Gfx.text(g, likes, lx + 7, iy + 6, liked == 1 ? 0xFF3EA6FF : fg());
			Gfx.rect(g, lx + lw, iy + 4, 1, 12, dim());
			region(g, lx + lw, iy + 2, 34, 16, () -> {
				st.putInt("like/" + v.id(), liked == -1 ? 0 : -1);
				page.saveSiteState();
			});
			Gfx.text(g, "▼", lx + lw + 12, iy + 6, liked == -1 ? 0xFF3EA6FF : fg());
		}
		iy += 28;
		// description
		List<String> desc = Gfx.wrap(v.description(), mainW - 16);
		int dh = 26 + (descOpen ? desc.size() * 10 + 10 : 10);
		boolean dhov = region(g, 10, iy, mainW, dh, () -> descOpen = !descOpen);
		Gfx.roundRect(g, 10, iy, mainW, dh, 6, dhov ? Gfx.lighten(chip(), 0.05f) : chip());
		Gfx.text(g, Videos.views(v.views()) + "  " + Videos.age(v.ageDays()), 18, iy + 7, fg());
		if (descOpen) {
			int dy = iy + 19;
			for (String l : desc) {
				Gfx.text(g, l, 18, dy, fg());
				dy += 10;
			}
			Gfx.text(g, "Show less", 18, dy + 2, dim());
		} else {
			Gfx.textClipped(g, desc.isEmpty() ? "" : desc.get(0) + " …more", 18, iy + 18, mainW - 16, fg());
		}
		iy += dh + 10;
		// comments
		List<String[]> comments = comments(v);
		Gfx.text(g, Gfx.formatNumber(1200 + (long) (Kit.rand(v.id(), 5) * 9000)) + " Comments", 10, iy, fg());
		iy += 14;
		Gfx.roundRect(g, 10, iy, 16, 16, 8, 0xFF7E57C2);
		Gfx.textCentered(g, page.app().username().substring(0, 1).toUpperCase(Locale.ROOT), 18, iy + 4, 0xFFFFFFFF);
		comment.setBounds(32, iy, Math.max(80, mainW - 92), 16);
		button(g, 10 + mainW - 54, iy, 54, 16, "Comment", 0xFF3EA6FF, 0xFF0F0F0F, () -> postComment(comment.getText()));
		iy += 24;
		for (String[] c : comments) {
			Gfx.roundRect(g, 10, iy, 16, 16, 8, Gfx.lerp(0xFF5C6BC0, 0xFFEF6C00, (float) Kit.rand(c[0], 2)));
			Gfx.textCentered(g, c[0].substring(0, 1), 18, iy + 4, 0xFFFFFFFF);
			Gfx.text(g, "@" + c[0].replace(" ", "") + "  " + c[2], 32, iy, dim());
			iy += 10 + Gfx.textWrapped(g, c[1], 32, iy + 10, mainW - 24, 10, fg());
			Gfx.text(g, "▲ " + c[3] + "   ▼   Reply", 32, iy + 2, dim());
			iy += 16;
		}
		// up next
		int ux = side ? 10 + mainW + 10 : 10, uy = side ? y : iy + 6, uw = side ? 180 : mainW;
		Gfx.text(g, "Up next", ux, uy, fg());
		uy += 12;
		int i = 0;
		for (Video o : Videos.ALL) {
			if (o == v) {
				continue;
			}
			int tw = 72, th = 40;
			boolean h = linkTo(g, ux, uy, uw, th, "blocktube.mc/watch?v=" + o.id());
			if (h) {
				Gfx.roundRect(g, ux - 2, uy - 2, uw + 4, th + 4, 4, chip());
			}
			thumbnail(g, o, ux, uy, tw, th, h ? (o.seconds() * 0.3 + (Ease.now() - shownMs) / 1000.0) % o.seconds() : o.seconds() * 0.3);
			List<String> tl = Gfx.wrap(o.title(), uw - tw - 6);
			Gfx.text(g, tl.get(0), ux + tw + 6, uy, fg());
			if (tl.size() > 1) {
				Gfx.textClipped(g, tl.get(1), ux + tw + 6, uy + 10, uw - tw - 6, fg());
			}
			Gfx.textClipped(g, o.channel().name(), ux + tw + 6, uy + 21, uw - tw - 6, dim());
			Gfx.textClipped(g, Videos.views(o.views()), ux + tw + 6, uy + 31, uw - tw - 6, dim());
			uy += th + 8;
			if (++i >= 8) {
				break;
			}
		}
		return Math.max(iy, uy);
	}

	private void drawPlayer(GuiGraphics g, int x, int y, int w, int h) {
		Video v = video;
		Gfx.rect(g, x, y, w, h, 0xFF000000);
		Gfx.scissor(g, x, y, w, h);
		v.scene().render(g, x, y, w, h, time);
		Gfx.endScissor(g);
		boolean over = hover(x, y, w, h);
		region(g, x, y, w, h - 22, this::togglePlay);
		boolean ended = !playing && time >= v.seconds();
		if (ended) {
			Gfx.rect(g, x, y, w, h, 0xAA000000);
			int idx = Videos.ALL.indexOf(v);
			Video next = Videos.ALL.get((idx + 1) % Videos.ALL.size());
			Gfx.textCentered(g, "Up next", x + w / 2, y + h / 2 - 30, 0xFFAAAAAA);
			Gfx.textCentered(g, Gfx.ellipsize(next.title(), w - 20), x + w / 2, y + h / 2 - 18, 0xFFFFFFFF);
			button(g, x + w / 2 - 70, y + h / 2, 64, 16, "↻ Replay", 0xFF3A3A3A, 0xFFFFFFFF, () -> {
				time = 0;
				playing = true;
			});
			button(g, x + w / 2 + 6, y + h / 2, 64, 16, "Play next ▶", 0xFFFFFFFF, 0xFF0F0F0F, () -> page.navigate("blocktube.mc/watch?v=" + next.id()));
		} else if (!playing) {
			Gfx.roundRect(g, x + w / 2 - 18, y + h / 2 - 18, 36, 36, 18, 0xAA000000);
			Gfx.icon(g, Icons.PLAY, x + w / 2 - 8, y + h / 2 - 8, 16);
		}
		lastBarY = -1;
		if (over || !playing || seeking) {
			Gfx.gradientV(g, x, y + h - 30, w, 30, 0x00000000, 0xCC000000);
			barX = x + 8;
			barW = w - 16;
			int by = y + h - 22;
			lastBarY = by;
			float p = (float) (time / v.seconds());
			boolean bh = region(g, barX, by - 3, barW, 9, () -> {
			});
			Gfx.rect(g, barX, by, barW, bh || seeking ? 3 : 2, 0x55FFFFFF);
			Gfx.rect(g, barX, by, (int) (barW * p), bh || seeking ? 3 : 2, 0xFFFF0033);
			if (bh || seeking) {
				Gfx.roundRect(g, barX + (int) (barW * p) - 4, by - 3, 8, 8, 4, 0xFFFF0033);
			}
			int cy = y + h - 15;
			region(g, x + 6, cy, 12, 12, this::togglePlay);
			Gfx.icon(g, playing ? Icons.PAUSE : Icons.PLAY, x + 6, cy, 12);
			Gfx.text(g, fmt(time) + " / " + v.duration(), x + 24, cy + 2, 0xFFFFFFFF);
			String fs = fullscreen ? "Exit fullscreen" : "Fullscreen";
			int fw = Gfx.width(fs);
			region(g, x + w - fw - 10, cy, fw + 4, 12, () -> fullscreen = !fullscreen);
			Gfx.text(g, fs, x + w - 8 - fw, cy + 2, 0xFFFFFFFF);
		}
	}

	private void togglePlay() {
		if (video != null && time >= video.seconds()) {
			time = 0;
		}
		playing = !playing;
	}

	private static String fmt(double t) {
		int s = (int) t;
		return String.format(Locale.ROOT, "%d:%02d", s / 60, s % 60);
	}

	private static String compact(long n) {
		return n >= 1_000_000 ? String.format(Locale.ROOT, "%.1fM", n / 1e6) : n >= 1000 ? (n / 1000) + "K" : String.valueOf(n);
	}

	private List<String[]> comments(Video v) {
		List<String[]> out = new ArrayList<>();
		for (Tag t : page.siteState().getListOrEmpty("comments/" + v.id())) {
			out.add(0, new String[] {page.app().username(), t.asString().orElse(""), "just now", "0"});
		}
		int n = 6 + (int) (Kit.rand(v.id(), 1) * 4);
		for (int i = 0; i < n; i++) {
			String who = COMMENTERS[(int) (Kit.rand(v.id(), 10 + i) * COMMENTERS.length)];
			String text = COMMENTS[(int) (Kit.rand(v.id(), 30 + i) * COMMENTS.length)].replace("{t}", fmt(Kit.rand(v.id(), 50 + i) * v.seconds()));
			out.add(new String[] {who, text, (1 + (int) (Kit.rand(v.id(), 70 + i) * 11)) + " months ago", compact((long) (Kit.rand(v.id(), 90 + i) * 20000))});
		}
		return out;
	}

	private void postComment(String text) {
		if (video == null || text.isBlank()) {
			return;
		}
		CompoundTag st = page.siteState();
		ListTag list = st.getListOrEmpty("comments/" + video.id());
		list.add(StringTag.valueOf(text.trim()));
		while (list.size() > 10) {
			list.remove(0);
		}
		st.put("comments/" + video.id(), list);
		page.saveSiteState();
		comment.setText("");
		UI.playClick();
	}

	private int drawChannel(GuiGraphics g, int width, int y) {
		Optional<Channel> oc = channel();
		if (oc.isEmpty()) {
			return drawMissing(g, width, y);
		}
		Channel c = oc.get();
		Gfx.gradientH(g, 0, y - 8, width, 60, c.color(), Gfx.darken(c.color(), 0.5f));
		Gfx.roundRect(g, 14, y + 6, 36, 36, 18, 0xFFFFFFFF);
		Gfx.itemScaled(g, c.avatar(), 16, y + 8, 2f);
		Gfx.textScaledShadow(g, c.name(), 58, y + 10, 2f, 0xFFFFFFFF);
		Gfx.textShadow(g, c.subscribers() + " subscribers", 58, y + 30, 0xFFEEEEEE);
		y += 64;
		return drawGrid(g, width, y, Videos.ALL.stream().filter(v -> v.channel() == c).toList(), "Videos");
	}

	private int drawMissing(GuiGraphics g, int width, int y) {
		Gfx.textCentered(g, "This video isn't available anymore.", width / 2, y + 40, fg());
		textLink(g, "Go to BlockTube home", width / 2 - 48, y + 56, 0xFF3EA6FF, "blocktube.mc");
		return y + 80;
	}

	// ---------------------------------------------------------------- input

	@Override
	public boolean mouseClicked(double x, double y, int button) {
		if (video != null && lastBarY >= 0 && x >= barX && x <= barX + barW && y >= lastBarY - 4 && y <= lastBarY + 6) {
			seeking = true;
			seekTo(x);
			return true;
		}
		return super.mouseClicked(x, y, button);
	}

	private int lastBarY = -1;

	@Override
	public boolean mouseDragged(double x, double y, int button, double dragX, double dragY) {
		if (seeking) {
			seekTo(x);
			return true;
		}
		return super.mouseDragged(x, y, button, dragX, dragY);
	}

	@Override
	public boolean mouseReleased(double x, double y, int button) {
		if (seeking) {
			seeking = false;
			return true;
		}
		return super.mouseReleased(x, y, button);
	}

	private void seekTo(double x) {
		if (video != null && barW > 0) {
			time = Math.max(0, Math.min(video.seconds() - 0.01, (x - barX) / barW * video.seconds()));
		}
	}

	@Override
	public boolean keyPressed(int key, int scan, int mods) {
		if (super.keyPressed(key, scan, mods)) {
			return true;
		}
		if (video == null || comment.isFocused() || search.isFocused()) {
			return false;
		}
		switch (key) {
			case GLFW.GLFW_KEY_SPACE, GLFW.GLFW_KEY_K -> togglePlay();
			case GLFW.GLFW_KEY_J -> time = Math.max(0, time - 10);
			case GLFW.GLFW_KEY_L -> time = Math.min(video.seconds() - 0.01, time + 10);
			case GLFW.GLFW_KEY_LEFT -> time = Math.max(0, time - 5);
			case GLFW.GLFW_KEY_RIGHT -> time = Math.min(video.seconds() - 0.01, time + 5);
			case GLFW.GLFW_KEY_F -> fullscreen = !fullscreen;
			case GLFW.GLFW_KEY_ESCAPE -> {
				if (!fullscreen) {
					return false;
				}
				fullscreen = false;
			}
			default -> {
				return false;
			}
		}
		return true;
	}
}
