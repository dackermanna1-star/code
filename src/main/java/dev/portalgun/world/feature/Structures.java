package dev.portalgun.world.feature;

import net.minecraft.core.Direction;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.minecraft.world.phys.Vec3;

/**
 * The parametric structure kinds of {@code portalgun:structure}. Every kind keeps its horizontal extent within ~15
 * blocks of the origin. Params (all optional floats):
 * <ul>
 * <li>arch: height (rise/half-span, 1.2), thickness (tube radius, auto)</li>
 * <li>ring: thickness (minor/major radius, 0.16), sink (fraction buried, 0.15), flat (1 = lying horizontal), float (blocks above ground)</li>
 * <li>gear: flat (1 = lying on the ground), pair (1 = add a meshing second gear, 0 = never; default random), spokes</li>
 * <li>ribcage: skull (1/0, default 1), height (rib height factor, 1)</li>
 * <li>lily_pad: notch (notch half-angle in degrees, 18), flowers (count, 2)</li>
 * <li>monolith: float (blocks hovering above the ground, 0)</li>
 * <li>geyser: pools (1/0 rimstone pools, 1), height (mound height factor, 1)</li>
 * <li>cuboids: float (blocks above ground, 0), count (boxes, auto), scatter (small floating cubes around, 0)</li>
 * <li>tendril: curl (total curl in turns, 0.55), thickness (base radius factor, 1)</li>
 * <li>nest: twigs (count factor, 1), eggs (count, auto)</li>
 * </ul>
 */
final class Structures {
	private Structures() {
	}

	/** Ground y under the origin (first solid block), searching a bit up and down; MIN_VALUE when floating in air. */
	private static int ground(Placer p) {
		int ox = p.origin.getX();
		int oz = p.origin.getZ();
		return p.groundBelow(ox, p.origin.getY() + 2, oz, 16);
	}

	private static Vec3 horiz(double angle) {
		return new Vec3(Math.cos(angle), 0, Math.sin(angle));
	}

	// ------------------------------------------------------------------------------------------------------- arch

	static boolean arch(Placer p, StructureFeature.Config c, int size) {
		RandomSource rnd = p.random;
		int g = ground(p);
		if (g == Integer.MIN_VALUE) {
			return false;
		}
		BlockState main = c.role("main");
		BlockState alt = c.optionalRole("alt");
		double a = Mth.clamp(size, 4, 12);
		double b = a * c.param("height", 1.1F + rnd.nextFloat() * 0.3F);
		double t0 = c.param("thickness", (float) Math.max(1.2, a * 0.22));
		double yaw = rnd.nextDouble() * Math.PI;
		Vec3 along = horiz(yaw);
		Vec3 across = horiz(yaw + Math.PI / 2);
		Vec3 center = new Vec3(p.origin.getX() + 0.5, g + 0.5, p.origin.getZ() + 0.5);
		Wobble wob = new Wobble(rnd, 4, 0.3);
		if (b + t0 * 2 > p.maxY() - g - 2) {
			return false;
		}
		for (double th = 0; th <= Math.PI + 1e-6; th += 0.04) {
			double s = Math.sin(th);
			double rho = t0 * (1.0 + 0.55 * (1.0 - s));
			Vec3 pt = center.add(along.scale(a * Math.cos(th))).add(0, b * s, 0);
			for (int k = -1; k <= 1; k++) {
				Vec3 q = pt.add(across.scale(k * rho * 0.55));
				double rr = rho * (1.0 + 0.15 * wob.at(q.x, q.y, q.z)) * (k == 0 ? 1.0 : 0.85);
				stampWeathered(p, q, rr, main, alt);
			}
			if (th < 0.3 || th > Math.PI - 0.3) {
				// legs: root the feet into the ground on slopes
				int r0 = (int) Math.ceil(rho);
				for (int dx = -r0; dx <= r0; dx++) {
					for (int dz = -r0; dz <= r0; dz++) {
						if (dx * dx + dz * dz <= rho * rho) {
							p.fillDown(Mth.floor(pt.x) + dx, g, Mth.floor(pt.z) + dz, main, 10);
						}
					}
				}
			}
		}
		return true;
	}

	private static void stampWeathered(Placer p, Vec3 q, double r, BlockState main, BlockState alt) {
		int r0 = (int) Math.ceil(r);
		int bx = Mth.floor(q.x);
		int by = Mth.floor(q.y);
		int bz = Mth.floor(q.z);
		for (int dx = -r0; dx <= r0; dx++) {
			for (int dy = -r0; dy <= r0; dy++) {
				for (int dz = -r0; dz <= r0; dz++) {
					double ex = bx + dx + 0.5 - q.x;
					double ey = by + dy + 0.5 - q.y;
					double ez = bz + dz + 0.5 - q.z;
					if (ex * ex + ey * ey + ez * ez <= r * r) {
						int y = by + dy;
						// strata: alt block in thin bands
						BlockState s = alt != null && Math.floorMod(y, 5) == 0 ? alt : main;
						p.set(bx + dx, y, bz + dz, s);
					}
				}
			}
		}
	}

