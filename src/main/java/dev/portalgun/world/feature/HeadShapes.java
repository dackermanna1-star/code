package dev.portalgun.world.feature;

import net.minecraft.core.Direction;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

/** Head geometry for giant plants / custom trees. (cx, cz) is the stem centre, cy the first block above the stem top. */
final class HeadShapes {
	private HeadShapes() {
	}

	static void build(Placer p, String shape, double cx, int cy, double cz, int r, BlockState stem, BlockState head,
		@Nullable BlockState deco) {
		switch (shape) {
			case "flat" -> flat(p, cx, cy, cz, r, head, deco);
			case "umbrella" -> umbrella(p, cx, cy, cz, r, stem, head, deco);
			case "sphere" -> sphere(p, cx, cy, cz, r, head, deco);
			case "cone" -> cone(p, cx, cy, cz, r, stem, head, deco);
			case "flower" -> flower(p, cx, cy, cz, r, head, deco);
			case "puff" -> puff(p, cx, cy, cz, r, stem, head, deco);
			case "palm" -> palm(p, cx, cy, cz, r, head, deco);
			case "tuft" -> tuft(p, cx, cy, cz, r, head, deco);
			default -> dome(p, cx, cy, cz, r, head, deco);
		}
	}

	private static double hd(int x, int z, double cx, double cz) {
		double ex = x + 0.5 - cx;
		double ez = z + 0.5 - cz;
		return Math.sqrt(ex * ex + ez * ez);
	}

	/** Hangs a decoration under (x, y, z) - a chain of 1-3 for hanging plants, facing down for clusters. */
	static void hang(Placer p, int x, int y, int z, BlockState deco) {
		BlockState s = deco.hasProperty(BlockStateProperties.FACING) ? deco.setValue(BlockStateProperties.FACING, Direction.DOWN) : deco;
		int len = 1 + p.random.nextInt(3);
		for (int i = 1; i <= len; i++) {
			if (!p.setDecoration(x, y - i, z, s)) {
				return;
			}
			if (s.hasProperty(BlockStateProperties.FACING)) {
				return;
			}
		}
	}

	/** Sits a decoration on top of (x, y, z). */
	static void sitOn(Placer p, int x, int y, int z, BlockState deco) {
		BlockState s = deco.hasProperty(BlockStateProperties.FACING) ? deco.setValue(BlockStateProperties.FACING, Direction.UP) : deco;
		p.setDecoration(x, y + 1, z, s);
	}

	/** Paints blobs of {@code deco} onto existing blocks of {@code head} around random surface points. */
	private static void spots(Placer p, double cx, double cy, double cz, double rx, double ry, int count, BlockState head, BlockState deco,
		double minElev) {
		RandomSource rnd = p.random;
		for (int i = 0; i < count; i++) {
			double th = rnd.nextDouble() * Math.PI * 2;
			double el = minElev + rnd.nextDouble() * (Math.PI / 2 - minElev);
			double sx = cx + Math.cos(th) * Math.cos(el) * rx;
			double sy = cy + Math.sin(el) * ry;
			double sz = cz + Math.sin(th) * Math.cos(el) * rx;
			double sr = 0.6 + rnd.nextDouble() * Math.max(0.4, Math.min(1.3, rx * 0.18));
			int r0 = (int) Math.ceil(sr) + 1;
			for (int dx = -r0; dx <= r0; dx++) {
				for (int dy = -r0; dy <= r0; dy++) {
					for (int dz = -r0; dz <= r0; dz++) {
						int x = Mth.floor(sx) + dx;
						int y = Mth.floor(sy) + dy;
						int z = Mth.floor(sz) + dz;
						double ex = x + 0.5 - sx;
						double ey = y + 0.5 - sy;
						double ez = z + 0.5 - sz;
						if (ex * ex + ey * ey + ez * ez <= sr * sr && p.get(x, y, z).is(head.getBlock())) {
							p.set(x, y, z, deco);
						}
					}
				}
			}
		}
	}

	// ------------------------------------------------------------------------------------------------------- dome

