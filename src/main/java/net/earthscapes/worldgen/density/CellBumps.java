package net.earthscapes.worldgen.density;

import com.mojang.serialization.Codec;
import com.mojang.serialization.MapCodec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import net.minecraft.util.KeyDispatchDataCodec;
import net.minecraft.util.Mth;
import net.minecraft.world.level.levelgen.DensityFunction;

/**
 * Scatters isolated landforms on a jittered grid: each grid cell holds, with probability
 * {@code chance}, one bump with a random position, radius, height and orientation. The radial
 * profile is {@code height * (1 - d^edge_power)^profile_power} where d is the normalised distance
 * from the bump centre, which covers domes, cones, bells and flat-topped mesas. Overlapping bumps
 * take the maximum. Used for inselbergs, volcanic massifs, oasis depressions and watering holes.
 * <p>
 * The noise is only used to derive a per-world seed.
 */
public record CellBumps(
	DensityFunction.NoiseHolder noise,
	int cellSize,
	double chance,
	double radiusMin,
	double radiusMax,
	double heightMin,
	double heightMax,
	double edgePower,
	double profilePower,
	double jitter,
	double elongation,
	long seed
) implements DensityFunction {

	public static final MapCodec<CellBumps> DATA_CODEC = RecordCodecBuilder.mapCodec(instance -> instance.group(
		NoiseHolder.CODEC.fieldOf("noise").forGetter(CellBumps::noise),
		Codec.intRange(4, 65536).fieldOf("cell_size").forGetter(CellBumps::cellSize),
		Codec.doubleRange(0.0, 1.0).fieldOf("chance").forGetter(CellBumps::chance),
		Codec.doubleRange(1.0, 100000.0).fieldOf("radius_min").forGetter(CellBumps::radiusMin),
		Codec.doubleRange(1.0, 100000.0).fieldOf("radius_max").forGetter(CellBumps::radiusMax),
		Codec.DOUBLE.fieldOf("height_min").forGetter(CellBumps::heightMin),
		Codec.DOUBLE.fieldOf("height_max").forGetter(CellBumps::heightMax),
		Codec.doubleRange(0.1, 32.0).optionalFieldOf("edge_power", 2.0).forGetter(CellBumps::edgePower),
		Codec.doubleRange(0.01, 32.0).optionalFieldOf("profile_power", 1.0).forGetter(CellBumps::profilePower),
		Codec.doubleRange(0.0, 1.0).optionalFieldOf("jitter", 0.8).forGetter(CellBumps::jitter),
		Codec.doubleRange(1.0, 8.0).optionalFieldOf("elongation", 1.0).forGetter(CellBumps::elongation)
	).apply(instance, (noise, cellSize, chance, rMin, rMax, hMin, hMax, edge, profile, jitter, elongation) ->
		new CellBumps(noise, cellSize, chance, rMin, rMax, hMin, hMax, edge, profile, jitter, elongation, 0L)));
	public static final KeyDispatchDataCodec<CellBumps> CODEC = KeyDispatchDataCodec.of(DATA_CODEC);

	@Override
	public double compute(FunctionContext context) {
		int x = context.blockX();
		int z = context.blockZ();
		int cx = Math.floorDiv(x, this.cellSize);
		int cz = Math.floorDiv(z, this.cellSize);
		int reach = (int) Math.ceil(this.radiusMax * this.elongation / this.cellSize);
		double best = 0.0;
		for (int i = -reach; i <= reach; i++) {
			for (int j = -reach; j <= reach; j++) {
				long h = Hashing.cell(this.seed, cx + i, cz + j);
				if (Hashing.unit(h) >= this.chance) {
					continue;
				}
				h = Hashing.mix(h);
				double ox = Hashing.unit(h);
				h = Hashing.mix(h);
				double oz = Hashing.unit(h);
				h = Hashing.mix(h);
				double radius = Mth.lerp(Hashing.unit(h), this.radiusMin, this.radiusMax);
				h = Hashing.mix(h);
				double height = Mth.lerp(Hashing.unit(h), this.heightMin, this.heightMax);
				h = Hashing.mix(h);
				double angle = Hashing.unit(h) * Math.PI;
				h = Hashing.mix(h);
				double stretch = Mth.lerp(Hashing.unit(h), 1.0, this.elongation);

				double centreX = (cx + i + 0.5 + (ox - 0.5) * this.jitter) * this.cellSize;
				double centreZ = (cz + j + 0.5 + (oz - 0.5) * this.jitter) * this.cellSize;
				double dx = x - centreX;
				double dz = z - centreZ;
				double cos = Math.cos(angle);
				double sin = Math.sin(angle);
				double u = (dx * cos + dz * sin) / stretch;
				double v = -dx * sin + dz * cos;
				double d = Math.sqrt(u * u + v * v) / radius;
				if (d >= 1.0) {
					continue;
				}
				double value = height * Math.pow(1.0 - Math.pow(d, this.edgePower), this.profilePower);
				if (value > best) {
					best = value;
				}
			}
		}
		return best;
	}

	@Override
	public void fillArray(double[] values, ContextProvider provider) {
		provider.fillAllDirectly(values, this);
	}

	@Override
	public DensityFunction mapAll(Visitor visitor) {
		NoiseHolder visited = visitor.visitNoise(this.noise);
		return visitor.apply(new CellBumps(visited, this.cellSize, this.chance, this.radiusMin, this.radiusMax, this.heightMin, this.heightMax,
			this.edgePower, this.profilePower, this.jitter, this.elongation, Hashing.seedFrom(visited)));
	}

	@Override
	public double minValue() {
		return Math.min(0.0, Math.min(this.heightMin, this.heightMax));
	}

	@Override
	public double maxValue() {
		return Math.max(0.0, Math.max(this.heightMin, this.heightMax));
	}

	@Override
	public KeyDispatchDataCodec<? extends DensityFunction> codec() {
		return CODEC;
	}
}