	// ------------------------------------------------------------------------------------------------------- ring

	static boolean ring(Placer p, StructureFeature.Config c, int size) {
		RandomSource rnd = p.random;
		BlockState main = c.role("main");
		BlockState alt = c.optionalRole("alt");
		double big = Mth.clamp(size, 3, 12);
		double minor = Math.max(0.7, big * c.param("thickness", 0.16F));
		boolean flat = c.param("flat", 0) > 0.5F;
		float lift = c.param("float", 0);
		double cy;
		int g = ground(p);
		if (lift > 0 || g == Integer.MIN_VALUE) {
			cy = (g == Integer.MIN_VALUE ? p.origin.getY() : g + 1) + lift + (flat ? 0 : big);
		} else {
			cy = g + 1 + (flat ? 0.5 : big * (1.0 - c.param("sink", 0.15F) * 2));
		}
		if (cy + big + minor > p.maxY() - 1 || cy - big - minor < p.minY() + 1) {
			return false;
		}
		double yaw = rnd.nextDouble() * Math.PI;
		double tilt = flat ? 0 : (rnd.nextDouble() - 0.5) * 0.35;
		double cos = Math.cos(yaw);
		double sin = Math.sin(yaw);
		double cx = p.origin.getX() + 0.5;
		double cz = p.origin.getZ() + 0.5;
		int studs = Math.max(4, (int) Math.round(big * 0.75));
		int e = (int) Math.ceil(big + minor) + 1;
		for (int dx = -e; dx <= e; dx++) {
			for (int dy = -e; dy <= e; dy++) {
				for (int dz = -e; dz <= e; dz++) {
					double wx = Mth.floor(cx) + dx + 0.5 - cx;
					double wy = Mth.floor(cy) + dy + 0.5 - cy;
					double wz = Mth.floor(cz) + dz + 0.5 - cz;
					// local: u along ring plane (horizontal), v ring plane second axis, n normal
					double u = wx * cos + wz * sin;
					double n = -wx * sin + wz * cos;
					double v = wy;
					if (flat) {
						double tmp = v;
						v = n;
						n = tmp;
					} else if (tilt != 0) {
						double nv = n * Math.cos(tilt) - v * Math.sin(tilt);
						double vv = n * Math.sin(tilt) + v * Math.cos(tilt);
						n = nv;
						v = vv;
					}
					double q = Math.sqrt(u * u + v * v) - big;
					double d = Math.sqrt(q * q + n * n);
					if (d <= minor + 0.15) {
						BlockState s = main;
						if (alt != null) {
							double ang = Math.atan2(v, u);
							double k = ang / (Math.PI * 2) * studs;
							if (Math.abs(k - Math.round(k)) * (Math.PI * 2 * big / studs) < 0.9) {
								s = alt;
							}
						}
						p.set(Mth.floor(cx) + dx, Mth.floor(cy) + dy, Mth.floor(cz) + dz, s);
					}
				}
			}
		}
		return true;
	}

	// ------------------------------------------------------------------------------------------------------- gear

	static boolean gear(Placer p, StructureFeature.Config c, int size) {
		RandomSource rnd = p.random;
		BlockState main = c.role("main");
		BlockState axle = c.role("axle", "main");
		boolean flat = c.param("flat", rnd.nextFloat() < 0.3F ? 1 : 0) > 0.5F;
		int g = ground(p);
		if (g == Integer.MIN_VALUE) {
			return false;
		}
		int radius = Mth.clamp(size, 4, 12);
		Direction.Axis normal = flat ? Direction.Axis.Y : (rnd.nextBoolean() ? Direction.Axis.X : Direction.Axis.Z);
		int cx = p.origin.getX();
		int cz = p.origin.getZ();
		int cy = flat ? g + 1 : g + 1 + (int) Math.round(radius * 0.55);
		if (cy + radius + 3 > p.maxY()) {
			return false;
		}
		int spokes = (int) c.param("spokes", 4 + rnd.nextInt(3));
		float pairParam = c.param("pair", -1);
		boolean pair = pairParam > 0.5F || pairParam < 0 && radius <= 6 && rnd.nextBoolean();
		double phase = rnd.nextDouble();
		gearDisc(p, cx, cy, cz, normal, radius, spokes, phase, main, axle, flat);
		if (pair) {
			int r2 = Math.max(3, (int) Math.round(radius * 0.55));
			double dist = radius + r2 + (radius >= 10 ? 3 : 2) + 1.0;
			double ang = flat ? rnd.nextDouble() * Math.PI * 2 : Math.toRadians(50 + rnd.nextDouble() * 30) * (rnd.nextBoolean() ? 1 : -1);
			int ox;
			int oy;
			int oz;
			if (flat) {
				ox = cx + (int) Math.round(Math.cos(ang) * dist);
				oy = cy;
				oz = cz + (int) Math.round(Math.sin(ang) * dist);
			} else {
				int side = (int) Math.round(Math.sin(ang) * dist);
				oy = cy + (int) Math.round(Math.cos(ang) * dist);
				ox = normal == Direction.Axis.Z ? cx + side : cx;
				oz = normal == Direction.Axis.X ? cz + side : cz;
			}
			if (Math.abs(ox - cx) + r2 + 3 <= 15 && Math.abs(oz - cz) + r2 + 3 <= 15) {
				gearDisc(p, ox, oy, oz, normal, r2, Math.max(3, spokes - 1), phase + 0.5, main, axle, flat);
			}
		}
		return true;
	}

