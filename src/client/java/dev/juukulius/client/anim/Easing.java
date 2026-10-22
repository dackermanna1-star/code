package dev.juukulius.client.anim;

import java.util.Locale;
import net.minecraft.util.Mth;

/** Easing curves for keyframe segments; the easing of a keyframe shapes the segment that ends on it. */
public enum Easing {
	LINEAR {
		@Override
		public float apply(float t) {
			return t;
		}
	},
	STEP {
		@Override
		public float apply(float t) {
			return t < 1.0F ? 0.0F : 1.0F;
		}
	},
	IN_SINE {
		@Override
		public float apply(float t) {
			return 1.0F - Mth.cos(t * Mth.HALF_PI);
		}
	},
	OUT_SINE {
		@Override
		public float apply(float t) {
			return Mth.sin(t * Mth.HALF_PI);
		}
	},
	IN_OUT_SINE {
		@Override
		public float apply(float t) {
			return -(Mth.cos(Mth.PI * t) - 1.0F) / 2.0F;
		}
	},
	IN_QUAD {
		@Override
		public float apply(float t) {
			return t * t;
		}
	},
	OUT_QUAD {
		@Override
		public float apply(float t) {
			return 1.0F - (1.0F - t) * (1.0F - t);
		}
	},
	IN_OUT_QUAD {
		@Override
		public float apply(float t) {
			return t < 0.5F ? 2.0F * t * t : 1.0F - (float) Math.pow(-2.0F * t + 2.0F, 2.0) / 2.0F;
		}
	},
	IN_CUBIC {
		@Override
		public float apply(float t) {
			return t * t * t;
		}
	},
	OUT_CUBIC {
		@Override
		public float apply(float t) {
			float f = 1.0F - t;
			return 1.0F - f * f * f;
		}
	},
	IN_OUT_CUBIC {
		@Override
		public float apply(float t) {
			return t < 0.5F ? 4.0F * t * t * t : 1.0F - (float) Math.pow(-2.0F * t + 2.0F, 3.0) / 2.0F;
		}
	},
	IN_QUART {
		@Override
		public float apply(float t) {
			return t * t * t * t;
		}
	},
	OUT_QUART {
		@Override
		public float apply(float t) {
			float f = 1.0F - t;
			return 1.0F - f * f * f * f;
		}
	},
	IN_OUT_QUART {
		@Override
		public float apply(float t) {
			return t < 0.5F ? 8.0F * t * t * t * t : 1.0F - (float) Math.pow(-2.0F * t + 2.0F, 4.0) / 2.0F;
		}
	},
	OUT_EXPO {
		@Override
		public float apply(float t) {
			return t >= 1.0F ? 1.0F : 1.0F - (float) Math.pow(2.0, -10.0F * t);
		}
	},
	IN_EXPO {
		@Override
		public float apply(float t) {
			return t <= 0.0F ? 0.0F : (float) Math.pow(2.0, 10.0F * t - 10.0F);
		}
	},
	IN_BACK {
		@Override
		public float apply(float t) {
			float c1 = 1.70158F;
			return (c1 + 1.0F) * t * t * t - c1 * t * t;
		}
	},
	OUT_BACK {
		@Override
		public float apply(float t) {
			float c1 = 1.70158F;
			float f = t - 1.0F;
			return 1.0F + (c1 + 1.0F) * f * f * f + c1 * f * f;
		}
	},
	IN_OUT_BACK {
		@Override
		public float apply(float t) {
			float c2 = 1.70158F * 1.525F;
			return t < 0.5F
				? (float) (Math.pow(2.0F * t, 2.0) * ((c2 + 1.0F) * 2.0F * t - c2)) / 2.0F
				: (float) (Math.pow(2.0F * t - 2.0F, 2.0) * ((c2 + 1.0F) * (t * 2.0F - 2.0F) + c2) + 2.0F) / 2.0F;
		}
	},
	OUT_ELASTIC {
		@Override
		public float apply(float t) {
			if (t <= 0.0F || t >= 1.0F) {
				return t <= 0.0F ? 0.0F : 1.0F;
			}

			return (float) (Math.pow(2.0, -10.0F * t) * Math.sin((t * 10.0F - 0.75F) * (2.0 * Math.PI / 3.0)) + 1.0);
		}
	},
	/** Smooth Catmull-Rom spline through neighbouring keyframes (handled by {@link Track}). */
	SMOOTH {
		@Override
		public float apply(float t) {
			return t;
		}
	};

	public abstract float apply(float t);

	public static Easing byName(String name) {
		try {
			return valueOf(name.toUpperCase(Locale.ROOT));
		} catch (IllegalArgumentException e) {
			return LINEAR;
		}
	}
}
