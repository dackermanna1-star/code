package com.mineception.dream;

import com.mineception.dream.render.Camera;
import java.awt.image.BufferedImage;
import java.io.File;
import java.io.IOException;
import java.util.EnumMap;
import java.util.Map;
import javax.imageio.ImageIO;

/**
 * Offline layout preview for the world generator: flat-colour pictures of each level (first-person spawn view with
 * the deeper levels on the laptop screens, the 40x25 thumbnail, a top-down map and a side slice through the laptop),
 * written as PNG contact sheets. Independent of the real raycaster so layouts can be judged on their own.
 */
public final class LayoutPreview {
	private static final Map<MiniBlock, int[]> COLORS = new EnumMap<>(MiniBlock.class);

	static {
		color(MiniBlock.BEDROCK, 0x555555, 0x555555);
		color(MiniBlock.STONE, 0x7D7D7D, 0x7D7D7D);
		color(MiniBlock.DIRT, 0x866043, 0x866043);
		color(MiniBlock.GRASS, 0x5E9A44, 0x7E6B41);
		color(MiniBlock.COBBLESTONE, 0x7F7F7F, 0x7F7F7F);
		color(MiniBlock.OAK_PLANKS, 0xA2824E, 0xA2824E);
		color(MiniBlock.OAK_LOG, 0x977949, 0x6D5532);
		color(MiniBlock.OAK_LEAVES, 0x3C7A22, 0x3C7A22);
		color(MiniBlock.SAND, 0xDBCFA3, 0xDBCFA3);
		color(MiniBlock.SANDSTONE, 0xDFD6AA, 0xD8CB9B);
		color(MiniBlock.WATER, 0x2B519E, 0x2B519E);
		color(MiniBlock.GLASS, 0xAFD5DB, 0xAFD5DB);
		color(MiniBlock.BRICKS, 0x966153, 0x966153);
		color(MiniBlock.STONE_BRICKS, 0x7A797A, 0x7A797A);
		color(MiniBlock.MOSSY_STONE_BRICKS, 0x737969, 0x737969);
		color(MiniBlock.CRACKED_STONE_BRICKS, 0x767576, 0x767576);
		color(MiniBlock.SMOOTH_STONE, 0x9E9E9E, 0x9E9E9E);
		color(MiniBlock.GRAY_CONCRETE, 0x36393D, 0x36393D);
		color(MiniBlock.LIGHT_GRAY_CONCRETE, 0x7D7D73, 0x7D7D73);
		color(MiniBlock.QUARTZ_BLOCK, 0xEBE5DE, 0xEBE5DE);
		color(MiniBlock.RED_WOOL, 0xA02722, 0xA02722);
		color(MiniBlock.WHITE_WOOL, 0xE9ECEC, 0xE9ECEC);
		color(MiniBlock.TERRACOTTA, 0x985E43, 0x985E43);
		color(MiniBlock.DARK_OAK_PLANKS, 0x422B14, 0x422B14);
		color(MiniBlock.SPRUCE_LOG, 0x6C502E, 0x3A2510);
		color(MiniBlock.SPRUCE_LEAVES, 0x2F4B2F, 0x2F4B2F);
		color(MiniBlock.SNOW_BLOCK, 0xF9FEFE, 0xF9FEFE);
		color(MiniBlock.ICE, 0x91B7FD, 0x91B7FD);
		color(MiniBlock.PACKED_ICE, 0x8DB4FA, 0x8DB4FA);
		color(MiniBlock.GLOWSTONE, 0xE8C070, 0xE8C070);
		color(MiniBlock.BOOKSHELF, 0xA2824E, 0x755E3B);
		color(MiniBlock.POLISHED_ANDESITE, 0x848685, 0x848685);
		color(MiniBlock.BLACK_CONCRETE, 0x080A0F, 0x080A0F);
		color(MiniBlock.YELLOW_CONCRETE, 0xF0AF15, 0xF0AF15);
		color(MiniBlock.SEA_LANTERN, 0xC8E0D8, 0xC8E0D8);
		color(MiniBlock.LAPTOP, 0x2B2B2E, 0x2B2B2E);
		color(MiniBlock.CRAFTING_TABLE, 0x77492A, 0x816946);
		color(MiniBlock.DEEPSLATE_TILES, 0x363637, 0x363637);
		color(MiniBlock.PRISMARINE, 0x62A291, 0x62A291);
	}

