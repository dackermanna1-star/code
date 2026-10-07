package com.laptopcraft.client.web.sites.blocktube;

import com.laptopcraft.client.os.ui.Gfx;
import com.laptopcraft.client.web.kit.Kit;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;

/** BlockTube's catalog of procedurally animated videos. Every frame is drawn from code at time t. */
public final class Videos {
	/** Draws one frame into (x, y, w, h) at time t seconds. Implementations must stay inside the rect (callers scissor). */
	public interface Scene {
		void render(GuiGraphics g, int x, int y, int w, int h, double t);
	}

	public record Channel(String id, String name, int color, ItemStack avatar, String subscribers) {
	}

	public record Video(String id, String title, Channel channel, long views, int ageDays, int seconds, int likes, String description, Scene scene) {
		public String duration() {
			return String.format(Locale.ROOT, "%d:%02d", seconds / 60, seconds % 60);
		}
	}

	public static final Channel MINE_BEATS = new Channel("minebeats", "MineBeats", 0xFF7E57C2, new ItemStack(Items.JUKEBOX), "4.2M");
	public static final Channel SPEEDY = new Channel("speedy", "SpeedyMcRun", 0xFFE53935, new ItemStack(Items.MINECART), "1.1M");
	public static final Channel CHILL = new Channel("chill", "Chill Biomes", 0xFF26A69A, new ItemStack(Items.CAMPFIRE), "880K");
	public static final Channel BUILDER = new Channel("builder", "Grian-ish Builds", 0xFF8D6E63, new ItemStack(Items.BRICKS), "2.7M");
	public static final Channel DIGGER = new Channel("digger", "DiamondDigger", 0xFF29B6F6, new ItemStack(Items.DIAMOND_PICKAXE), "3.9M");
	public static final Channel FARM = new Channel("farm", "Farmer Fiona", 0xFF9CCC65, new ItemStack(Items.SHEARS), "512K");
	public static final Channel TUTS = new Channel("tuts", "Redstone Rick", 0xFFD32F2F, new ItemStack(Items.REDSTONE), "1.6M");
	public static final Channel UNBOX = new Channel("unbox", "Unboxing Ursula", 0xFFFF9900, new ItemStack(Items.CHEST), "6.3M");
	public static final List<Channel> CHANNELS = List.of(MINE_BEATS, SPEEDY, CHILL, BUILDER, DIGGER, FARM, TUTS, UNBOX);

	public static final List<Video> ALL = List.of(
			new Video("creeperdance", "Creeper Dance Party (10 HOURS)", MINE_BEATS, 48_210_331, 400, 150, 1_203_441,
					"The legendary creeper rave. They hiss, they bop, they absolutely do not explode. Headphones recommended.", Videos::creeperDance),
			new Video("speedrun", "Minecart Speedrun Any% — WORLD RECORD (no rails glitch)", SPEEDY, 9_801_552, 12, 96, 402_118,
					"Personal best on the Overworld Express. Splits in the description of my other video.", Videos::speedrun),
			new Video("campfire", "Relaxing Campfire & Rain Ambience Sleep, Study, Mine", CHILL, 22_310_900, 220, 300, 610_404,
					"Crackling campfire, gentle rain, zero phantoms. Perfect for studying enchantment tables.", Videos::campfire),
			new Video("house", "I Built the Perfect Starter House in 5 Minutes (timelapse)", BUILDER, 15_002_013, 33, 120, 822_045,
					"Oak, cobble and a dream. Survival friendly, creeper unfriendly.", Videos::house),
			new Video("diamonds", "Top 10 Diamond Finds of All Time #1 WILL SHOCK YOU", DIGGER, 31_555_004, 61, 140, 990_120,
					"Number 3 was found by a villager. Number 1 was found by my dog. Seriously.", Videos::diamonds),
			new Video("sunset", "4K Ocean Sunset Timelapse (Overworld, Day 1,204)", CHILL, 5_204_330, 7, 90, 210_300,
					"Shot on a CubeBook Pro. Color graded with dye.", Videos::sunset),
			new Video("pigs", "Pig Racing Championship FINALS", SPEEDY, 12_700_002, 3, 80, 501_202,
					"Porkchop vs. Bacon vs. Sir Oinksalot. Carrot-on-a-stick allowed.", Videos::pigs),
			new Video("sheep", "Sheep Shearing ASMR (no talking)", FARM, 7_888_101, 140, 120, 330_909,
					"Snip. Snip. Fluff. You're welcome.", Videos::sheep),
			new Video("portal", "How to Build a Nether Portal — Beginner Tutorial", TUTS, 19_402_118, 800, 110, 702_510,
					"10 obsidian, 1 flint and steel, 0 fear. Step by step for absolute beginners.", Videos::portal),
			new Video("unboxing", "UNBOXING my Emerazon package!! (EXPRESS DELIVERY)", UNBOX, 3_302_404, 1, 70, 144_222,
					"An Allay dropped this off 15 seconds after I ordered. Let's see what's inside!", Videos::unboxing),
			new Video("dragon", "Ender Dragon No-Damage Run (Hardcore)", SPEEDY, 25_603_777, 95, 130, 1_440_016,
					"No armor. No beds. Just vibes and a bow.", Videos::dragon),
			new Video("cats", "Cats Knocking Things Off Tables — Compilation #47", FARM, 40_011_234, 18, 100, 2_003_454,
					"They know exactly what they're doing.", Videos::cats));

