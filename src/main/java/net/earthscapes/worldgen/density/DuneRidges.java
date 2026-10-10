package net.earthscapes.worldgen.density;

import com.mojang.serialization.Codec;
import com.mojang.serialization.MapCodec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import net.minecraft.util.KeyDispatchDataCodec;
import net.minecraft.util.Mth;
import net.minecraft.world.level.levelgen.DensityFunction;
import net.minecraft.world.level.levelgen.DensityFunctions;

/**
 * A field of parallel, asymmetric sand-dune ridges.
 * <p>
 * The ridges run perpendicular to {@code angle} (the wind direction, in degrees). Along the wind
 * direction the profile is a saw-tooth: a long, gentle windward (stoss) slope covering
 * {@code asymmetry} of the wavelength, a sharp crest, then a short steep slip face. The
 * {@code offset} input warps the phase (in blocks) so crests become sinuous, and
 * {@code flatness} carves flat inter-dune corridors. Output is in [0, 1].
 */
public record DuneRidges(DensityFunction offset, double angle, double wavelength, double asymmetry, double sharpness, double flatness)
	implements DensityFunction {

	public static final MapCodec<DuneRidges> DATA_CODEC = RecordCodecBuilder.mapCodec(instance -> instance.group(
		DensityFunction.HOLDER_HELPER_CODEC.optionalFieldOf("offset", DensityFunctions.zero()).forGetter(DuneRidges::offset),
		Codec.DOUBLE.fieldOf("angle").forGetter(DuneRidges::angle),
		Codec.doubleRange(1.0, 100000.0).fieldOf("wavelength").forGetter(DuneRidges::wavelength),
		Codec.doubleRange(0.05, 0.95).optionalFieldOf("asymmetry", 0.7).forGetter(DuneRidges::asymmetry),
		Codec.doubleRange(0.1, 8.0).optionalFieldOf("sharpness", 1.0).forGetter(DuneRidges::sharpness),
		Codec.doubleRange(0.0, 0.95).optionalFieldOf("flatness", 0.0).forGetter(DuneRidges::flatness)
	).apply(instance, DuneRidges::new));
	public static final KeyDispatchDataCodec<DuneRidges> CODEC = KeyDispatchDataCodec.of(DATA_CODEC);

	@Override
	public double compute(FunctionContext context) {
		double rad = Math.toRadians(this.angle);
		double along = context.blockX() * Math.cos(rad) + context.blockZ() * Math.sin(rad) + this.offset.compute(context);
		double phase = along / this.wavelength;
		double t = phase - Math.floor(phase);
		double tri = t < this.asymmetry ? t / this.asymmetry : (1.0 - t) / (1.0 - this.asymmetry);
		double shaped = Math.pow(Mth.clamp(tri, 0.0, 1.0), this.sharpness);
		if (this.flatness > 0.0) {
			shaped = Math.max(0.0, (shaped - this.flatness) / (1.0 - this.flatness));
		}
		return shaped;
	}

	@Override
	public void fillArray(double[] values, ContextProvider provider) {
		provider.fillAllDirectly(values, this);
	}

	@Override
	public DensityFunction mapAll(Visitor visitor) {
		return visitor.apply(new DuneRidges(this.offset.mapAll(visitor), this.angle, this.wavelength, this.asymmetry, this.sharpness, this.flatness));
	}

	@Override
	public double minValue() {
		return 0.0;
	}

	@Override
	public double maxValue() {
		return 1.0;
	}

	@Override
	public KeyDispatchDataCodec<? extends DensityFunction> codec() {
		return CODEC;
	}
}