	static void dome(Placer p, double cx, int cy, double cz, int r, BlockState head, @Nullable BlockState deco) {
		RandomSource rnd = p.random;
		double ry = Math.max(2.0, r * 0.72);
		double ri = r - 1.3;
		double ryi = ry - 1.3;
		int bx = Mth.floor(cx);
		int bz = Mth.floor(cz);
		int base = cy - 1;
		Wobble wob = new Wobble(rnd, 3, 0.5);
		for (int dx = -r - 1; dx <= r + 1; dx++) {
			for (int dz = -r - 1; dz <= r + 1; dz++) {
				int x = bx + dx;
				int z = bz + dz;
				double h = hd(x, z, cx, cz);
				double rr = r + wob.at(x, 0, z) * 0.35;
				for (int dy = -2; dy <= Math.ceil(ry); dy++) {
					int y = base + dy;
					if (dy >= 0) {
						double o = (h / rr) * (h / rr) + (dy / ry) * (dy / ry);
						boolean inner = ri > 0.6 && (h / ri) * (h / ri) + ((dy + 0.5) / ryi) * ((dy + 0.5) / ryi) <= 1.0;
						if (o <= 1.0 && !inner) {
							p.setSoft(x, y, z, head);
						}
					} else if (r >= 3) {
						boolean ring = h >= rr - 1.25 && h <= rr + 0.25;
						if (ring && (dy == -1 || r >= 5 && rnd.nextFloat() < 0.55F)) {
							p.setSoft(x, y, z, head);
						}
					}
				}
			}
		}
		if (deco != null) {
			if (GiantPlantFeature.isAttachable(deco)) {
				for (int dx = -r; dx <= r; dx++) {
					for (int dz = -r; dz <= r; dz++) {
						int x = bx + dx;
						int z = bz + dz;
						double h = hd(x, z, cx, cz);
						if (h > r - 2.0 && h < r + 0.3 && rnd.nextFloat() < 0.3F) {
							int y = r >= 3 ? base - 1 : base;
							for (int k = 0; k < 2 && !p.get(x, y, z).is(head.getBlock()); k++) {
								y++;
							}
							if (p.get(x, y, z).is(head.getBlock())) {
								hang(p, x, y, z, deco);
							}
						}
					}
				}
			} else {
				spots(p, cx, base, cz, r, ry, 2 + r * 2, head, deco, 0.2);
			}
		}
	}

	// ------------------------------------------------------------------------------------------------------- flat

	static void flat(Placer p, double cx, int cy, double cz, int r, BlockState head, @Nullable BlockState deco) {
		RandomSource rnd = p.random;
		Wobble wob = new Wobble(rnd, 3, 0.45);
		int bx = Mth.floor(cx);
		int bz = Mth.floor(cz);
		for (int dx = -r - 1; dx <= r + 1; dx++) {
			for (int dz = -r - 1; dz <= r + 1; dz++) {
				int x = bx + dx;
				int z = bz + dz;
				double h = hd(x, z, cx, cz);
				double edge = r + wob.at(x, 0, z) * 0.8;
				if (h > edge) {
					continue;
				}
				p.setSoft(x, cy, z, head);
				if (h < edge * 0.45) {
					p.setSoft(x, cy + 1, z, head);
				}
				if (h > edge - 1.0 && r >= 3) {
					p.setSoft(x, cy - 1, z, head);
				}
				if (deco != null && rnd.nextFloat() < 0.12F) {
					if (GiantPlantFeature.isAttachable(deco)) {
						if (h > edge - 1.5 && r >= 3) {
							hang(p, x, cy - 1, z, deco);
						} else {
							sitOn(p, x, h < edge * 0.45 ? cy + 1 : cy, z, deco);
						}
					} else {
						p.set(x, h < edge * 0.45 ? cy + 1 : cy, z, deco);
					}
				}
			}
		}
	}

	// --------------------------------------------------------------------------------------------------- umbrella