	private Videos() {
	}

	public static Optional<Video> get(String id) {
		return ALL.stream().filter(v -> v.id().equals(id)).findFirst();
	}

	public static String views(long v) {
		if (v >= 1_000_000) {
			return String.format(Locale.ROOT, "%.1fM views", v / 1_000_000.0);
		}
		return v >= 1000 ? (v / 1000) + "K views" : v + " views";
	}

	public static String age(int days) {
		if (days <= 1) {
			return "1 day ago";
		}
		if (days < 30) {
			return days + " days ago";
		}
		if (days < 365) {
			return (days / 30) + " months ago";
		}
		return (days / 365) + (days / 365 == 1 ? " year ago" : " years ago");
	}

	// ---------------------------------------------------------------- drawing helpers

	private static void sky(GuiGraphics g, int x, int y, int w, int h, int top, int bottom) {
		Gfx.gradientV(g, x, y, w, h, top, bottom);
	}

	/** A shaded block cube face (s × s). */
	private static void block(GuiGraphics g, int x, int y, int s, int color) {
		Gfx.rect(g, x, y, s, s, color);
		Gfx.rect(g, x, y, s, Math.max(1, s / 6), Gfx.lighten(color, 0.18f));
		Gfx.rect(g, x, y + s - Math.max(1, s / 6), s, Math.max(1, s / 6), Gfx.darken(color, 0.25f));
	}

	private static void creeper(GuiGraphics g, int x, int y, int u) {
		Gfx.rect(g, x, y, u * 8, u * 8, 0xFF4CAF50);
		Gfx.rect(g, x + u, y + u * 2, u * 2, u * 2, 0xFF0B0B0B);
		Gfx.rect(g, x + u * 5, y + u * 2, u * 2, u * 2, 0xFF0B0B0B);
		Gfx.rect(g, x + u * 3, y + u * 4, u * 2, u * 3, 0xFF0B0B0B);
		Gfx.rect(g, x + u * 2, y + u * 5, u, u * 3, 0xFF0B0B0B);
		Gfx.rect(g, x + u * 5, y + u * 5, u, u * 3, 0xFF0B0B0B);
		Gfx.rect(g, x + u, y + u * 8, u * 6, u * 10, 0xFF43A047);
		Gfx.rect(g, x, y + u * 18, u * 3, u * 3, 0xFF388E3C);
		Gfx.rect(g, x + u * 5, y + u * 18, u * 3, u * 3, 0xFF388E3C);
	}

