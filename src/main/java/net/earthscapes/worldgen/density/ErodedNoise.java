package net.earthscapes.worldgen.density;

import com.mojang.serialization.Codec;
import com.mojang.serialization.MapCodec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import net.minecraft.util.KeyDispatchDataCodec;
import net.minecraft.world.level.levelgen.DensityFunction;

/**
 * Two-dimensional fractal noise with derivative-based "erosion" damping (after Inigo Quilez):
 * every octave is attenuated by the accumulated slope of the coarser octaves, so detail
 * collects on ridges and valley floors stay smooth, which reads like water-carved terrain.
 * With {@code ridged} each octave is folded into sharp crests, giving alpine ridge lines.
 * <p>
 * The wrapped noise should be a single-octave noise; this function supplies its own octaves.
 * Output is roughly in [-1, 1].
 */
public record ErodedNoise(DensityFunction.NoiseHolder noise, double xzScale, int octaves, double lacunarity, double gain, double erosion, boolean ridged)
	implements DensityFunction {

	public static final MapCodec<ErodedNoise> DATA_CODEC = RecordCodecBuilder.mapCodec(instance -> instance.group(
		NoiseHolder.CODEC.fieldOf("noise").forGetter(ErodedNoise::noise),
		Codec.doubleRange(1.0E-6, 10.0).fieldOf("xz_scale").forGetter(ErodedNoise::xzScale),
		Codec.intRange(1, 12).optionalFieldOf("octaves", 6).forGetter(ErodedNoise::octaves),
		Codec.doubleRange(1.1, 4.0).optionalFieldOf("lacunarity", 2.0).forGetter(ErodedNoise::lacunarity),
		Codec.doubleRange(0.05, 0.95).optionalFieldOf("gain", 0.5).forGetter(ErodedNoise::gain),
		Codec.doubleRange(0.0, 50.0).optionalFieldOf("erosion", 1.0).forGetter(ErodedNoise::erosion),
		Codec.BOOL.optionalFieldOf("ridged", false).forGetter(ErodedNoise::ridged)
	).apply(instance, ErodedNoise::new));
	public static final KeyDispatchDataCodec<ErodedNoise> CODEC = KeyDispatchDataCodec.of(DATA_CODEC);

	private static final double EPS = 0.01;
	// rotation of roughly 36.87 degrees between octaves hides lattice artefacts
	private static final double ROT_COS = 0.8;
	private static final double ROT_SIN = 0.6;

	@Override
	public double compute(FunctionContext context) {
		double x = context.blockX() * this.xzScale;
		double z = context.blockZ() * this.xzScale;
		double sum = 0.0;
		double amplitude = 1.0;
		double norm = 0.0;
		double dx = 0.0;
		double dz = 0.0;
		for (int i = 0; i < this.octaves; i++) {
			double y = i * 17.31;
			double n = this.noise.getValue(x, y, z);
			double nx = (this.noise.getValue(x + EPS, y, z) - n) / EPS;
			double nz = (this.noise.getValue(x, y, z + EPS) - n) / EPS;
			if (this.ridged) {
				double sign = n < 0.0 ? -1.0 : 1.0;
				n = 1.0 - 2.0 * Math.abs(n);
				nx = -2.0 * sign * nx;
				nz = -2.0 * sign * nz;
			}
			dx += nx;
			dz += nz;
			sum += amplitude * n / (1.0 + this.erosion * (dx * dx + dz * dz));
			norm += amplitude;
			amplitude *= this.gain;
			double rx = (ROT_COS * x - ROT_SIN * z) * this.lacunarity + 3.17;
			double rz = (ROT_SIN * x + ROT_COS * z) * this.lacunarity - 1.73;
			x = rx;
			z = rz;
		}
		return sum / norm;
	}

	@Override
	public void fillArray(double[] values, ContextProvider provider) {
		provider.fillAllDirectly(values, this);
	}

	@Override
	public DensityFunction mapAll(Visitor visitor) {
		return visitor.apply(new ErodedNoise(visitor.visitNoise(this.noise), this.xzScale, this.octaves, this.lacunarity, this.gain, this.erosion, this.ridged));
	}

	@Override
	public double minValue() {
		return -2.0;
	}

	@Override
	public double maxValue() {
		return 2.0;
	}

	@Override
	public KeyDispatchDataCodec<? extends DensityFunction> codec() {
		return CODEC;
	}
}