	private static void color(MiniBlock block, int top, int side) {
		COLORS.put(block, new int[]{top, side});
	}

	private LayoutPreview() {
	}

	public static void main(String[] args) throws IOException {
		File dir = new File(args.length > 0 ? args[0] : "build/preview/layout");
		long[] seeds = {1L, 42L, 1234567L, -99L, 7L, 31337L};
		for (int depth = 1; depth <= Theme.DEPTHS; depth++) {
			writeSheet(dir, seeds[0], depth);
			writeSheet(dir, seeds[1], depth);
			writeSeedGrid(dir, seeds, depth);
		}
	}

	/** One level for one seed: spawn view, thumbnail, top-down map and side slice. */
	public static void writeSheet(File dir, long seed, int depth) throws IOException {
		MiniWorld world = WorldGen.generate(seed, depth);
		int vw = 320;
		int vh = 200;
		int[] view = spawnView(seed, depth, vw, vh, 3);
		int[] thumb = spawnView(seed, depth, 40, 25, 3);
		BufferedImage sheet = new BufferedImage(640, 200 + 320 + 4, BufferedImage.TYPE_INT_RGB);
		blit(sheet, view, vw, vh, 0, 0, 1);
		blit(sheet, thumb, 40, 25, 320, 0, 8);
		blit(sheet, topDown(world, MiniWorld.SY), 40, 40, 0, 204, 8);
		int[] slice = sideSlice(world);
		blit(sheet, slice, 40, MiniWorld.SY, 320, 204, 8);
		write(sheet, new File(dir, "level" + depth + "_seed" + seed + ".png"));
		write(scaled(topDown(world, world.laptopY + 2), 40, 40, 8), new File(dir, "level" + depth + "_seed" + seed + "_cutaway.png"));
	}

	/** First-person views of several seeds side by side, to judge variety. */
	public static void writeSeedGrid(File dir, long[] seeds, int depth) throws IOException {
		int vw = 320;
		int vh = 200;
		BufferedImage grid = new BufferedImage(vw * 3, vh * 2, BufferedImage.TYPE_INT_RGB);
		for (int i = 0; i < Math.min(6, seeds.length); i++) {
			blit(grid, spawnView(seeds[i], depth, vw, vh, 2), vw, vh, (i % 3) * vw, (i / 3) * vh, 1);
		}
		write(grid, new File(dir, "level" + depth + "_seeds.png"));
	}

	private static BufferedImage scaled(int[] pixels, int w, int h, int scale) {
		BufferedImage img = new BufferedImage(w * scale, h * scale, BufferedImage.TYPE_INT_RGB);
		blit(img, pixels, w, h, 0, 0, scale);
		return img;
	}

	private static void blit(BufferedImage img, int[] pixels, int w, int h, int ox, int oy, int scale) {
		for (int y = 0; y < h * scale; y++) {
			for (int x = 0; x < w * scale; x++) {
				img.setRGB(ox + x, oy + y, pixels[(y / scale) * w + x / scale]);
			}
		}
	}

	private static void write(BufferedImage img, File file) throws IOException {
		file.getParentFile().mkdirs();
		ImageIO.write(img, "png", file);
	}

	/** The idle avatar's view of a level, with deeper levels rendered on the laptop screens down to {@code nesting}. */
	public static int[] spawnView(long seed, int depth, int width, int height, int nesting) {
		MiniWorld world = WorldGen.generate(seed, depth);
		int[] child = null;
		int cw = 0;
		int ch = 0;
		if (depth < Theme.DEPTHS && nesting > 0) {
			cw = Math.max(16, width / 2);
			ch = (int) Math.round(cw / LaptopGeometry.SCREEN_ASPECT);
			child = spawnView(seed, depth + 1, cw, ch, nesting - 1);
		}
		Camera camera = new Camera(world.spawnX, world.spawnY + MiniPlayer.EYE_HEIGHT, world.spawnZ, world.spawnYaw, world.spawnPitch, 70.0F);
		return render(world, camera, width, height, child, cw, ch);
	}