	private static void pig(GuiGraphics g, int x, int y, int u) {
		Gfx.rect(g, x, y, u * 10, u * 6, 0xFFF4A6B0);
		Gfx.rect(g, x + u * 9, y - u * 2, u * 5, u * 5, 0xFFF4A6B0);
		Gfx.rect(g, x + u * 12, y, u * 3, u * 2, 0xFFE57C8C);
		Gfx.rect(g, x + u * 10, y - u, u, u, 0xFF222222);
		Gfx.rect(g, x + u, y + u * 6, u * 2, u * 3, 0xFFE08896);
		Gfx.rect(g, x + u * 7, y + u * 6, u * 2, u * 3, 0xFFE08896);
	}

	private static void caption(GuiGraphics g, int x, int y, int w, int h, String text) {
		int tw = Gfx.width(text) + 8;
		Gfx.rect(g, x + (w - tw) / 2, y + h - 18, tw, 12, 0xAA000000);
		Gfx.textCentered(g, text, x + w / 2, y + h - 16, 0xFFFFFFFF);
	}

	// ---------------------------------------------------------------- scenes

	private static void creeperDance(GuiGraphics g, int x, int y, int w, int h, double t) {
		Gfx.rect(g, x, y, w, h, 0xFF120A1F);
		int beat = (int) (t * 2.2);
		int tile = Math.max(8, w / 12);
		for (int ty = y + h * 2 / 3; ty < y + h; ty += tile / 2) {
			for (int tx = x; tx < x + w; tx += tile) {
				int k = (tx / tile + ty + beat) % 4;
				int[] c = {0xFFE040FB, 0xFF40C4FF, 0xFFFFEB3B, 0xFF69F0AE};
				Gfx.rect(g, tx, ty, tile - 1, tile / 2 - 1, Gfx.withAlpha(c[Math.floorMod(k, 4)], 150));
			}
		}
		for (int i = 0; i < 18; i++) {
			double a = t * 0.8 + i;
			int sx = x + (int) ((Math.sin(a * 1.3 + i) * 0.5 + 0.5) * w);
			int sy = y + (int) ((Math.cos(a + i * 2) * 0.5 + 0.5) * h * 0.6);
			Gfx.rect(g, sx, sy, 2, 2, Gfx.withAlpha(0xFFFFFFFF, 180));
		}
		Gfx.roundRect(g, x + w / 2 - 8, y + 2, 16, 16, 8, 0xFFB0BEC5);
		int u = Math.max(1, h / 48);
		for (int i = 0; i < 3; i++) {
			int bob = (int) (Math.abs(Math.sin(t * Math.PI * 2.2 + i)) * u * 4);
			int cx = x + w / 2 - u * 4 + (i - 1) * u * 14;
			creeper(g, cx, y + h - u * 26 - bob, u);
		}
		caption(g, x, y, w, h, "♪ hiss hiss boom (not really) ♪");
	}

	private static void speedrun(GuiGraphics g, int x, int y, int w, int h, double t) {
		sky(g, x, y, w, h, 0xFF64B5F6, 0xFFBBDEFB);
		for (int layer = 0; layer < 3; layer++) {
			double speed = 20 + layer * 45;
			int col = new int[] {0xFF81C784, 0xFF66BB6A, 0xFF43A047}[layer];
			int base = y + h / 2 + layer * h / 8;
			for (int i = -1; i < w / 40 + 2; i++) {
				int hx = x + (int) (i * 40 - (t * speed) % 40);
				int hh = 10 + (int) (Kit.rand("hill" + layer, Math.floorMod(i + (int) (t * speed / 40), 97)) * 25);
				Gfx.rect(g, hx, base - hh, 40, y + h - base + hh, col);
			}
		}
		int ry = y + h - 22;
		Gfx.rect(g, x, ry, w, 2, 0xFF8D6E63);
		for (int i = 0; i < w / 8 + 2; i++) {
			Gfx.rect(g, x + i * 8 - (int) (t * 160 % 8), ry + 2, 2, 3, 0xFF6D4C41);
		}
		int bump = (int) (Math.sin(t * 20) * 1);
		Gfx.itemScaled(g, new ItemStack(Items.MINECART), x + w / 3, ry - 26 + bump, 2f);
		for (int i = 0; i < 6; i++) {
			Gfx.rect(g, x + w / 3 - 10 - i * 7, ry - 14 + i % 3, 5, 1, 0xCCFFFFFF);
		}
		String timer = String.format(Locale.ROOT, "%02d:%05.2f", (int) t / 60, t % 60);
		Gfx.rect(g, x + w - 70, y + 6, 64, 14, 0xAA000000);
		Gfx.text(g, timer, x + w - 64, y + 9, (int) (t * 4) % 8 == 0 ? 0xFF69F0AE : 0xFFFFFFFF);
	}