	static void umbrella(Placer p, double cx, int cy, double cz, int r, BlockState stem, BlockState head, @Nullable BlockState deco) {
		RandomSource rnd = p.random;
		int bx = Mth.floor(cx);
		int bz = Mth.floor(cz);
		double rise = r * 0.45;
		int peak = cy + (int) Math.round(rise);
		for (int y = cy - 1; y < peak; y++) {
			p.setSoft(bx, y, bz, stem);
		}
		for (int dx = -r - 1; dx <= r + 1; dx++) {
			for (int dz = -r - 1; dz <= r + 1; dz++) {
				int x = bx + dx;
				int z = bz + dz;
				double h = hd(x, z, cx, cz);
				if (h > r + 0.3) {
					continue;
				}
				double t = h / r;
				int y = cy + (int) Math.round((1 - t) * rise);
				p.setSoft(x, y, z, head);
				if (t > 0.82) {
					p.setSoft(x, y - 1, z, head);
				}
				if (deco != null && GiantPlantFeature.isAttachable(deco) && t > 0.75 && rnd.nextFloat() < 0.18F) {
					hang(p, x, t > 0.82 ? y - 1 : y, z, deco);
				}
			}
		}
		p.setSoft(bx, peak + 1, bz, head);
		if (deco != null && !GiantPlantFeature.isAttachable(deco)) {
			// ribs under the canopy
			int spokes = 6 + rnd.nextInt(3);
			double a0 = rnd.nextDouble() * Math.PI * 2;
			for (int i = 0; i < spokes; i++) {
				double a = a0 + i * Math.PI * 2 / spokes;
				for (double s = 1.0; s <= r - 0.5; s += 0.5) {
					int x = Mth.floor(cx + Math.cos(a) * s);
					int z = Mth.floor(cz + Math.sin(a) * s);
					double t = hd(x, z, cx, cz) / r;
					int y = cy + (int) Math.round((1 - t) * rise) - 1;
					p.setSoft(x, y, z, deco);
				}
			}
		}
	}

	// ----------------------------------------------------------------------------------------------------- sphere

	static void blob(Placer p, double cx, double cy, double cz, double rad, BlockState head) {
		Wobble wob = new Wobble(p.random, 4, 1.4 / Math.max(1.0, rad));
		int r0 = (int) Math.ceil(rad * 1.15) + 1;
		int bx = Mth.floor(cx);
		int by = Mth.floor(cy);
		int bz = Mth.floor(cz);
		for (int dx = -r0; dx <= r0; dx++) {
			for (int dy = -r0; dy <= r0; dy++) {
				for (int dz = -r0; dz <= r0; dz++) {
					int x = bx + dx;
					int y = by + dy;
					int z = bz + dz;
					double ex = x + 0.5 - cx;
					double ey = y + 0.5 - cy;
					double ez = z + 0.5 - cz;
					double d = Math.sqrt(ex * ex + ey * ey + ez * ez);
					if (d <= rad * (1.0 + 0.1 * wob.at(x, y, z)) + 0.2) {
						p.setSoft(x, y, z, head);
					}
				}
			}
		}
	}

	private static void sprinkle(Placer p, double cx, double cy, double cz, double rad, BlockState head, BlockState deco, float chance) {
		RandomSource rnd = p.random;
		int r0 = (int) Math.ceil(rad * 1.2) + 1;
		int bx = Mth.floor(cx);
		int by = Mth.floor(cy);
		int bz = Mth.floor(cz);
		boolean attach = GiantPlantFeature.isAttachable(deco);
		for (int dx = -r0; dx <= r0; dx++) {
			for (int dy = -r0; dy <= r0; dy++) {
				for (int dz = -r0; dz <= r0; dz++) {
					int x = bx + dx;
					int y = by + dy;
					int z = bz + dz;
					if (!p.get(x, y, z).is(head.getBlock()) || rnd.nextFloat() >= chance) {
						continue;
					}
					if (attach) {
						if (dy < 0 && p.get(x, y - 1, z).isAir()) {
							hang(p, x, y, z, deco);
						}
					} else if (exposed(p, x, y, z)) {
						p.set(x, y, z, deco);
					}
				}
			}
		}
	}

	private static boolean exposed(Placer p, int x, int y, int z) {
		for (Direction d : Direction.values()) {
			if (p.get(x + d.getStepX(), y + d.getStepY(), z + d.getStepZ()).isAir()) {
				return true;
			}
		}
		return false;
	}

	static void sphere(Placer p, double cx, int cy, double cz, int r, BlockState head, @Nullable BlockState deco) {
		double center = cy - 1 + r;
		blob(p, cx, center, cz, r, head);
		if (deco != null) {
			sprinkle(p, cx, center, cz, r, head, deco, GiantPlantFeature.isAttachable(deco) ? 0.25F : 0.1F);
		}
	}

	// ------------------------------------------------------------------------------------------------------- cone