	private static void gearDisc(Placer p, int cx, int cy, int cz, Direction.Axis normal, int radius, int spokes, double phase,
		BlockState main, BlockState axle, boolean flat) {
		int thick = radius >= 8 ? 3 : 2;
		int depth = radius >= 10 ? 3 : 2;
		int teeth = Math.max(7, (int) Math.round(2 * Math.PI * radius / 5.5));
		int rimWidth = radius >= 10 ? 3 : 2;
		double hub = Math.max(1.6, radius * 0.26);
		double spokeHalf = radius >= 8 ? 1.25 : 0.8;
		double sector = Math.PI * 2 / spokes;
		double toothPeriod = Math.PI * 2 / teeth;
		int e = radius + depth + 1;
		int nLo = flat ? 0 : -(thick / 2);
		int nHi = nLo + thick - 1;
		for (int a = -e; a <= e; a++) {
			for (int b = -e; b <= e; b++) {
				double rho = Math.sqrt(a * a + b * b);
				double phi = Math.atan2(b, a);
				boolean in;
				boolean tooth = false;
				if (rho <= hub) {
					in = true;
				} else if (rho <= radius - rimWidth + 0.5) {
					double k = Math.round((phi - phase * sector) / sector);
					double dAng = phi - phase * sector - k * sector;
					in = Math.abs(Math.sin(dAng)) * rho <= spokeHalf;
				} else if (rho <= radius + 0.5) {
					in = true;
				} else if (rho <= radius + depth + 0.5) {
					// trapezoid teeth: wide at the root, narrower at the tip
					double u = (phi / toothPeriod + phase * 3.0) % 1.0;
					if (u < 0) {
						u += 1.0;
					}
					double off = Math.abs(u - 0.5) * toothPeriod * rho;
					double t = (rho - radius - 0.5) / depth;
					double half = toothPeriod * radius * (0.3 - 0.1 * t);
					in = off <= Math.max(0.75, half);
					tooth = true;
				} else {
					in = false;
				}
				if (!in) {
					continue;
				}
				for (int n = nLo; n <= nHi; n++) {
					int[] w = gearWorld(cx, cy, cz, normal, a, b, n);
					p.set(w[0], w[1], w[2], main);
				}
				if (!flat && b <= -radius + 1 && (tooth || rho > radius - rimWidth)) {
					// the lowest teeth stand in the ground instead of floating over slopes
					for (int n = nLo; n <= nHi; n++) {
						int[] w = gearWorld(cx, cy, cz, normal, a, b, n);
						p.fillDown(w[0], w[1] - 1, w[2], main, 4);
					}
				}
			}
		}
		// axle through the hub
		BlockState ax = Placer.withAxis(axle, normal);
		for (int n = nLo - 2; n <= nHi + 2; n++) {
			if (flat && n < 0) {
				continue;
			}
			int[] w = gearWorld(cx, cy, cz, normal, 0, 0, n);
			p.set(w[0], w[1], w[2], ax);
			if (radius >= 9) {
				for (Direction d : Direction.values()) {
					if (d.getAxis() == normal) {
						continue;
					}
					p.set(w[0] + d.getStepX(), w[1] + d.getStepY(), w[2] + d.getStepZ(), ax);
				}
			}
		}
	}

	/** (a, b) in the gear plane, n along the axle. */
	private static int[] gearWorld(int cx, int cy, int cz, Direction.Axis normal, int a, int b, int n) {
		return switch (normal) {
			case X -> new int[] {cx + n, cy + b, cz + a};
			case Z -> new int[] {cx + a, cy + b, cz + n};
			default -> new int[] {cx + a, cy + n, cz + b};
		};
	}

	// ---------------------------------------------------------------------------------------------------- ribcage