	private static void campfire(GuiGraphics g, int x, int y, int w, int h, double t) {
		sky(g, x, y, w, h, 0xFF0D1B2A, 0xFF1B263B);
		Gfx.rect(g, x, y + h - 20, w, 20, 0xFF1E3A1E);
		int cx = x + w / 2, cy = y + h - 26;
		Gfx.rect(g, cx - 18, cy + 4, 36, 5, 0xFF5D4037);
		Gfx.rect(g, cx - 14, cy, 28, 4, 0xFF6D4C41);
		for (int i = 0; i < 9; i++) {
			double f = Math.sin(t * 9 + i * 1.7) * 0.5 + 0.5;
			int fh = 10 + (int) (f * 16) - Math.abs(i - 4) * 2;
			int fx = cx - 12 + i * 3;
			Gfx.rect(g, fx, cy - fh, 3, fh, i % 2 == 0 ? 0xFFFF9800 : 0xFFFFC107);
			Gfx.rect(g, fx, cy - fh / 2, 3, fh / 2, 0xFFFF5722);
		}
		Gfx.roundRect(g, cx - 40, cy - 30, 80, 50, 25, 0x22FFAB40);
		for (int i = 0; i < 60; i++) {
			int rx = x + (int) (Kit.rand("rain", i) * w);
			int ry = y + (int) ((Kit.rand("rainy", i) * h + t * 160) % h);
			Gfx.rect(g, rx, ry, 1, 5, 0x887FA7D6);
		}
		for (int i = 0; i < 6; i++) {
			double life = (t * 0.7 + i / 6.0) % 1.0;
			Gfx.rect(g, cx - 3 + (int) (Math.sin(i * 3 + t) * 8), cy - 20 - (int) (life * 40), 1, 1, Gfx.withAlpha(0xFFFFCC80, (int) (255 * (1 - life))));
		}
	}

	private static void house(GuiGraphics g, int x, int y, int w, int h, double t) {
		double day = (Math.sin(t * 0.35) * 0.5 + 0.5);
		sky(g, x, y, w, h, Gfx.lerp(0xFF0B1026, 0xFF64B5F6, (float) day), Gfx.lerp(0xFF1A237E, 0xFFE1F5FE, (float) day));
		int s = Math.max(6, h / 12);
		int gy = y + h - s * 2;
		for (int i = 0; i <= w / s; i++) {
			block(g, x + i * s, gy, s, 0xFF6DAA45);
			block(g, x + i * s, gy + s, s, 0xFF8B5A2B);
		}
		int bx = x + w / 2 - s * 4;
		int placed = (int) (t * 3.2) % 70;
		int n = 0;
		for (int row = 0; row < 5; row++) {
			for (int col = 0; col < 8; col++) {
				if (n++ >= placed) {
					break;
				}
				boolean door = col == 3 && row < 2;
				boolean window = (col == 1 || col == 6) && row == 2;
				int c = door ? 0xFF8D6E63 : window ? 0xFFB3E5FC : row == 0 || col == 0 || col == 7 ? 0xFF9E9E9E : 0xFFC19A6B;
				block(g, bx + col * s, gy - (row + 1) * s, s, c);
			}
		}
		for (int r = 0; r < 4; r++) {
			for (int col = r; col < 8 - r; col++) {
				if (n++ >= placed) {
					break;
				}
				block(g, bx + col * s, gy - (6 + r) * s, s, 0xFF8E2C2C);
			}
		}
		caption(g, x, y, w, h, "Day " + (1 + (int) (t * 0.35 / Math.PI)) + " · blocks placed: " + Math.min(placed, 62));
	}

