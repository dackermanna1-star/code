package dev.portalgun.world.density;

import com.mojang.serialization.Codec;
import com.mojang.serialization.MapCodec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import net.minecraft.util.KeyDispatchDataCodec;
import net.minecraft.util.Mth;
import net.minecraft.util.StringRepresentable;
import net.minecraft.world.level.levelgen.DensityFunction;

/** Small arithmetic density functions: coordinates, sine waves and terraces. */
public final class SimpleDensityFunctions {
	private SimpleDensityFunctions() {
	}

	public enum Axis implements StringRepresentable {
		X("x"), Y("y"), Z("z");

		public static final Codec<Axis> CODEC = StringRepresentable.fromEnum(Axis::values);
		private final String name;

		Axis(String name) {
			this.name = name;
		}

		@Override
		public String getSerializedName() {
			return this.name;
		}
	}

	/** {@code portalgun:coord} - a block coordinate times {@code scale}. */
	public record Coord(Axis axis, double scale) implements DensityFunction.SimpleFunction {
		public static final MapCodec<Coord> DATA_CODEC = RecordCodecBuilder.mapCodec(i -> i.group(
			Axis.CODEC.fieldOf("axis").forGetter(Coord::axis),
			Codec.DOUBLE.optionalFieldOf("scale", 1.0).forGetter(Coord::scale)
		).apply(i, Coord::new));
		public static final KeyDispatchDataCodec<Coord> CODEC = KeyDispatchDataCodec.of(DATA_CODEC);

		@Override
		public double compute(DensityFunction.FunctionContext ctx) {
			return switch (this.axis) {
				case X -> ctx.blockX() * this.scale;
				case Y -> ctx.blockY() * this.scale;
				case Z -> ctx.blockZ() * this.scale;
			};
		}

		private double extent() {
			return (this.axis == Axis.Y ? 4096.0 : 3.0E7) * Math.abs(this.scale);
		}

		@Override
		public double minValue() {
			return -this.extent();
		}

		@Override
		public double maxValue() {
			return this.extent();
		}

		@Override
		public KeyDispatchDataCodec<? extends DensityFunction> codec() {
			return CODEC;
		}
	}

	/** {@code portalgun:sine} - amplitude * sin(argument * frequency). */
	public record Sine(DensityFunction argument, double frequency, double amplitude) implements DensityFunction {
		public static final MapCodec<Sine> DATA_CODEC = RecordCodecBuilder.mapCodec(i -> i.group(
			DensityFunction.HOLDER_HELPER_CODEC.fieldOf("argument").forGetter(Sine::argument),
			Codec.DOUBLE.optionalFieldOf("frequency", 1.0).forGetter(Sine::frequency),
			Codec.DOUBLE.optionalFieldOf("amplitude", 1.0).forGetter(Sine::amplitude)
		).apply(i, Sine::new));
		public static final KeyDispatchDataCodec<Sine> CODEC = KeyDispatchDataCodec.of(DATA_CODEC);

		private double transform(double v) {
			return this.amplitude * Math.sin(v * this.frequency);
		}

		@Override
		public double compute(DensityFunction.FunctionContext ctx) {
			return this.transform(this.argument.compute(ctx));
		}

		@Override
		public void fillArray(double[] values, DensityFunction.ContextProvider provider) {
			this.argument.fillArray(values, provider);
			for (int i = 0; i < values.length; i++) {
				values[i] = this.transform(values[i]);
			}
		}

		@Override
		public DensityFunction mapAll(DensityFunction.Visitor visitor) {
			return visitor.apply(new Sine(this.argument.mapAll(visitor), this.frequency, this.amplitude));
		}

		@Override
		public double minValue() {
			return -Math.abs(this.amplitude);
		}

		@Override
		public double maxValue() {
			return Math.abs(this.amplitude);
		}

		@Override
		public KeyDispatchDataCodec<? extends DensityFunction> codec() {
			return CODEC;
		}
	}

	/**
	 * {@code portalgun:terrace} - quantizes the argument into steps of {@code step}; each riser is a smoothstep over
	 * the last {@code smoothness} fraction of the step (0 = sharp cliffs, 1 = fully rounded).
	 */
	public record Terrace(DensityFunction argument, double step, double smoothness) implements DensityFunction {
		public Terrace {
			step = Math.max(1.0E-4, Math.abs(step));
			smoothness = Mth.clamp(smoothness, 0.0, 1.0);
		}

		public static final MapCodec<Terrace> DATA_CODEC = RecordCodecBuilder.mapCodec(i -> i.group(
			DensityFunction.HOLDER_HELPER_CODEC.fieldOf("argument").forGetter(Terrace::argument),
			Codec.DOUBLE.fieldOf("step").forGetter(Terrace::step),
			Codec.DOUBLE.optionalFieldOf("smoothness", 0.25).forGetter(Terrace::smoothness)
		).apply(i, Terrace::new));
		public static final KeyDispatchDataCodec<Terrace> CODEC = KeyDispatchDataCodec.of(DATA_CODEC);

		private double transform(double v) {
			double q = v / this.step;
			double base = Math.floor(q);
			double t = q - base;
			double r;
			if (this.smoothness <= 1.0E-6) {
				r = 0.0;
			} else {
				double u = Mth.clamp((t - (1.0 - this.smoothness)) / this.smoothness, 0.0, 1.0);
				r = u * u * (3.0 - 2.0 * u);
			}
			return (base + r) * this.step;
		}

		@Override
		public double compute(DensityFunction.FunctionContext ctx) {
			return this.transform(this.argument.compute(ctx));
		}

		@Override
		public void fillArray(double[] values, DensityFunction.ContextProvider provider) {
			this.argument.fillArray(values, provider);
			for (int i = 0; i < values.length; i++) {
				values[i] = this.transform(values[i]);
			}
		}

		@Override
		public DensityFunction mapAll(DensityFunction.Visitor visitor) {
			return visitor.apply(new Terrace(this.argument.mapAll(visitor), this.step, this.smoothness));
		}

		@Override
		public double minValue() {
			return this.argument.minValue() - this.step;
		}

		@Override
		public double maxValue() {
			return this.argument.maxValue() + this.step;
		}

		@Override
		public KeyDispatchDataCodec<? extends DensityFunction> codec() {
			return CODEC;
		}
	}
}
