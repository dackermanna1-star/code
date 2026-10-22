package dev.juukulius.client.anim;

import net.minecraft.util.Mth;

/** A keyframed vec3 channel (rotation in degrees or position in pixels). */
public final class Track {
	private final float[] times;
	private final float[][] values;
	private final Easing[] easings;

	public Track(float[] times, float[][] values, Easing[] easings) {
		this.times = times;
		this.values = values;
		this.easings = easings;
	}

	public boolean isEmpty() {
		return this.times.length == 0;
	}

	public float endTime() {
		return this.times.length == 0 ? 0.0F : this.times[this.times.length - 1];
	}

	/** Samples the track at {@code time} seconds into {@code out}. */
	public void sample(float time, float[] out) {
		int count = this.times.length;
		if (count == 0) {
			out[0] = out[1] = out[2] = 0.0F;
			return;
		}

		if (time <= this.times[0] || count == 1) {
			copy(this.values[0], out);
			return;
		}

		if (time >= this.times[count - 1]) {
			copy(this.values[count - 1], out);
			return;
		}

		int next = 1;
		while (next < count && this.times[next] < time) {
			next++;
		}

		int previous = next - 1;
		float span = this.times[next] - this.times[previous];
		float t = span <= 0.0F ? 1.0F : (time - this.times[previous]) / span;
		Easing easing = this.easings[next];
		if (easing == Easing.SMOOTH) {
			float[] p0 = this.values[Math.max(0, previous - 1)];
			float[] p1 = this.values[previous];
			float[] p2 = this.values[next];
			float[] p3 = this.values[Math.min(count - 1, next + 1)];
			for (int i = 0; i < 3; i++) {
				out[i] = catmullRom(t, p0[i], p1[i], p2[i], p3[i]);
			}
		} else {
			float eased = easing.apply(t);
			for (int i = 0; i < 3; i++) {
				out[i] = Mth.lerp(eased, this.values[previous][i], this.values[next][i]);
			}
		}
	}

	private static float catmullRom(float t, float p0, float p1, float p2, float p3) {
		float t2 = t * t;
		float t3 = t2 * t;
		return 0.5F * ((2.0F * p1) + (-p0 + p2) * t + (2.0F * p0 - 5.0F * p1 + 4.0F * p2 - p3) * t2 + (-p0 + 3.0F * p1 - 3.0F * p2 + p3) * t3);
	}

	private static void copy(float[] from, float[] to) {
		to[0] = from[0];
		to[1] = from[1];
		to[2] = from[2];
	}
}
