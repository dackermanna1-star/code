package dev.portalgun.world.feature;

import net.minecraft.util.RandomSource;

/** A cheap smooth random field (sum of a few random plane waves) for organic, lumpy shapes. Values in about [-1, 1]. */
public final class Wobble {
	private final double[] kx;
	private final double[] ky;
	private final double[] kz;
	private final double[] phase;
	private final double[] amp;

	public Wobble(RandomSource random, int waves, double frequency) {
		this.kx = new double[waves];
		this.ky = new double[waves];
		this.kz = new double[waves];
		this.phase = new double[waves];
		this.amp = new double[waves];
		double total = 0;
		for (int i = 0; i < waves; i++) {
			double theta = random.nextDouble() * Math.PI * 2;
			double u = random.nextDouble() * 2 - 1;
			double s = Math.sqrt(1 - u * u);
			double f = frequency * (0.6 + random.nextDouble() * 0.9);
			this.kx[i] = Math.cos(theta) * s * f;
			this.ky[i] = u * f;
			this.kz[i] = Math.sin(theta) * s * f;
			this.phase[i] = random.nextDouble() * Math.PI * 2;
			this.amp[i] = 0.5 + random.nextDouble();
			total += this.amp[i];
		}
		for (int i = 0; i < waves; i++) {
			this.amp[i] /= total;
		}
	}

	public double at(double x, double y, double z) {
		double v = 0;
		for (int i = 0; i < this.kx.length; i++) {
			v += this.amp[i] * Math.sin(this.kx[i] * x + this.ky[i] * y + this.kz[i] * z + this.phase[i]);
		}
		return v * 1.6;
	}
}
