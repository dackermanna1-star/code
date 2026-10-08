package dev.portalgun.world.density;

import static dev.portalgun.world.density.CellHash.clampD;
import static dev.portalgun.world.density.CellHash.hash;
import static dev.portalgun.world.density.CellHash.next;
import static dev.portalgun.world.density.CellHash.seedOf;
import static dev.portalgun.world.density.CellHash.smoothstep;
import static dev.portalgun.world.density.CellHash.unit;

import com.mojang.serialization.Codec;
import com.mojang.serialization.MapCodec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import java.util.Objects;
import net.minecraft.util.KeyDispatchDataCodec;
import net.minecraft.util.Mth;
import net.minecraft.util.StringRepresentable;
import net.minecraft.world.level.levelgen.DensityFunction;

/**
 * Cellular density functions. Space is cut into a grid of {@code cell_size} cells; each cell may hold one shape whose
 * position/size is derived from a hash of the cell coordinates and a seed taken from the (world seeded) noise holder.
 * Shapes are kept inside their own cell (radius ≤ half a cell), so only the 2 nearest cells per axis need to be
 * visited and the result is still continuous.
 */
public final class CellDensityFunctions {
	private CellDensityFunctions() {
	}

	private static double noise01(DensityFunction.NoiseHolder noise, double x, double y, double z) {
		return clampD(noise.getValue(x, y, z), -1.0, 1.0);
	}

	public enum Shape implements StringRepresentable {
		SPHERE("sphere"), CUBE("cube"), BLOB("blob");

		public static final Codec<Shape> CODEC = StringRepresentable.fromEnum(Shape::values);
		private final String name;

		Shape(String name) {
			this.name = name;
		}

		@Override
		public String getSerializedName() {
			return this.name;
		}
	}

	// ------------------------------------------------------------------------------------------------- cell_shapes

	/** {@code portalgun:cell_shapes} - scattered spheres/cubes/blobs: ≈+1 deep inside, 0 on the surface, -1 far outside. */
	public static final class CellShapes implements DensityFunction {
		public static final MapCodec<CellShapes> DATA_CODEC = RecordCodecBuilder.mapCodec(i -> i.group(
			DensityFunction.NoiseHolder.CODEC.fieldOf("noise").forGetter(f -> f.noise),
			Shape.CODEC.optionalFieldOf("shape", Shape.SPHERE).forGetter(f -> f.shape),
			Codec.INT.fieldOf("cell_size").forGetter(f -> f.cellSize),
			Codec.DOUBLE.optionalFieldOf("min_radius", 4.0).forGetter(f -> f.minRadius),
			Codec.DOUBLE.optionalFieldOf("max_radius", 8.0).forGetter(f -> f.maxRadius),
			Codec.DOUBLE.optionalFieldOf("y_min", -4096.0).forGetter(f -> f.yMin),
			Codec.DOUBLE.optionalFieldOf("y_max", 4096.0).forGetter(f -> f.yMax),
			Codec.DOUBLE.optionalFieldOf("probability", 1.0).forGetter(f -> f.probability),
			Codec.INT.optionalFieldOf("salt", 0).forGetter(f -> f.salt)
		).apply(i, CellShapes::new));
		public static final KeyDispatchDataCodec<CellShapes> CODEC = KeyDispatchDataCodec.of(DATA_CODEC);

		private final DensityFunction.NoiseHolder noise;
		private final Shape shape;
		private final int cellSize;
		private final double minRadius;
		private final double maxRadius;
		private final double yMin;
		private final double yMax;
		private final double probability;
		private final int salt;
		private final long seed;
		private final double wobble;

		public CellShapes(DensityFunction.NoiseHolder noise, Shape shape, int cellSize, double minRadius, double maxRadius, double yMin,
			double yMax, double probability, int salt) {
			this.noise = noise;
			this.shape = shape;
			this.cellSize = Math.max(4, cellSize);
			this.minRadius = minRadius;
			this.maxRadius = maxRadius;
			this.yMin = yMin;
			this.yMax = yMax;
			this.probability = clampD(probability, 0.0, 1.0);
			this.salt = salt;
			this.seed = seedOf(noise, salt);
			this.wobble = shape == Shape.BLOB ? 0.3 : 0.0;
		}