	static boolean ribcage(Placer p, StructureFeature.Config c, int size) {
		RandomSource rnd = p.random;
		BlockState bone = c.role("bone", "main");
		BlockState spine = c.role("spine", "bone");
		int g = ground(p);
		if (g == Integer.MIN_VALUE) {
			return false;
		}
		boolean skull = c.param("skull", 1) > 0.5F;
		double length = Mth.clamp(size * 2, 10, skull ? 20 : 26);
		double ribMax = Mth.clamp(size * 0.9 * c.param("height", 1.0F), 5, 13);
		double yaw = rnd.nextDouble() * Math.PI * 2;
		Vec3 along = horiz(yaw);
		Vec3 across = horiz(yaw + Math.PI / 2);
		Vec3 o = new Vec3(p.origin.getX() + 0.5, g + 0.5, p.origin.getZ() + 0.5);
		if (o.y + ribMax + 2 > p.maxY()) {
			return false;
		}
		// spine: a gently humped chain of vertebrae, buried at both ends
		Vec3 prev = null;
		for (double x = -length / 2; x <= length / 2 + 1e-6; x += 0.5) {
			double hump = 1.4 * Math.sin(Math.PI * (x / length + 0.5)) - 0.4;
			Vec3 pt = o.add(along.scale(x)).add(0, hump, 0);
			if (prev != null) {
				p.tube(prev, pt, 0.85, 0.85, spine, true);
			}
			prev = pt;
			if (Math.abs(x - Math.round(x)) < 1e-6 && Math.floorMod((int) Math.round(x), 2) == 0) {
				// dorsal process knob
				p.set(Mth.floor(pt.x), Mth.floor(pt.y) + 1, Mth.floor(pt.z), Placer.withAxis(spine, Direction.Axis.Y));
			}
		}
		double phiMax = Math.PI * 0.86;
		for (double x = -length / 2 + 3; x <= length / 2 - 2.5; x += 3) {
			double f = 1.0 - 0.6 * Math.pow(2 * x / length, 2);
			double hr = ribMax * f;
			double wr = hr * 0.72;
			double hump = 1.4 * Math.sin(Math.PI * (x / length + 0.5)) - 0.4;
			for (int side = -1; side <= 1; side += 2) {
				Vec3 last = null;
				for (double ph = 0; ph <= phiMax; ph += 0.06) {
					double lean = -(ph / phiMax) * 1.6;
					Vec3 pt = o.add(along.scale(x + lean)).add(across.scale(side * wr * Math.sin(ph))).add(0, hump + hr * (1 - Math.cos(ph)) / 2 * 1.05, 0);
					if (last != null) {
						double t = ph / phiMax;
						double r = (size >= 9 ? 0.95 : 0.6) * (1.0 - 0.45 * t);
						p.tube(last, pt, r, r, bone, true);
					}
					last = pt;
				}
			}
		}
		if (skull) {
			Vec3 head = o.add(along.scale(length / 2 + 2.5)).add(0, 1.2, 0);
			double sr = Mth.clamp(size * 0.32, 2.2, 3.6);
			ellipsoid(p, head, along, across, sr * 1.25, sr, sr * 0.95, bone);
			// jaw
			ellipsoid(p, head.add(along.scale(sr * 0.5)).add(0, -sr * 0.65, 0), along, across, sr * 0.95, sr * 0.45, sr * 0.7, bone);
			// eye sockets and nasal cavity
			for (int side = -1; side <= 1; side += 2) {
				Vec3 eye = head.add(along.scale(sr * 0.75)).add(across.scale(side * sr * 0.45)).add(0, sr * 0.2, 0);
				p.sphere(eye.x, eye.y, eye.z, Math.max(0.9, sr * 0.33), Blocks.AIR.defaultBlockState(), true);
			}
			Vec3 nose = head.add(along.scale(sr * 1.15)).add(0, -sr * 0.15, 0);
			p.set(Mth.floor(nose.x), Mth.floor(nose.y), Mth.floor(nose.z), Blocks.AIR.defaultBlockState());
		}
		return true;
	}

	private static void ellipsoid(Placer p, Vec3 c, Vec3 along, Vec3 across, double ra, double rv, double rw, BlockState s) {
		int e = (int) Math.ceil(Math.max(ra, Math.max(rv, rw))) + 1;
		int bx = Mth.floor(c.x);
		int by = Mth.floor(c.y);
		int bz = Mth.floor(c.z);
		for (int dx = -e; dx <= e; dx++) {
			for (int dy = -e; dy <= e; dy++) {
				for (int dz = -e; dz <= e; dz++) {
					double wx = bx + dx + 0.5 - c.x;
					double wy = by + dy + 0.5 - c.y;
					double wz = bz + dz + 0.5 - c.z;
					double u = wx * along.x + wz * along.z;
					double w = wx * across.x + wz * across.z;
					double q = (u / ra) * (u / ra) + (wy / rv) * (wy / rv) + (w / rw) * (w / rw);
					if (q <= 1.0) {
						p.set(bx + dx, by + dy, bz + dz, s);
					}
				}
			}
		}
	}

	// --------------------------------------------------------------------------------------------------- lily pad