	public static int[] render(MiniWorld world, Camera camera, int width, int height, int[] child, int cw, int ch) {
		int[] out = new int[width * height];
		double[] f = camera.forward();
		double[] r = camera.right();
		double[] u = camera.up();
		double tanHalf = Math.tan(Math.toRadians(camera.fov()) / 2.0);
		double aspect = (double) width / height;
		for (int py = 0; py < height; py++) {
			for (int px = 0; px < width; px++) {
				double sx = ((px + 0.5) / width * 2.0 - 1.0) * tanHalf * aspect;
				double sy = (1.0 - (py + 0.5) / height * 2.0) * tanHalf;
				double dx = f[0] + r[0] * sx + u[0] * sy;
				double dy = f[1] + r[1] * sx + u[1] * sy;
				double dz = f[2] + r[2] * sx + u[2] * sy;
				double len = Math.sqrt(dx * dx + dy * dy + dz * dz);
				out[py * width + px] = trace(world, camera.x(), camera.y(), camera.z(), dx / len, dy / len, dz / len, child, cw, ch);
			}
		}
		return out;
	}

	private static int trace(MiniWorld w, double ox, double oy, double oz, double dx, double dy, double dz, int[] child, int cw, int ch) {
		Theme theme = w.theme;
		double maxDist = theme.fogDistance + 4.0;
		int x = (int) Math.floor(ox);
		int y = (int) Math.floor(oy);
		int z = (int) Math.floor(oz);
		int stepX = dx > 0 ? 1 : -1;
		int stepY = dy > 0 ? 1 : -1;
		int stepZ = dz > 0 ? 1 : -1;
		double tdx = Math.abs(1.0 / dx);
		double tdy = Math.abs(1.0 / dy);
		double tdz = Math.abs(1.0 / dz);
		double tmx = (dx > 0 ? x + 1 - ox : ox - x) * tdx;
		double tmy = (dy > 0 ? y + 1 - oy : oy - y) * tdy;
		double tmz = (dz > 0 ? z + 1 - oz : oz - z) * tdz;
		double t = 0.0;
		int face = -1;
		// Accumulated translucent tint
		double tr = 1.0;
		double tg = 1.0;
		double tb = 1.0;
		double keep = 1.0;
		double ar = 0;
		double ag = 0;
		double ab = 0;
		MiniBlock previous = w.get(x, y, z);
		while (t < maxDist) {
			MiniBlock b = w.get(x, y, z);
			if (b != MiniBlock.AIR && face >= 0) {
				if (b == MiniBlock.LAPTOP) {
					int c = laptop(w, x, y, z, ox, oy, oz, dx, dy, dz, child, cw, ch);
					if (c != 0) {
						return blend(fog(theme, c, t), ar, ag, ab, keep);
					}
				} else if (b == MiniBlock.WATER || b == MiniBlock.GLASS || b == MiniBlock.ICE) {
					if (b != previous) {
						int c = shade(w, b, face, x, y, z, ox + dx * t, oy + dy * t, oz + dz * t);
						double a = b == MiniBlock.WATER ? 0.55 : b == MiniBlock.ICE ? 0.5 : 0.22;
						ar += keep * a * (c >> 16 & 0xFF);
						ag += keep * a * (c >> 8 & 0xFF);
						ab += keep * a * (c & 0xFF);
						keep *= 1.0 - a;
					}
				} else {
					int c = shade(w, b, face, x, y, z, ox + dx * t, oy + dy * t, oz + dz * t);
					return blend(fog(theme, c, t), ar, ag, ab, keep);
				}
			}
			previous = b;
			if (tmx < tmy && tmx < tmz) {
				x += stepX;
				t = tmx;
				tmx += tdx;
				face = stepX > 0 ? 4 : 5;
			} else if (tmy < tmz) {
				y += stepY;
				t = tmy;
				tmy += tdy;
				face = stepY > 0 ? 0 : 1;
			} else {
				z += stepZ;
				t = tmz;
				tmz += tdz;
				face = stepZ > 0 ? 2 : 3;
			}
			if (y < -2 && dy < 0 || y > MiniWorld.SY + 2 && dy > 0) {
				break;
			}
		}
		return blend(sky(theme, dy, t >= maxDist ? 1.0 : 0.0), ar, ag, ab, keep);
	}