		@Override
		public double compute(DensityFunction.FunctionContext ctx) {
			int x = ctx.blockX();
			int y = ctx.blockY();
			int z = ctx.blockZ();
			int c = this.cellSize;
			int cx = Math.floorDiv(x, c);
			int cy = Math.floorDiv(y, c);
			int cz = Math.floorDiv(z, c);
			int ox = (x - cx * c) * 2 < c ? cx - 1 : cx;
			int oy = (y - cy * c) * 2 < c ? cy - 1 : cy;
			int oz = (z - cz * c) * 2 < c ? cz - 1 : cz;
			double best = -1.0;
			for (int i = ox; i <= ox + 1; i++) {
				for (int j = oy; j <= oy + 1; j++) {
					double cellBottom = (double) j * c;
					if (cellBottom + c < this.yMin || cellBottom > this.yMax) {
						continue;
					}
					for (int k = oz; k <= oz + 1; k++) {
						double v = this.cell(i, j, k, x, y, z);
						if (v > best) {
							best = v;
						}
					}
				}
			}
			return best;
		}

		private double cell(int i, int j, int k, int x, int y, int z) {
			long h = hash(this.seed, i, j, k);
			if (unit(h) >= this.probability) {
				return -1.0;
			}
			double c = this.cellSize;
			double maxR = c * 0.5 / (1.0 + this.wobble);
			h = next(h);
			double lo = Math.min(this.minRadius, this.maxRadius);
			double hi = Math.max(this.minRadius, this.maxRadius);
			double r = Math.min(maxR, lo + unit(h) * (hi - lo));
			if (r < 0.5) {
				return -1.0;
			}
			double rOuter = r * (1.0 + this.wobble);
			h = next(h);
			double px = i * c + rOuter + unit(h) * (c - 2 * rOuter);
			h = next(h);
			double yLo = Math.max(j * c + rOuter, this.yMin);
			double yHi = Math.min(j * c + c - rOuter, this.yMax);
			if (yHi < yLo) {
				return -1.0;
			}
			double py = yLo + unit(h) * (yHi - yLo);
			h = next(h);
			double pz = k * c + rOuter + unit(h) * (c - 2 * rOuter);
			double dx = x - px;
			double dy = y - py;
			double dz = z - pz;
			double lim = 2.0 * rOuter;
			if (Math.abs(dx) > lim || Math.abs(dy) > lim || Math.abs(dz) > lim) {
				return -1.0;
			}
			double d;
			switch (this.shape) {
				case CUBE -> {
					double ax = dx * dx * dx * dx * dx * dx;
					double ay = dy * dy * dy * dy * dy * dy;
					double az = dz * dz * dz * dz * dz * dz;
					d = Math.pow(ax + ay + az, 1.0 / 6.0) / r;
				}
				case BLOB -> {
					double f = 1.0 / Math.max(2.0, r * 0.8);
					double n = noise01(this.noise, x * f + i * 17.3, y * f + j * 5.1, z * f + k * 11.7);
					d = Math.sqrt(dx * dx + dy * dy + dz * dz) / (r * (1.0 + this.wobble * n));
				}
				default -> d = Math.sqrt(dx * dx + dy * dy + dz * dz) / r;
			}
			return clampD(1.0 - d, -1.0, 1.0);
		}

		@Override
		public void fillArray(double[] values, DensityFunction.ContextProvider provider) {
			provider.fillAllDirectly(values, this);
		}

		@Override
		public DensityFunction mapAll(DensityFunction.Visitor visitor) {
			return visitor.apply(new CellShapes(visitor.visitNoise(this.noise), this.shape, this.cellSize, this.minRadius, this.maxRadius,
				this.yMin, this.yMax, this.probability, this.salt));
		}

		@Override
		public double minValue() {
			return -1.0;
		}

		@Override
		public double maxValue() {
			return 1.0;
		}

		@Override
		public KeyDispatchDataCodec<? extends DensityFunction> codec() {
			return CODEC;
		}

		@Override
		public boolean equals(Object o) {
			return o instanceof CellShapes f && f.noise.equals(this.noise) && f.shape == this.shape && f.cellSize == this.cellSize
				&& f.minRadius == this.minRadius && f.maxRadius == this.maxRadius && f.yMin == this.yMin && f.yMax == this.yMax
				&& f.probability == this.probability && f.salt == this.salt;
		}

		@Override
		public int hashCode() {
			return Objects.hash(this.noise, this.shape, this.cellSize, this.minRadius, this.maxRadius, this.yMin, this.yMax, this.probability,
				this.salt);
		}
	}