	static boolean lilyPad(Placer p, StructureFeature.Config c, int size) {
		RandomSource rnd = p.random;
		BlockState pad = c.role("pad", "main");
		BlockState flower = c.optionalRole("flower");
		BlockState vein = c.optionalRole("vein");
		int ox = p.origin.getX();
		int oz = p.origin.getZ();
		int surface = Integer.MIN_VALUE;
		for (int y = p.origin.getY() + 2; y >= p.origin.getY() - 8; y--) {
			if (p.isWater(ox, y, oz) && p.get(ox, y + 1, oz).isAir()) {
				surface = y;
				break;
			}
		}
		boolean onWater = surface != Integer.MIN_VALUE;
		if (!onWater) {
			int g = ground(p);
			if (g == Integer.MIN_VALUE) {
				return false;
			}
			surface = g + 1;
		}
		double radius = Mth.clamp(size, 3, 13);
		double notchAng = rnd.nextDouble() * Math.PI * 2;
		double notchHalf = Math.toRadians(c.param("notch", 18));
		Wobble wob = new Wobble(rnd, 3, 0.4);
		double cx = ox + 0.5;
		double cz = oz + 0.5;
		int e = (int) Math.ceil(radius) + 1;
		int veins = 7 + rnd.nextInt(3);
		for (int dx = -e; dx <= e; dx++) {
			for (int dz = -e; dz <= e; dz++) {
				int x = ox + dx;
				int z = oz + dz;
				double ex = x + 0.5 - cx;
				double ez = z + 0.5 - cz;
				double h = Math.sqrt(ex * ex + ez * ez);
				double edge = radius + 0.4 * wob.at(x, 0, z);
				if (h > edge) {
					continue;
				}
				double ang = Math.atan2(ez, ex) - notchAng;
				ang = Math.atan2(Math.sin(ang), Math.cos(ang));
				double notchWidth = notchHalf * (0.4 + 0.6 * h / radius);
				if (Math.abs(ang) < notchWidth && h > 0.8) {
					continue;
				}
				BlockState s = pad;
				if (vein != null && h > 1.2 && h < edge - 1.2) {
					double k = (ang + Math.PI) / (Math.PI * 2) * veins;
					if (Math.abs(k - Math.round(k)) * (Math.PI * 2 / veins) * h < 0.5) {
						s = vein;
					}
				}
				placePad(p, x, surface, z, s, onWater);
				if (h > edge - 0.9 && radius >= 5 && Math.abs(ang) > notchWidth + 0.15) {
					// upturned rim (victoria amazonica style)
					p.setSoft(x, surface + 1, z, pad);
				}
			}
		}
		if (flower != null) {
			int count = Math.max(1, (int) c.param("flowers", 1 + rnd.nextInt(2)));
			for (int i = 0; i < count; i++) {
				double a = rnd.nextDouble() * Math.PI * 2;
				double d = radius * (0.25 + rnd.nextDouble() * 0.4);
				int fx = Mth.floor(cx + Math.cos(a) * d);
				int fz = Mth.floor(cz + Math.sin(a) * d);
				if (!p.get(fx, surface, fz).is(pad.getBlock()) && !(vein != null && p.get(fx, surface, fz).is(vein.getBlock()))) {
					continue;
				}
				if (GiantPlantFeature.isAttachable(flower)) {
					p.setDecoration(fx, surface + 1, fz, flower);
				} else {
					lotus(p, fx, surface + 1, fz, flower, radius >= 7);
				}
			}
		}
		return true;
	}

	private static void placePad(Placer p, int x, int y, int z, BlockState s, boolean onWater) {
		BlockState old = p.get(x, y, z);
		if (onWater) {
			if (old.getFluidState().isEmpty() && !Placer.isSoft(old)) {
				return;
			}
		} else if (!Placer.isSoft(old)) {
			return;
		}
		p.set(x, y, z, s);
	}

	private static void lotus(Placer p, int x, int y, int z, BlockState flower, boolean big) {
		p.setSoft(x, y, z, flower);
		for (Direction d : Direction.Plane.HORIZONTAL) {
			p.setSoft(x + d.getStepX(), y, z + d.getStepZ(), flower);
			// petals curving outward
			p.setSoft(x + d.getStepX() + d.getClockWise().getStepX(), y + 1, z + d.getStepZ() + d.getClockWise().getStepZ(), flower);
			if (big) {
				p.setSoft(x + d.getStepX() * 2, y + 1, z + d.getStepZ() * 2, flower);
			}
		}
		if (big) {
			p.setSoft(x, y + 1, z, flower);
		}
	}

	// --------------------------------------------------------------------------------------------------- monolith

	static boolean monolith(Placer p, StructureFeature.Config c, int size) {
		RandomSource rnd = p.random;
		BlockState main = c.role("main");
		int height = Mth.clamp(size, 9, 36);
		int width = Math.max(4, Math.round(height * 4 / 9.0F));
		int depth = Math.max(1, Math.round(height / 9.0F));
		boolean alongX = rnd.nextBoolean();
		int ox = p.origin.getX();
		int oz = p.origin.getZ();
		float lift = c.param("float", 0);
		int g = ground(p);
		int base;
		if (g == Integer.MIN_VALUE) {
			base = p.origin.getY();
		} else {
			base = lift > 0 ? g + 1 + Math.round(lift) : g;
		}
		if (base + height > p.maxY() - 1) {
			return false;
		}
		int x0 = ox - (alongX ? width / 2 : depth / 2);
		int z0 = oz - (alongX ? depth / 2 : width / 2);
		int sx = alongX ? width : depth;
		int sz = alongX ? depth : width;
		for (int dx = 0; dx < sx; dx++) {
			for (int dz = 0; dz < sz; dz++) {
				for (int dy = 0; dy < height; dy++) {
					p.set(x0 + dx, base + dy, z0 + dz, main);
				}
				if (lift <= 0) {
					p.fillDown(x0 + dx, base - 1, z0 + dz, main, 12);
				}
			}
		}
		return true;
	}