	private static void diamonds(GuiGraphics g, int x, int y, int w, int h, double t) {
		int s = Math.max(8, h / 9);
		for (int ty = 0; ty < h / s + 1; ty++) {
			for (int tx = 0; tx < w / s + 1; tx++) {
				double r = Kit.rand("cave", tx * 37 + ty);
				block(g, x + tx * s, y + ty * s, s, r < 0.12 ? 0xFF3A3A3A : 0xFF6E6E6E);
			}
		}
		int rank = 10 - Math.min(9, (int) (t / 14));
		double local = (t % 14) / 14.0;
		int dx = x + w / 2 - s, dy = y + h / 2 - s;
		Gfx.rect(g, x, y, w, h, Gfx.withAlpha(0xFF000000, (int) (120 * (1 - Math.min(1, local * 3)))));
		block(g, dx, dy, s * 2, 0xFF7E7E7E);
		for (int i = 0; i < 6; i++) {
			int px = dx + 3 + (int) (Kit.rand("d" + rank, i) * (s * 2 - 8));
			int py = dy + 3 + (int) (Kit.rand("dy" + rank, i) * (s * 2 - 8));
			Gfx.rect(g, px, py, 4, 3, 0xFF4DD0E1);
		}
		for (int i = 0; i < 8; i++) {
			double a = t * 3 + i;
			int sx = dx + s + (int) (Math.cos(a) * s * 1.6), sy = dy + s + (int) (Math.sin(a * 1.3) * s * 1.6);
			if ((int) (t * 8 + i) % 3 == 0) {
				Gfx.rect(g, sx, sy, 2, 2, 0xFFFFFFFF);
			}
		}
		Gfx.rect(g, x + 8, y + 8, 46, 20, 0xCCD32F2F);
		Gfx.textScaled(g, "#" + rank, x + 12, y + 10, 2f, 0xFFFFFFFF);
	}

	private static void sunset(GuiGraphics g, int x, int y, int w, int h, double t) {
		double p = (t % 90) / 90.0;
		int horizon = y + h * 3 / 5;
		sky(g, x, y, w, horizon - y, Gfx.lerp(0xFF4FC3F7, 0xFF1A1440, (float) p), Gfx.lerp(0xFFFFE082, 0xFFFF7043, (float) Math.min(1, p * 1.5)));
		int sr = Math.max(8, h / 8);
		int sy = y + (int) (h * 0.15 + p * h * 0.5);
		Gfx.scissor(g, x, y, w, horizon - y);
		Gfx.roundRect(g, x + w / 2 - sr, sy, sr * 2, sr * 2, sr, 0xFFFFD54F);
		Gfx.endScissor(g);
		Gfx.gradientV(g, x, horizon, w, y + h - horizon, Gfx.lerp(0xFF1E88E5, 0xFF2A1F5C, (float) p), 0xFF0D1B3E);
		for (int i = 0; i < 18; i++) {
			int ry = horizon + 3 + i * 3;
			int rw = (int) (sr * 2 * (1 - i / 22.0) * (0.6 + 0.4 * Math.sin(t * 2 + i)));
			Gfx.rect(g, x + w / 2 - rw / 2, ry, rw, 1, Gfx.withAlpha(0xFFFFB74D, 200 - i * 9));
		}
		for (int i = 0; i < 4; i++) {
			int cx = x + (int) ((Kit.rand("cloud", i) * w + t * (6 + i * 3)) % (w + 60)) - 30;
			Gfx.rect(g, cx, y + 10 + i * 9, 40, 5, Gfx.withAlpha(0xFFFFE0B2, 160));
		}
	}