	// ------------------------------------------------------------------------------------------------ cell_pillars

	/** {@code portalgun:cell_pillars} - scattered tapered columns from {@code bottom} up to a random top; >0 inside. */
	public static final class CellPillars implements DensityFunction {
		public static final MapCodec<CellPillars> DATA_CODEC = RecordCodecBuilder.mapCodec(i -> i.group(
			DensityFunction.NoiseHolder.CODEC.fieldOf("noise").forGetter(f -> f.noise),
			Codec.INT.fieldOf("cell_size").forGetter(f -> f.cellSize),
			Codec.DOUBLE.optionalFieldOf("min_radius", 3.0).forGetter(f -> f.minRadius),
			Codec.DOUBLE.optionalFieldOf("max_radius", 6.0).forGetter(f -> f.maxRadius),
			Codec.DOUBLE.optionalFieldOf("probability", 0.6).forGetter(f -> f.probability),
			Codec.DOUBLE.optionalFieldOf("top_min", 100.0).forGetter(f -> f.topMin),
			Codec.DOUBLE.optionalFieldOf("top_max", 160.0).forGetter(f -> f.topMax),
			Codec.DOUBLE.optionalFieldOf("bottom", -64.0).forGetter(f -> f.bottom),
			Codec.INT.optionalFieldOf("salt", 0).forGetter(f -> f.salt)
		).apply(i, CellPillars::new));
		public static final KeyDispatchDataCodec<CellPillars> CODEC = KeyDispatchDataCodec.of(DATA_CODEC);
		private static final double WOBBLE = 0.18;
		private static final double FLARE = 1.3;

		private final DensityFunction.NoiseHolder noise;
		private final int cellSize;
		private final double minRadius;
		private final double maxRadius;
		private final double probability;
		private final double topMin;
		private final double topMax;
		private final double bottom;
		private final int salt;
		private final long seed;

		public CellPillars(DensityFunction.NoiseHolder noise, int cellSize, double minRadius, double maxRadius, double probability,
			double topMin, double topMax, double bottom, int salt) {
			this.noise = noise;
			this.cellSize = Math.max(4, cellSize);
			this.minRadius = minRadius;
			this.maxRadius = maxRadius;
			this.probability = clampD(probability, 0.0, 1.0);
			this.topMin = topMin;
			this.topMax = topMax;
			this.bottom = bottom;
			this.salt = salt;
			this.seed = seedOf(noise, salt + 101);
		}

		@Override
		public double compute(DensityFunction.FunctionContext ctx) {
			int x = ctx.blockX();
			int y = ctx.blockY();
			int z = ctx.blockZ();
			if (y < this.bottom - 8 || y > Math.max(this.topMin, this.topMax) + 8) {
				return -1.0;
			}
			int c = this.cellSize;
			int cx = Math.floorDiv(x, c);
			int cz = Math.floorDiv(z, c);
			int ox = (x - cx * c) * 2 < c ? cx - 1 : cx;
			int oz = (z - cz * c) * 2 < c ? cz - 1 : cz;
			double best = -1.0;
			for (int i = ox; i <= ox + 1; i++) {
				for (int k = oz; k <= oz + 1; k++) {
					double v = this.cell(i, k, x, y, z);
					if (v > best) {
						best = v;
					}
				}
			}
			return best;
		}