	// ----------------------------------------------------------------------------------------------------- geyser

	static boolean geyser(Placer p, StructureFeature.Config c, int size) {
		RandomSource rnd = p.random;
		BlockState vent = c.role("vent", "main");
		BlockState mound = c.role("mound", "main");
		int g = ground(p);
		if (g == Integer.MIN_VALUE) {
			return false;
		}
		int ox = p.origin.getX();
		int oz = p.origin.getZ();
		double radius = Mth.clamp(size, 3, 12);
		int levels = Math.max(2, (int) Math.round(radius * 0.45 * c.param("height", 1.0F)));
		boolean pools = c.param("pools", 1) > 0.5F;
		Wobble wob = new Wobble(rnd, 4, 0.35);
		double[] rk = new double[levels + 1];
		for (int k = 0; k <= levels; k++) {
			rk[k] = k == levels ? 0 : Math.max(1.6, radius * Math.pow(1.0 - (double) k / levels, 0.85));
		}
		int e = (int) Math.ceil(radius) + 2;
		for (int dx = -e; dx <= e; dx++) {
			for (int dz = -e; dz <= e; dz++) {
				int x = ox + dx;
				int z = oz + dz;
				double h = Math.sqrt(dx * dx + dz * dz);
				double w = 1.0 + 0.12 * wob.at(x, 0, z);
				for (int k = 0; k < levels; k++) {
					double r = rk[k] * w;
					if (h > r) {
						break;
					}
					int y = g + 1 + k;
					p.set(x, y, z, mound);
					if (k == 0) {
						p.fillDown(x, g, z, mound, 4);
					}
					double inner = rk[k + 1] * w;
					// exposed terrace top: raised lip at the edge and a shallow pool behind it
					if (pools && h > inner && rk[k] - rk[k + 1] >= 1.6) {
						if (h > r - 0.9) {
							p.setSoft(x, y + 1, z, mound);
						}
					}
				}
			}
		}
		if (pools) {
			java.util.List<net.minecraft.core.BlockPos> water = new java.util.ArrayList<>();
			for (int dx = -e; dx <= e; dx++) {
				for (int dz = -e; dz <= e; dz++) {
					int x = ox + dx;
					int z = oz + dz;
					double h = Math.sqrt(dx * dx + dz * dz);
					double w = 1.0 + 0.12 * wob.at(x, 0, z);
					for (int k = 0; k < levels; k++) {
						double r = rk[k] * w;
						double inner = rk[k + 1] * w;
						if (h <= r - 0.9 && h > inner && rk[k] - rk[k + 1] >= 1.6 && h > 2.2) {
							water.add(new net.minecraft.core.BlockPos(x, g + 2 + k, z));
						}
					}
				}
			}
			p.placeContainedWater(water);
		}
		int top = g + levels;
		// vent mouth: a raised ring around a vent column
		for (int dx = -2; dx <= 2; dx++) {
			for (int dz = -2; dz <= 2; dz++) {
				double h = Math.sqrt(dx * dx + dz * dz);
				if (h >= 0.9 && h <= 1.9) {
					p.set(ox + dx, top + 1, oz + dz, mound);
					p.set(ox + dx, top, oz + dz, mound);
				}
			}
		}
		for (int k = 0; k < 4; k++) {
			p.set(ox, top - k, oz, vent);
		}
		p.set(ox, top + 1, oz, Blocks.AIR.defaultBlockState());
		return true;
	}

	// ---------------------------------------------------------------------------------------------------- cuboids