	static void cone(Placer p, double cx, int cy, double cz, int r, BlockState stem, BlockState head, @Nullable BlockState deco) {
		RandomSource rnd = p.random;
		int bx = Mth.floor(cx);
		int bz = Mth.floor(cz);
		int height = (int) Math.round(r * 1.8) + 1;
		int base = cy - Math.max(1, (int) Math.round(r * 0.4));
		int tiers = Math.max(1, r / 2);
		for (int y = cy - 1; y < base + height - 1; y++) {
			p.setSoft(bx, y, bz, stem);
		}
		for (int y = base; y <= base + height; y++) {
			double t = (double) (y - base) / height;
			double saw = (t * tiers) % 1.0;
			double rr = r * (1 - t) * (0.7 + 0.3 * (1 - saw)) + 0.35;
			int ri = (int) Math.ceil(rr);
			for (int dx = -ri; dx <= ri; dx++) {
				for (int dz = -ri; dz <= ri; dz++) {
					int x = bx + dx;
					int z = bz + dz;
					double h = hd(x, z, cx, cz);
					if (h <= rr) {
						if (deco != null && h > rr - 1.0 && rnd.nextFloat() < 0.07F) {
							if (GiantPlantFeature.isAttachable(deco)) {
								p.setSoft(x, y, z, head);
								hang(p, x, y, z, deco);
							} else {
								p.setSoft(x, y, z, deco);
							}
						} else {
							p.setSoft(x, y, z, head);
						}
					}
				}
			}
		}
		BlockState tip = deco != null && !GiantPlantFeature.isAttachable(deco) ? deco : head;
		p.setSoft(bx, base + height + 1, bz, tip);
	}

	// ----------------------------------------------------------------------------------------------------- flower

	static void flower(Placer p, double cx, int cy, double cz, int r, BlockState head, @Nullable BlockState deco) {
		RandomSource rnd = p.random;
		int bx = Mth.floor(cx);
		int bz = Mth.floor(cz);
		double rc = Math.max(1.0, r * 0.28);
		int n = 5 + rnd.nextInt(4);
		double a0 = rnd.nextDouble() * Math.PI * 2;
		double sector = Math.PI * 2 / n;
		BlockState center = deco != null && !GiantPlantFeature.isAttachable(deco) ? deco : head;
		double cup = r * 0.3;
		for (int dx = -r - 1; dx <= r + 1; dx++) {
			for (int dz = -r - 1; dz <= r + 1; dz++) {
				int x = bx + dx;
				int z = bz + dz;
				double h = hd(x, z, cx, cz);
				if (h <= rc + 0.2) {
					p.setSoft(x, cy, z, center);
					if (h < rc * 0.6) {
						p.setSoft(x, cy + 1, z, center);
					}
					continue;
				}
				if (h > r + 0.5) {
					continue;
				}
				double ang = Math.atan2(z + 0.5 - cz, x + 0.5 - cx) - a0;
				double k = Math.round(ang / sector);
				double dAng = Math.abs(ang - k * sector);
				double t = Mth.clamp((h - rc) / Math.max(0.5, r - rc), 0.0, 1.0);
				double half = sector * 0.5 * (0.95 - 0.45 * t * t);
				if (t > 0.78) {
					half *= Math.sqrt(Math.max(0.0, (1.0 - t) / 0.22));
				}
				if (h * dAng <= Math.max(0.55, h * half)) {
					int y = cy + (int) Math.round(t * t * cup);
					p.setSoft(x, y, z, head);
				}
			}
		}
		if (deco != null && GiantPlantFeature.isAttachable(deco)) {
			sitOn(p, bx, cy + 1, bz, deco);
		}
	}

	// ------------------------------------------------------------------------------------------------------- puff

	static void puff(Placer p, double cx, int cy, double cz, int r, BlockState stem, BlockState head, @Nullable BlockState deco) {
		RandomSource rnd = p.random;
		double rm = Math.max(1.5, r * 0.6);
		double my = cy - 1 + rm;
		blob(p, cx, my, cz, rm, head);
		int k = 2 + rnd.nextInt(4);
		double a0 = rnd.nextDouble() * Math.PI * 2;
		for (int i = 0; i < k; i++) {
			double a = a0 + i * Math.PI * 2 / k + (rnd.nextDouble() - 0.5) * 0.6;
			double el = -0.15 + rnd.nextDouble() * 0.9;
			double dist = rm * (0.75 + rnd.nextDouble() * 0.35);
			double rs = Math.max(1.0, r * (0.35 + rnd.nextDouble() * 0.2));
			double sx = cx + Math.cos(a) * Math.cos(el) * dist;
			double sy = my + Math.sin(el) * dist * 0.8;
			double sz = cz + Math.sin(a) * Math.cos(el) * dist;
			p.tube(new Vec3(cx, cy - 1.5, cz), new Vec3(sx, sy, sz), 0.5, 0.5, stem, false);
			blob(p, sx, sy, sz, rs, head);
		}
		if (deco != null) {
			sprinkle(p, cx, my, cz, r * 1.2, head, deco, GiantPlantFeature.isAttachable(deco) ? 0.2F : 0.08F);
		}
	}