	private static void pigs(GuiGraphics g, int x, int y, int w, int h, double t) {
		Gfx.rect(g, x, y, w, h, 0xFF7CB342);
		int lanes = 3, lh = h / (lanes + 1);
		String[] names = {"Porkchop", "Bacon", "Sir Oinksalot"};
		double[] pos = new double[lanes];
		for (int i = 0; i < lanes; i++) {
			pos[i] = ((t * (18 + i * 2) + Math.sin(t * (1.3 + i)) * 12) % (w + 80)) - 40;
			int ly = y + lh / 2 + i * lh;
			Gfx.rect(g, x, ly + lh - 4, w, 2, 0xFFFFFFFF);
			pig(g, x + (int) pos[i], ly + 4, Math.max(1, lh / 14));
			Gfx.text(g, names[i], x + (int) pos[i], ly - 6, 0xFF1B1B1B);
		}
		Gfx.rect(g, x + w - 12, y, 4, h, 0xFFFFFFFF);
		int leader = 0;
		for (int i = 1; i < lanes; i++) {
			if (pos[i] > pos[leader]) {
				leader = i;
			}
		}
		Gfx.rect(g, x + 6, y + 6, 110, 13, 0xAA000000);
		Gfx.text(g, "Leader: " + names[leader], x + 10, y + 9, 0xFFFFEB3B);
	}

	private static void sheep(GuiGraphics g, int x, int y, int w, int h, double t) {
		sky(g, x, y, w, h, 0xFF90CAF9, 0xFFE3F2FD);
		Gfx.rect(g, x, y + h * 3 / 4, w, h / 4, 0xFF7CB342);
		double cycle = (t % 12) / 12.0;
		int u = Math.max(2, h / 22);
		int sx = x + w / 2 - u * 6, sy = y + h * 3 / 4 - u * 9;
		int wool = cycle < 0.5 ? u * 2 : Math.max(0, (int) (u * 2 * (1 - (cycle - 0.5) * 4)));
		Gfx.rect(g, sx - wool, sy - wool, u * 10 + wool * 2, u * 6 + wool * 2, 0xFFF5F5F5);
		Gfx.rect(g, sx, sy, u * 10, u * 6, 0xFFE0D6C8);
		Gfx.rect(g, sx + u * 9, sy - u * 2, u * 4, u * 4, 0xFFBCA58F);
		Gfx.rect(g, sx + u * 11, sy - u, u, u, 0xFF222222);
		Gfx.rect(g, sx + u, sy + u * 6, u * 2, u * 3, 0xFFBCA58F);
		Gfx.rect(g, sx + u * 7, sy + u * 6, u * 2, u * 3, 0xFFBCA58F);
		if (cycle > 0.5) {
			for (int i = 0; i < 10; i++) {
				double life = ((cycle - 0.5) * 2 + i / 10.0) % 1.0;
				int px = sx + (int) (Kit.rand("wool", i) * u * 10);
				int py = sy - (int) (life * u * 10);
				Gfx.rect(g, px, py, u, u, Gfx.withAlpha(0xFFFFFFFF, (int) (230 * (1 - life))));
			}
			Gfx.itemScaled(g, new ItemStack(Items.SHEARS), sx + u * 4, sy - u * 8, 1.5f);
		}
		caption(g, x, y, w, h, cycle > 0.5 ? "*snip snip*" : "*munch*");
	}