		private double cell(int i, int k, int x, int y, int z) {
			long h = hash(this.seed, i, 0, k);
			if (unit(h) >= this.probability) {
				return -1.0;
			}
			double c = this.cellSize;
			double maxR = c * 0.5 / (FLARE * (1.0 + WOBBLE));
			h = next(h);
			double lo = Math.min(this.minRadius, this.maxRadius);
			double hi = Math.max(this.minRadius, this.maxRadius);
			double r = Math.min(maxR, lo + unit(h) * (hi - lo));
			if (r < 0.5) {
				return -1.0;
			}
			double rOuter = r * FLARE * (1.0 + WOBBLE);
			h = next(h);
			double px = i * c + rOuter + unit(h) * (c - 2 * rOuter);
			h = next(h);
			double pz = k * c + rOuter + unit(h) * (c - 2 * rOuter);
			h = next(h);
			double top = Math.min(this.topMin, this.topMax) + unit(h) * Math.abs(this.topMax - this.topMin);
			double dx = x - px;
			double dz = z - pz;
			if (Math.abs(dx) > 2 * rOuter || Math.abs(dz) > 2 * rOuter) {
				return -1.0;
			}
			double span = Math.max(1.0, top - this.bottom);
			double t = clampD((top - y) / span, 0.0, 1.0);
			// slightly flared base, narrower crown
			double rr = r * (0.8 + (FLARE - 0.8) * t * t);
			double f = 1.0 / Math.max(3.0, r * 1.2);
			double n = noise01(this.noise, x * f + i * 7.7, y * f * 0.35, z * f + k * 3.1);
			rr *= 1.0 + WOBBLE * n;
			double radial = 1.0 - Math.sqrt(dx * dx + dz * dz) / rr;
			double topTerm = (top - y) / Math.max(2.0, r * 0.6);
			double bottomTerm = (y - this.bottom) / 4.0;
			return clampD(Math.min(radial, Math.min(topTerm, bottomTerm)), -1.0, 1.0);
		}

		@Override
		public void fillArray(double[] values, DensityFunction.ContextProvider provider) {
			provider.fillAllDirectly(values, this);
		}

		@Override
		public DensityFunction mapAll(DensityFunction.Visitor visitor) {
			return visitor.apply(new CellPillars(visitor.visitNoise(this.noise), this.cellSize, this.minRadius, this.maxRadius, this.probability,
				this.topMin, this.topMax, this.bottom, this.salt));
		}

		@Override
		public double minValue() {
			return -1.0;
		}

		@Override
		public double maxValue() {
			return 1.0;
		}

		@Override
		public KeyDispatchDataCodec<? extends DensityFunction> codec() {
			return CODEC;
		}

		@Override
		public boolean equals(Object o) {
			return o instanceof CellPillars f && f.noise.equals(this.noise) && f.cellSize == this.cellSize && f.minRadius == this.minRadius
				&& f.maxRadius == this.maxRadius && f.probability == this.probability && f.topMin == this.topMin && f.topMax == this.topMax
				&& f.bottom == this.bottom && f.salt == this.salt;
		}

		@Override
		public int hashCode() {
			return Objects.hash(this.noise, this.cellSize, this.minRadius, this.maxRadius, this.probability, this.topMin, this.topMax,
				this.bottom, this.salt);
		}
	}

	// ----------------------------------------------------------------------------------------------------- craters

	/** {@code portalgun:craters} - 2D height offset in blocks: parabolic bowls (down to -depth) with raised rims (+rim). */
	public static final class Craters implements DensityFunction {
		public static final MapCodec<Craters> DATA_CODEC = RecordCodecBuilder.mapCodec(i -> i.group(
			DensityFunction.NoiseHolder.CODEC.fieldOf("noise").forGetter(f -> f.noise),
			Codec.INT.fieldOf("cell_size").forGetter(f -> f.cellSize),
			Codec.DOUBLE.optionalFieldOf("min_radius", 6.0).forGetter(f -> f.minRadius),
			Codec.DOUBLE.optionalFieldOf("max_radius", 20.0).forGetter(f -> f.maxRadius),
			Codec.DOUBLE.optionalFieldOf("depth", 10.0).forGetter(f -> f.depth),
			Codec.DOUBLE.optionalFieldOf("rim", 3.0).forGetter(f -> f.rim),
			Codec.DOUBLE.optionalFieldOf("probability", 0.7).forGetter(f -> f.probability),
			Codec.INT.optionalFieldOf("salt", 0).forGetter(f -> f.salt)
		).apply(i, Craters::new));
		public static final KeyDispatchDataCodec<Craters> CODEC = KeyDispatchDataCodec.of(DATA_CODEC);
		/** Rim falloff reaches zero at this multiple of the radius. */
		private static final double EXTENT = 1.6;
		private static final double WOBBLE = 0.12;

		private final DensityFunction.NoiseHolder noise;
		private final int cellSize;
		private final double minRadius;
		private final double maxRadius;
		private final double depth;
		private final double rim;
		private final double probability;
		private final int salt;
		private final long seed;

		public Craters(DensityFunction.NoiseHolder noise, int cellSize, double minRadius, double maxRadius, double depth, double rim,
			double probability, int salt) {
			this.noise = noise;
			this.cellSize = Math.max(4, cellSize);
			this.minRadius = minRadius;
			this.maxRadius = maxRadius;
			this.depth = depth;
			this.rim = rim;
			this.probability = clampD(probability, 0.0, 1.0);
			this.salt = salt;
			this.seed = seedOf(noise, salt + 202);
		}