	private static int blend(int c, double ar, double ag, double ab, double keep) {
		int r = (int) Math.min(255, ar + keep * (c >> 16 & 0xFF));
		int g = (int) Math.min(255, ag + keep * (c >> 8 & 0xFF));
		int b = (int) Math.min(255, ab + keep * (c & 0xFF));
		return r << 16 | g << 8 | b;
	}

	private static int sky(Theme theme, double dy, double fogged) {
		if (theme.indoor) {
			return theme.fogColor & 0xFFFFFF;
		}
		double t = Math.max(0.0, Math.min(1.0, dy * 2.0));
		int c = lerp(theme.skyDayHorizon, theme.skyDayTop, t);
		return lerp(c, theme.fogColor, Math.max(0, 1 - Math.abs(dy) * 6) * 0.6) & 0xFFFFFF;
	}

	private static int fog(Theme theme, int c, double dist) {
		double t = Math.max(0.0, Math.min(1.0, dist / theme.fogDistance));
		return lerp(c, theme.fogColor, t * t) & 0xFFFFFF;
	}

	/**
	 * Flat colour of a face with Minecraft-like directional shading, a per-block brightness jitter and darker block
	 * edges so individual blocks stay readable.
	 *
	 * @param face 0 = hit through its bottom (ray going up), 1 = top, 2 = north, 3 = south, 4 = west, 5 = east
	 */
	private static int shade(MiniWorld w, MiniBlock b, int face, int x, int y, int z, double hx, double hy, double hz) {
		int[] cs = COLORS.getOrDefault(b, new int[]{0xFF00FF, 0xFF00FF});
		int c = face == 1 || face == 0 ? cs[0] : cs[1];
		double light = switch (face) {
			case 1 -> 1.0;
			case 0 -> 0.5;
			case 2, 3 -> 0.8;
			default -> 0.6;
		};
		if (b.light > 0) {
			light = 1.0;
		} else if (w.theme.indoor) {
			light *= 0.92;
		}
		double u;
		double v;
		if (face <= 1) {
			u = hx - x;
			v = hz - z;
		} else if (face <= 3) {
			u = hx - x;
			v = hy - y;
		} else {
			u = hz - z;
			v = hy - y;
		}
		double edge = Math.min(Math.min(u, 1 - u), Math.min(v, 1 - v));
		if (edge < 0.06) {
			light *= 0.82;
		}
		light *= 0.94 + 0.12 * DreamRandom.hash01(7L, x, y, z);
		int r = (int) Math.min(255, (c >> 16 & 0xFF) * light);
		int g = (int) Math.min(255, (c >> 8 & 0xFF) * light);
		int bl = (int) Math.min(255, (c & 0xFF) * light);
		return r << 16 | g << 8 | bl;
	}

	/** Ray against the laptop's deck and lid; the screen shows the child picture. Returns 0 on a miss. */
	private static int laptop(MiniWorld w, int cx, int cy, int cz, double ox, double oy, double oz, double dx, double dy, double dz,
							  int[] child, int cw, int ch) {
		double[][] boxes = LaptopGeometry.boxes(w.laptopFacing);
		double best = Double.MAX_VALUE;
		int bestBox = -1;
		for (int i = 0; i < boxes.length; i++) {
			double[] bx = boxes[i];
			double t = hitBox(ox - cx, oy - cy, oz - cz, dx, dy, dz, bx);
			if (t >= 0 && t < best) {
				best = t;
				bestBox = i;
			}
		}
		if (bestBox < 0) {
			return 0;
		}
		double hx = ox - cx + dx * best;
		double hy = oy - cy + dy * best;
		double hz = oz - cz + dz * best;
		if (bestBox == 1) {
			double[] f = LaptopGeometry.screenFrame(w.laptopFacing);
			double px = hx - f[0];
			double py = hy - f[1];
			double pz = hz - f[2];
			double sw = f[3] * f[3] + f[4] * f[4] + f[5] * f[5];
			double sh = f[6] * f[6] + f[7] * f[7] + f[8] * f[8];
			double su = (px * f[3] + py * f[4] + pz * f[5]) / sw;
			double sv = -(px * f[6] + py * f[7] + pz * f[8]) / sh;
			Face facing = w.laptopFacing;
			double toward = dx * facing.dx + dz * facing.dz;
			if (su >= 0 && su <= 1 && sv >= 0 && sv <= 1 && toward < 0) {
				if (child == null) {
					long h = DreamRandom.hash(cx, (int) (su * 64), (int) (sv * 40), 3);
					int g = (int) (h & 0x7F) + 64;
					return g << 16 | g << 8 | g;
				}
				int ix = Math.min(cw - 1, (int) (su * cw));
				int iy = Math.min(ch - 1, (int) (sv * ch));
				return child[iy * cw + ix];
			}
		}
		return 0x2B2B2E;
	}