	private static void portal(GuiGraphics g, int x, int y, int w, int h, double t) {
		Gfx.rect(g, x, y, w, h, 0xFF2E3B2E);
		int s = Math.max(6, h / 9);
		int fx = x + w / 2 - s * 2, fy = y + h - s * 6;
		int[][] frame = {{0, 0}, {1, 0}, {2, 0}, {3, 0}, {0, 1}, {3, 1}, {0, 2}, {3, 2}, {0, 3}, {3, 3}, {0, 4}, {1, 4}, {2, 4}, {3, 4}};
		int placed = Math.min(frame.length, (int) (t / 4));
		for (int i = 0; i < placed; i++) {
			block(g, fx + frame[i][0] * s, fy + (4 - frame[i][1]) * s, s, 0xFF1A1029);
		}
		boolean lit = placed == frame.length && t > frame.length * 4 + 3;
		if (lit) {
			for (int py = 0; py < s * 3; py += 2) {
				for (int px = 0; px < s * 2; px += 2) {
					double v = Math.sin(px * 0.4 + t * 4) + Math.cos(py * 0.3 - t * 3);
					Gfx.rect(g, fx + s + px, fy + s + py, 2, 2, v > 0 ? 0xFF9C27B0 : 0xFF6A1B9A);
				}
			}
		}
		caption(g, x, y, w, h, lit ? "Step 3: Enter at your own risk" : placed < frame.length ? "Step 1: Place obsidian (" + placed + "/14)" : "Step 2: Flint and steel!");
	}

	private static void unboxing(GuiGraphics g, int x, int y, int w, int h, double t) {
		Gfx.gradientV(g, x, y, w, h, 0xFFFFF3E0, 0xFFFFE0B2);
		Gfx.rect(g, x, y + h * 3 / 4, w, h / 4, 0xFFBCAAA4);
		int bw = Math.max(30, w / 4), bh = bw * 2 / 3;
		int bx = x + w / 2 - bw / 2, by = y + h * 3 / 4 - bh;
		double open = Math.min(1, Math.max(0, (t % 35 - 6) / 4));
		Gfx.rect(g, bx, by, bw, bh, 0xFFC8955A);
		Gfx.rect(g, bx + bw / 2 - 3, by, 6, bh, 0xFFB07B44);
		Gfx.rect(g, bx + bw / 2 - 8, by + bh / 2, 16, 3, 0xFFFF9900);
		int flap = (int) (open * bw / 2);
		Gfx.rect(g, bx - flap / 2, by - 4 - (int) (open * 6), bw / 2, 4, 0xFFD8A56C);
		Gfx.rect(g, bx + bw / 2 + flap / 2, by - 4 - (int) (open * 6), bw / 2, 4, 0xFFD8A56C);
		ItemStack[] items = {new ItemStack(Items.DIAMOND), new ItemStack(Items.CAKE), new ItemStack(Items.GOLDEN_APPLE), new ItemStack(Items.MUSIC_DISC_CAT)};
		for (int i = 0; i < items.length; i++) {
			double local = (t % 35 - 10 - i * 4) / 4;
			if (local > 0) {
				double l = Math.min(1, local);
				int ix = bx + bw / 2 - 8 + (int) ((i - 1.5) * 26 * l);
				int iy = by - (int) (Math.sin(l * Math.PI * 0.9) * 30) - (int) (l * 6);
				Gfx.itemScaled(g, items[i], ix, iy, 1.5f);
			}
		}
		caption(g, x, y, w, h, open < 1 ? "OMG it's here!!" : "Guys… GUYS. A CAKE.");
	}