		@Override
		public double compute(DensityFunction.FunctionContext ctx) {
			int x = ctx.blockX();
			int z = ctx.blockZ();
			int c = this.cellSize;
			int cx = Math.floorDiv(x, c);
			int cz = Math.floorDiv(z, c);
			int ox = (x - cx * c) * 2 < c ? cx - 1 : cx;
			int oz = (z - cz * c) * 2 < c ? cz - 1 : cz;
			double sum = 0.0;
			for (int i = ox; i <= ox + 1; i++) {
				for (int k = oz; k <= oz + 1; k++) {
					sum += this.cell(i, k, x, z);
				}
			}
			return sum;
		}

		private double cell(int i, int k, int x, int z) {
			long h = hash(this.seed, i, 0, k);
			if (unit(h) >= this.probability) {
				return 0.0;
			}
			double c = this.cellSize;
			double maxR = c * 0.5 / (EXTENT * (1.0 + WOBBLE));
			h = next(h);
			double lo = Math.min(this.minRadius, this.maxRadius);
			double hi = Math.max(this.minRadius, this.maxRadius);
			double r = Math.min(maxR, lo + unit(h) * (hi - lo));
			if (r < 1.0) {
				return 0.0;
			}
			double rOuter = r * EXTENT * (1.0 + WOBBLE);
			h = next(h);
			double px = i * c + rOuter + unit(h) * (c - 2 * rOuter);
			h = next(h);
			double pz = k * c + rOuter + unit(h) * (c - 2 * rOuter);
			double dx = x - px;
			double dz = z - pz;
			double d2 = dx * dx + dz * dz;
			if (d2 >= rOuter * rOuter) {
				return 0.0;
			}
			double f = 1.0 / Math.max(3.0, r * 0.5);
			double n = noise01(this.noise, x * f + i * 13.1, 0.0, z * f + k * 9.7);
			double t = Math.sqrt(d2) / (r * (1.0 + WOBBLE * n));
			// smaller craters are proportionally shallower
			double scale = hi > 0 ? 0.4 + 0.6 * Mth.clamp(r / hi, 0.0, 1.0) : 1.0;
			double bowl = t < 1.0 ? -this.depth * scale * Math.pow(1.0 - t * t, 0.85) : 0.0;
			double bump = (t - 1.0) / 0.28;
			double rimV = this.rim * scale * Math.exp(-bump * bump) * (1.0 - smoothstep(1.25, EXTENT, t));
			return bowl + rimV;
		}

		@Override
		public void fillArray(double[] values, DensityFunction.ContextProvider provider) {
			provider.fillAllDirectly(values, this);
		}

		@Override
		public DensityFunction mapAll(DensityFunction.Visitor visitor) {
			return visitor.apply(new Craters(visitor.visitNoise(this.noise), this.cellSize, this.minRadius, this.maxRadius, this.depth, this.rim,
				this.probability, this.salt));
		}

		@Override
		public double minValue() {
			return -Math.abs(this.depth);
		}

		@Override
		public double maxValue() {
			return Math.abs(this.rim);
		}

		@Override
		public KeyDispatchDataCodec<? extends DensityFunction> codec() {
			return CODEC;
		}

		@Override
		public boolean equals(Object o) {
			return o instanceof Craters f && f.noise.equals(this.noise) && f.cellSize == this.cellSize && f.minRadius == this.minRadius
				&& f.maxRadius == this.maxRadius && f.depth == this.depth && f.rim == this.rim && f.probability == this.probability
				&& f.salt == this.salt;
		}

		@Override
		public int hashCode() {
			return Objects.hash(this.noise, this.cellSize, this.minRadius, this.maxRadius, this.depth, this.rim, this.probability, this.salt);
		}
	}

	// ------------------------------------------------------------------------------------------------------- cells