	private static double hitBox(double ox, double oy, double oz, double dx, double dy, double dz, double[] b) {
		double t0 = -1e9;
		double t1 = 1e9;
		double[] o = {ox, oy, oz};
		double[] d = {dx, dy, dz};
		for (int a = 0; a < 3; a++) {
			if (Math.abs(d[a]) < 1e-12) {
				if (o[a] < b[a] || o[a] > b[a + 3]) {
					return -1;
				}
				continue;
			}
			double ta = (b[a] - o[a]) / d[a];
			double tb = (b[a + 3] - o[a]) / d[a];
			t0 = Math.max(t0, Math.min(ta, tb));
			t1 = Math.min(t1, Math.max(ta, tb));
		}
		return t1 >= t0 && t1 > 0 ? Math.max(t0, 0) : -1;
	}

	private static int lerp(int a, int b, double t) {
		int ar = a >> 16 & 0xFF;
		int ag = a >> 8 & 0xFF;
		int ab = a & 0xFF;
		int r = (int) (ar + ((b >> 16 & 0xFF) - ar) * t);
		int g = (int) (ag + ((b >> 8 & 0xFF) - ag) * t);
		int bl = (int) (ab + ((b & 0xFF) - ab) * t);
		return r << 16 | g << 8 | bl;
	}

	/** Top-down map: the highest block below {@code maxY} in each column, darker the lower it is. */
	public static int[] topDown(MiniWorld w, int maxY) {
		int[] out = new int[MiniWorld.SX * MiniWorld.SZ];
		for (int z = 0; z < MiniWorld.SZ; z++) {
			for (int x = 0; x < MiniWorld.SX; x++) {
				int c = 0x000000;
				for (int y = Math.min(maxY, MiniWorld.SY) - 1; y >= 0; y--) {
					MiniBlock b = w.get(x, y, z);
					if (b != MiniBlock.AIR) {
						int base = COLORS.getOrDefault(b, new int[]{0xFF00FF})[0];
						if (b == MiniBlock.LAPTOP) {
							base = 0xFF00FF;
						}
						double k = 0.45 + 0.55 * y / (MiniWorld.SY - 1.0);
						c = lerp(0, base, k);
						break;
					}
				}
				out[z * MiniWorld.SX + x] = c;
			}
		}
		int sx = (int) Math.floor(w.spawnX);
		int sz = (int) Math.floor(w.spawnZ);
		out[sz * MiniWorld.SX + sx] = 0x00FFFF;
		return out;
	}

	/** Vertical slice through the laptop along its facing (the view axis), seen from the side. */
	public static int[] sideSlice(MiniWorld w) {
		int[] out = new int[40 * MiniWorld.SY];
		boolean alongZ = w.laptopFacing.dz != 0;
		for (int a = 0; a < 40; a++) {
			for (int y = 0; y < MiniWorld.SY; y++) {
				int x = alongZ ? w.laptopX : a;
				int z = alongZ ? a : w.laptopZ;
				MiniBlock b = w.get(x, y, z);
				int c = b == MiniBlock.AIR ? 0xB0C8E0 : COLORS.getOrDefault(b, new int[]{0, 0xFF00FF})[1];
				if (b == MiniBlock.LAPTOP) {
					c = 0xFF00FF;
				}
				out[(MiniWorld.SY - 1 - y) * 40 + a] = c;
			}
		}
		int sa = alongZ ? (int) Math.floor(w.spawnZ) : (int) Math.floor(w.spawnX);
		int sy = (int) Math.floor(w.spawnY);
		out[(MiniWorld.SY - 1 - sy) * 40 + sa] = 0x00FFFF;
		out[(MiniWorld.SY - 2 - sy) * 40 + sa] = 0x00FFFF;
		return out;
	}
}