	// ------------------------------------------------------------------------------------------------------- palm

	static void palm(Placer p, double cx, int cy, double cz, int r, BlockState head, @Nullable BlockState deco) {
		RandomSource rnd = p.random;
		int bx = Mth.floor(cx);
		int bz = Mth.floor(cz);
		int n = 6 + rnd.nextInt(3);
		double length = r * 1.3;
		double a0 = rnd.nextDouble() * Math.PI * 2;
		for (int i = 0; i < n; i++) {
			double a = a0 + i * Math.PI * 2 / n + (rnd.nextDouble() - 0.5) * 0.35;
			double droop = 0.85 + rnd.nextDouble() * 0.5;
			double ca = Math.cos(a);
			double sa = Math.sin(a);
			for (double s = 0.5; s <= length; s += 0.5) {
				double u = s / length;
				double y = cy + 0.5 + s * 0.55 - u * u * length * 0.75 * droop;
				double x = cx + ca * s;
				double z = cz + sa * s;
				p.setSoft(Mth.floor(x), Mth.floor(y), Mth.floor(z), head);
				if (u > 0.15 && u < 0.92) {
					int drop = u > 0.55 ? 1 : 0;
					p.setSoft(Mth.floor(x - sa), Mth.floor(y) - drop, Mth.floor(z + ca), head);
					p.setSoft(Mth.floor(x + sa), Mth.floor(y) - drop, Mth.floor(z - ca), head);
				}
			}
		}
		for (int dx = -1; dx <= 1; dx++) {
			for (int dz = -1; dz <= 1; dz++) {
				p.setSoft(bx + dx, cy, bz + dz, head);
			}
		}
		p.setSoft(bx, cy + 1, bz, head);
		if (deco != null) {
			int fruits = 2 + rnd.nextInt(3);
			for (int i = 0; i < fruits; i++) {
				Direction d = Direction.Plane.HORIZONTAL.getRandomDirection(rnd);
				int x = bx + d.getStepX();
				int z = bz + d.getStepZ();
				if (GiantPlantFeature.isAttachable(deco)) {
					hang(p, x, cy, z, deco);
				} else {
					p.setSoft(x, cy - 1, z, deco);
				}
			}
		}
	}

	// ------------------------------------------------------------------------------------------------------- tuft

	static void tuft(Placer p, double cx, int cy, double cz, int r, BlockState head, @Nullable BlockState deco) {
		RandomSource rnd = p.random;
		int n = 7 + rnd.nextInt(6);
		for (int i = 0; i < n; i++) {
			double a = rnd.nextDouble() * Math.PI * 2;
			boolean inner = i < n / 3;
			double el = Math.toRadians(inner ? 68 + rnd.nextDouble() * 18 : 32 + rnd.nextDouble() * 32);
			double length = Math.min(13.0, r * (1.3 + rnd.nextDouble() * 0.8));
			double g = (inner ? 0.01 : 0.03) + rnd.nextDouble() * 0.035;
			double ce = Math.cos(el);
			Vec3 prev = new Vec3(cx, cy - 0.5, cz);
			double thick = r >= 6 ? 0.85 : 0.5;
			for (double s = 0.5; s <= length; s += 0.5) {
				Vec3 cur = new Vec3(cx + Math.cos(a) * ce * s, cy - 0.5 + Math.sin(el) * s - g * s * s, cz + Math.sin(a) * ce * s);
				double rr = s < length / 3 ? thick : 0.5;
				p.tube(prev, cur, rr, rr, head, false);
				prev = cur;
			}
			if (deco != null) {
				int x = Mth.floor(prev.x);
				int y = Mth.floor(prev.y);
				int z = Mth.floor(prev.z);
				if (GiantPlantFeature.isAttachable(deco)) {
					sitOn(p, x, y, z, deco);
				} else {
					p.setSoft(x, y + 1, z, deco);
				}
			}
		}
	}
}