	/** {@code portalgun:cells} - 3D Worley F2-F1 distance in blocks: ≈0 on the walls between cells, larger in cell centres. */
	public static final class Cells implements DensityFunction {
		public static final MapCodec<Cells> DATA_CODEC = RecordCodecBuilder.mapCodec(i -> i.group(
			DensityFunction.NoiseHolder.CODEC.fieldOf("noise").forGetter(f -> f.noise),
			Codec.INT.fieldOf("cell_size").forGetter(f -> f.cellSize),
			Codec.DOUBLE.optionalFieldOf("jitter", 0.8).forGetter(f -> f.jitter),
			Codec.DOUBLE.optionalFieldOf("y_scale", 1.0).forGetter(f -> f.yScale),
			Codec.INT.optionalFieldOf("salt", 0).forGetter(f -> f.salt)
		).apply(i, Cells::new));
		public static final KeyDispatchDataCodec<Cells> CODEC = KeyDispatchDataCodec.of(DATA_CODEC);

		private final DensityFunction.NoiseHolder noise;
		private final int cellSize;
		private final double jitter;
		private final double yScale;
		private final int salt;
		private final long seed;

		public Cells(DensityFunction.NoiseHolder noise, int cellSize, double jitter, double yScale, int salt) {
			this.noise = noise;
			this.cellSize = Math.max(2, cellSize);
			this.jitter = clampD(jitter, 0.0, 1.0);
			this.yScale = clampD(yScale, 0.05, 20.0);
			this.salt = salt;
			this.seed = seedOf(noise, salt + 303);
		}

		@Override
		public double compute(DensityFunction.FunctionContext ctx) {
			double c = this.cellSize;
			double x = ctx.blockX() / c;
			double y = ctx.blockY() / (c * this.yScale);
			double z = ctx.blockZ() / c;
			int cx = Mth.floor(x);
			int cy = Mth.floor(y);
			int cz = Mth.floor(z);
			double margin = (1.0 - this.jitter) * 0.5;
			double f1 = Double.MAX_VALUE;
			double f2 = Double.MAX_VALUE;
			for (int n = 0; n < 27; n++) {
				// visit the own cell first so the box test can prune most neighbours
				int di = n == 0 ? 0 : ((n % 3) - 1);
				int dj = n == 0 ? 0 : (((n / 3) % 3) - 1);
				int dk = n == 0 ? 0 : ((n / 9) - 1);
				if (n == 13) {
					di = -1;
					dj = -1;
					dk = -1;
				}
				int i = cx + di;
				int j = cy + dj;
				int k = cz + dk;
				double bx = boxDist(x, i + margin, i + 1 - margin);
				double by = boxDist(y, j + margin, j + 1 - margin);
				double bz = boxDist(z, k + margin, k + 1 - margin);
				if (bx * bx + by * by + bz * bz >= f2) {
					continue;
				}
				long h = hash(this.seed, i, j, k);
				double px = i + margin + unit(h) * this.jitter;
				h = next(h);
				double py = j + margin + unit(h) * this.jitter;
				h = next(h);
				double pz = k + margin + unit(h) * this.jitter;
				double dx = x - px;
				double dy = y - py;
				double dz = z - pz;
				double d = dx * dx + dy * dy + dz * dz;
				if (d < f1) {
					f2 = f1;
					f1 = d;
				} else if (d < f2) {
					f2 = d;
				}
			}
			return (Math.sqrt(f2) - Math.sqrt(f1)) * c;
		}

		private static double boxDist(double v, double lo, double hi) {
			return v < lo ? lo - v : (v > hi ? v - hi : 0.0);
		}

		@Override
		public void fillArray(double[] values, DensityFunction.ContextProvider provider) {
			provider.fillAllDirectly(values, this);
		}

		@Override
		public DensityFunction mapAll(DensityFunction.Visitor visitor) {
			return visitor.apply(new Cells(visitor.visitNoise(this.noise), this.cellSize, this.jitter, this.yScale, this.salt));
		}

		@Override
		public double minValue() {
			return 0.0;
		}

		@Override
		public double maxValue() {
			return this.cellSize * 2.0 * Math.max(1.0, this.yScale);
		}

		@Override
		public KeyDispatchDataCodec<? extends DensityFunction> codec() {
			return CODEC;
		}

		@Override
		public boolean equals(Object o) {
			return o instanceof Cells f && f.noise.equals(this.noise) && f.cellSize == this.cellSize && f.jitter == this.jitter
				&& f.yScale == this.yScale && f.salt == this.salt;
		}

		@Override
		public int hashCode() {
			return Objects.hash(this.noise, this.cellSize, this.jitter, this.yScale, this.salt);
		}
	}
}