	private static void dragon(GuiGraphics g, int x, int y, int w, int h, double t) {
		Gfx.rect(g, x, y, w, h, 0xFF0B0814);
		for (int i = 0; i < 40; i++) {
			Gfx.rect(g, x + (int) (Kit.rand("estars", i) * w), y + (int) (Kit.rand("estarsy", i) * h * 0.6), 1, 1, 0x88FFFFFF);
		}
		Gfx.rect(g, x, y + h - 18, w, 18, 0xFFE8E6B4);
		for (int i = 0; i < 4; i++) {
			int px = x + 20 + i * (w - 40) / 3;
			int ph = 30 + (int) (Kit.rand("pillar", i) * 30);
			Gfx.rect(g, px - 6, y + h - 18 - ph, 12, ph, 0xFF1C1424);
			boolean alive = t % 40 < 10 + i * 8;
			if (alive) {
				Gfx.rect(g, px - 3, y + h - 24 - ph, 6, 6, (int) (t * 6) % 2 == 0 ? 0xFFF48FB1 : 0xFFCE93D8);
			} else if (t % 40 < 12 + i * 8) {
				Gfx.roundRect(g, px - 10, y + h - 30 - ph, 20, 16, 8, 0xCCFFF59D);
			}
		}
		double dxp = (Math.sin(t * 0.6) * 0.4 + 0.5) * w;
		double dyp = (Math.cos(t * 1.1) * 0.15 + 0.3) * h;
		int dx = x + (int) dxp, dy = y + (int) dyp;
		int flap = (int) (Math.sin(t * 6) * 8);
		Gfx.rect(g, dx - 18, dy, 36, 6, 0xFF151017);
		Gfx.rect(g, dx - 40, dy - flap, 22, 4, 0xFF221A2B);
		Gfx.rect(g, dx + 18, dy - flap, 22, 4, 0xFF221A2B);
		Gfx.rect(g, dx + 18, dy - 4, 10, 8, 0xFF151017);
		Gfx.rect(g, dx + 24, dy - 2, 2, 2, 0xFFE040FB);
		Gfx.rect(g, x + 8, y + 8, Math.max(0, (int) ((w - 16) * (1 - (t % 40) / 40.0))), 4, 0xFFE040FB);
		Gfx.text(g, "Ender Dragon", x + w / 2 - 30, y + 14, 0xFFFFFFFF);
	}

	private static void cats(GuiGraphics g, int x, int y, int w, int h, double t) {
		Gfx.rect(g, x, y, w, h, 0xFFFFF8E1);
		Gfx.rect(g, x, y + h * 2 / 3, w, h / 3, 0xFFD7CCC8);
		int tx = x + w / 4, ty = y + h / 2;
		Gfx.rect(g, tx, ty, w / 2, 5, 0xFF8D6E63);
		Gfx.rect(g, tx + 4, ty + 5, 4, h / 6 + 6, 0xFF6D4C41);
		Gfx.rect(g, tx + w / 2 - 8, ty + 5, 4, h / 6 + 6, 0xFF6D4C41);
		double c = (t % 8) / 8.0;
		int catX = tx + (int) (Math.min(c * 2, 0.75) * (w / 2 - 30));
		int u = Math.max(2, h / 40);
		Gfx.rect(g, catX, ty - u * 5, u * 8, u * 5, 0xFFFFA726);
		Gfx.rect(g, catX + u * 7, ty - u * 8, u * 4, u * 4, 0xFFFFA726);
		Gfx.rect(g, catX + u * 7, ty - u * 9, u, u, 0xFFFFA726);
		Gfx.rect(g, catX + u * 10, ty - u * 9, u, u, 0xFFFFA726);
		Gfx.rect(g, catX + u * 8, ty - u * 7, u, u, 0xFF2E7D32);
		Gfx.rect(g, catX - u * 2, ty - u * 7 + (int) (Math.sin(t * 5) * u), u * 2, u, 0xFFFFA726);
		int cupX = tx + w / 2 - 20;
		if (c < 0.45) {
			Gfx.itemScaled(g, new ItemStack(Items.FLOWER_POT), cupX, ty - 16, 1f);
		} else {
			double fall = Math.min(1, (c - 0.45) * 4);
			Gfx.itemScaled(g, new ItemStack(Items.FLOWER_POT), cupX + 16 + (int) (fall * 10), ty - 16 + (int) (fall * fall * (h / 3.0)), 1f);
		}
		caption(g, x, y, w, h, c > 0.6 ? "He did it on purpose." : "…");
	}
}