	static boolean cuboids(Placer p, StructureFeature.Config c, int size) {
		RandomSource rnd = p.random;
		BlockState main = c.role("main");
		BlockState alt = c.optionalRole("alt");
		BlockState trim = c.optionalRole("trim");
		float lift = c.param("float", 0);
		int g = ground(p);
		int base;
		boolean floating = lift > 0 || g == Integer.MIN_VALUE;
		if (g == Integer.MIN_VALUE) {
			base = p.origin.getY();
		} else {
			base = floating ? g + 1 + Math.round(lift) : g;
		}
		int s = Mth.clamp(size, 3, 14);
		int count = Mth.clamp((int) c.param("count", 1 + rnd.nextInt(3) + (s > 8 ? 1 : 0)), 1, 8);
		int[][] boxes = new int[count][6];
		int w0 = Math.max(2, (int) Math.round(s * (0.6 + rnd.nextDouble() * 0.4)));
		int d0 = Math.max(2, (int) Math.round(s * (0.6 + rnd.nextDouble() * 0.4)));
		int h0 = Math.max(2, (int) Math.round(s * (0.5 + rnd.nextDouble())));
		int ox = p.origin.getX();
		int oz = p.origin.getZ();
		boxes[0] = new int[] {ox - w0 / 2, base, oz - d0 / 2, w0, h0, d0};
		for (int i = 1; i < count; i++) {
			int[] parent = boxes[rnd.nextInt(i)];
			int w = Math.max(2, (int) Math.round(parent[3] * (0.35 + rnd.nextDouble() * 0.45)));
			int d = Math.max(2, (int) Math.round(parent[5] * (0.35 + rnd.nextDouble() * 0.45)));
			int h = Math.max(2, (int) Math.round(s * (0.3 + rnd.nextDouble() * 0.7)));
			int x;
			int y;
			int z;
			if (rnd.nextFloat() < 0.6F) {
				// stacked on top
				x = parent[0] + rnd.nextInt(Math.max(1, parent[3] - w + 1));
				z = parent[2] + rnd.nextInt(Math.max(1, parent[5] - d + 1));
				y = parent[1] + parent[4];
			} else {
				// leaning against a side, overlapping a little
				boolean xSide = rnd.nextBoolean();
				boolean positive = rnd.nextBoolean();
				x = xSide ? (positive ? parent[0] + parent[3] - 1 : parent[0] - w + 1) : parent[0] + rnd.nextInt(Math.max(1, parent[3] - w + 1));
				z = xSide ? parent[2] + rnd.nextInt(Math.max(1, parent[5] - d + 1)) : (positive ? parent[2] + parent[5] - 1 : parent[2] - d + 1);
				y = parent[1];
			}
			// keep within reach of the origin
			x = Mth.clamp(x, ox - 15, ox + 15 - w);
			z = Mth.clamp(z, oz - 15, oz + 15 - d);
			boxes[i] = new int[] {x, y, z, w, h, d};
		}
		for (int i = 0; i < count; i++) {
			int[] b = boxes[i];
			BlockState body = alt != null && i % 2 == 1 ? alt : main;
			box(p, b, body, trim, !floating && b[1] == base);
		}
		int scatter = (int) c.param("scatter", 0);
		for (int i = 0; i < scatter; i++) {
			int cs = 1 + rnd.nextInt(3);
			int x = ox + rnd.nextInt(25) - 12;
			int z = oz + rnd.nextInt(25) - 12;
			int y = base + 3 + rnd.nextInt(Math.max(1, s + 6));
			if (y + cs < p.maxY()) {
				box(p, new int[] {x, y, z, cs, cs, cs}, rnd.nextBoolean() || alt == null ? main : alt, cs > 1 ? trim : null, false);
			}
		}
		return true;
	}

	private static void box(Placer p, int[] b, BlockState body, BlockState trim, boolean grounded) {
		int x0 = b[0];
		int y0 = b[1];
		int z0 = b[2];
		int x1 = x0 + b[3] - 1;
		int y1 = Math.min(y0 + b[4] - 1, p.maxY() - 1);
		int z1 = z0 + b[5] - 1;
		for (int x = x0; x <= x1; x++) {
			for (int z = z0; z <= z1; z++) {
				for (int y = y0; y <= y1; y++) {
					int edges = (x == x0 || x == x1 ? 1 : 0) + (y == y0 || y == y1 ? 1 : 0) + (z == z0 || z == z1 ? 1 : 0);
					BlockState s = trim != null && edges >= 2 ? trim : body;
					p.set(x, y, z, s);
				}
				if (grounded) {
					boolean corner = (x == x0 || x == x1) && (z == z0 || z == z1);
					p.fillDown(x, y0 - 1, z, trim != null && corner ? trim : body, 10);
				}
			}
		}
	}

	// ---------------------------------------------------------------------------------------------------- tendril

	static boolean tendril(Placer p, StructureFeature.Config c, int size) {
		RandomSource rnd = p.random;
		BlockState main = c.role("main");
		BlockState tip = c.optionalRole("tip");
		int g = ground(p);
		if (g == Integer.MIN_VALUE) {
			return false;
		}
		double length = Mth.clamp(size * 2, 8, 22);
		double r0 = Mth.clamp(size / 4.0, 0.8, 3.0) * c.param("thickness", 1.0F);
		double curl = Math.PI * 2 * c.param("curl", 0.55F);
		if (g + length + 4 > p.maxY()) {
			return false;
		}
		Vec3 h = horiz(rnd.nextDouble() * Math.PI * 2);
		Vec3 up = new Vec3(0, 1, 0);
		double th0 = (rnd.nextDouble() - 0.5) * 0.5;
		Vec3 pos = new Vec3(p.origin.getX() + 0.5, g - 0.5, p.origin.getZ() + 0.5);
		Vec3 prev = pos;
		double step = 0.5;
		for (double s = step; s <= length; s += step) {
			double t = s / length;
			double th = th0 + curl * Math.pow(t, 2.2);
			Vec3 dir = up.scale(Math.cos(th)).add(h.scale(Math.sin(th)));
			pos = pos.add(dir.scale(step));
			double r = r0 * (1.0 - 0.8 * t) + 0.35;
			p.tube(prev, pos, r, r, main, true);
			prev = pos;
		}
		if (tip != null) {
			if (GiantPlantFeature.isAttachable(tip)) {
				p.setDecoration(Mth.floor(pos.x), Mth.floor(pos.y) + 1, Mth.floor(pos.z), tip);
			} else {
				double tr = Math.max(1.0, r0 * 0.75);
				p.sphere(pos.x, pos.y, pos.z, tr, tip, true);
			}
		}
		return true;
	}

