package net.earthscapes.worldgen.density;

import com.mojang.serialization.Codec;
import com.mojang.serialization.MapCodec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import net.minecraft.util.KeyDispatchDataCodec;
import net.minecraft.world.level.levelgen.DensityFunction;

/**
 * Quantises its input into flat treads separated by steep risers, the stepped profile of
 * mesas, plateau escarpments and cuestas. {@code riser} is the fraction of each step spent
 * climbing (small values give near-vertical cliffs). The mapping is monotonic.
 */
public record Terrace(DensityFunction input, double step, double riser, double offset) implements DensityFunction {
	public static final MapCodec<Terrace> DATA_CODEC = RecordCodecBuilder.mapCodec(instance -> instance.group(
		DensityFunction.HOLDER_HELPER_CODEC.fieldOf("input").forGetter(Terrace::input),
		Codec.doubleRange(1.0E-4, 10000.0).fieldOf("step").forGetter(Terrace::step),
		Codec.doubleRange(0.01, 1.0).optionalFieldOf("riser", 0.25).forGetter(Terrace::riser),
		Codec.DOUBLE.optionalFieldOf("offset", 0.0).forGetter(Terrace::offset)
	).apply(instance, Terrace::new));
	public static final KeyDispatchDataCodec<Terrace> CODEC = KeyDispatchDataCodec.of(DATA_CODEC);

	@Override
	public double compute(FunctionContext context) {
		return this.transform(this.input.compute(context));
	}

	private double transform(double value) {
		double v = (value - this.offset) / this.step;
		double tread = Math.floor(v);
		double f = v - tread;
		double start = 1.0 - this.riser;
		double rise = 0.0;
		if (f > start) {
			double u = (f - start) / this.riser;
			rise = u * u * (3.0 - 2.0 * u);
		}
		return (tread + rise) * this.step + this.offset;
	}

	@Override
	public void fillArray(double[] values, ContextProvider provider) {
		this.input.fillArray(values, provider);
		for (int i = 0; i < values.length; i++) {
			values[i] = this.transform(values[i]);
		}
	}

	@Override
	public DensityFunction mapAll(Visitor visitor) {
		return visitor.apply(new Terrace(this.input.mapAll(visitor), this.step, this.riser, this.offset));
	}

	@Override
	public double minValue() {
		return this.transform(this.input.minValue()) - this.step;
	}

	@Override
	public double maxValue() {
		return this.transform(this.input.maxValue()) + this.step;
	}

	@Override
	public KeyDispatchDataCodec<? extends DensityFunction> codec() {
		return CODEC;
	}
}