	// ------------------------------------------------------------------------------------------------------- nest

	static boolean nest(Placer p, StructureFeature.Config c, int size) {
		RandomSource rnd = p.random;
		BlockState main = c.role("main");
		BlockState egg = c.optionalRole("egg");
		int g = ground(p);
		if (g == Integer.MIN_VALUE) {
			return false;
		}
		double radius = Mth.clamp(size, 3, 10);
		double cx = p.origin.getX() + 0.5;
		double cz = p.origin.getZ() + 0.5;
		double cy = g + 1 + radius * 0.55;
		if (cy + radius > p.maxY()) {
			return false;
		}
		double inner = radius - Math.max(1.4, radius * 0.22);
		double rimTop = radius * 0.3;
		int e = (int) Math.ceil(radius) + 1;
		int bx = Mth.floor(cx);
		int by = Mth.floor(cy);
		int bz = Mth.floor(cz);
		Wobble wob = new Wobble(rnd, 4, 0.6);
		for (int dx = -e; dx <= e; dx++) {
			for (int dz = -e; dz <= e; dz++) {
				int lowest = Integer.MAX_VALUE;
				for (int dy = -e; dy <= e; dy++) {
					double ex = bx + dx + 0.5 - cx;
					double ey = by + dy + 0.5 - cy;
					double ez = bz + dz + 0.5 - cz;
					if (ey > rimTop) {
						continue;
					}
					// slightly flattened bowl
					double d = Math.sqrt(ex * ex + ey * ey * 1.35 + ez * ez);
					double w = 0.35 * wob.at(bx + dx, by + dy, bz + dz);
					if (d <= radius + w && d >= inner + w * 0.5) {
						if (ey > -radius * 0.45 && rnd.nextFloat() < 0.07F) {
							continue; // woven gaps
						}
						p.set(bx + dx, by + dy, bz + dz, main);
						lowest = Math.min(lowest, by + dy);
					} else if (d < inner && ey < -inner * 0.55) {
						// thick floor of the cup
						p.set(bx + dx, by + dy, bz + dz, main);
						lowest = Math.min(lowest, by + dy);
					}
				}
				if (lowest != Integer.MAX_VALUE) {
					p.fillDown(bx + dx, lowest - 1, bz + dz, main, 6);
				}
			}
		}
		// twigs sticking out of the rim
		int twigs = (int) Math.round((8 + radius * 2) * c.param("twigs", 1.0F));
		for (int i = 0; i < twigs; i++) {
			double a = rnd.nextDouble() * Math.PI * 2;
			double elev = (rnd.nextDouble() - 0.35) * 0.9;
			double ry = cy + (rnd.nextDouble() - 0.6) * radius * 0.5;
			Vec3 start = new Vec3(cx + Math.cos(a) * (radius - 0.8), ry, cz + Math.sin(a) * (radius - 0.8));
			double tangent = a + (rnd.nextBoolean() ? 1 : -1) * (0.6 + rnd.nextDouble() * 0.7);
			double len = 2 + rnd.nextDouble() * 3;
			Vec3 end = start.add(Math.cos(tangent) * len, elev * len, Math.sin(tangent) * len);
			p.tube(start, end, 0.5, 0.5, main, false);
		}
		if (egg != null) {
			int eggs = (int) c.param("eggs", 1 + rnd.nextInt(Math.max(1, (int) (radius / 2))));
			for (int i = 0; i < eggs; i++) {
				double a = rnd.nextDouble() * Math.PI * 2;
				double d = rnd.nextDouble() * Math.max(0.5, inner - 1.8);
				int x = Mth.floor(cx + Math.cos(a) * d);
				int z = Mth.floor(cz + Math.sin(a) * d);
				int y = by;
				while (y > by - e && p.get(x, y - 1, z).isAir()) {
					y--;
				}
				if (!p.get(x, y, z).isAir() || p.get(x, y - 1, z).isAir()) {
					continue;
				}
				if (GiantPlantFeature.isAttachable(egg)) {
					p.setDecoration(x, y, z, egg);
				} else {
					BlockState s = egg.hasProperty(BlockStateProperties.AXIS) ? Placer.withAxis(egg, Direction.Axis.Y) : egg;
					p.set(x, y, z, s);
					if (radius >= 7) {
						p.setAir(x, y + 1, z, s);
					}
				}
			}
		}
		return true;
	}
}
