package dev.overkill.client.particle;

import net.minecraft.util.Mth;

/**
 * Look and motion of one particle type.
 *
 * @param staticParams if true, spawn "velocity" means (size multiplier, alpha multiplier, lifetime)
 * @param rise         added to vertical speed every tick (heat makes things float)
 * @param jitter       random velocity kick per tick (crackling sparks, swaying ash)
 * @param flicker      0..1 brightness flicker (embers)
 * @param horizontal   draw flat on the ground instead of facing the camera (shockwave rings)
 */
public record ParticleStyle(
	float sizeMin, float sizeMax,
	int lifeMin, int lifeMax,
	float gravity, float friction, boolean physics,
	boolean fullBright,
	int colorStart, int colorEnd,
	float alpha, Fade fade, Curve curve,
	boolean animated, float spin, float rise, float jitter, float flicker,
	boolean staticParams, boolean horizontal
) {
	public enum Curve {
		CONSTANT {
			@Override
			public float scale(float t) {
				return 1.0F;
			}
		},
		/** Smoke and dust billow outwards. */
		GROW {
			@Override
			public float scale(float t) {
				return 0.55F + 0.9F * t;
			}
		},
		/** Sparks and embers burn down. */
		SHRINK {
			@Override
			public float scale(float t) {
				return 1.0F - t * t;
			}
		},
		/** Fire and flashes: explode in size quickly, then die down. */
		POP {
			@Override
			public float scale(float t) {
				return t < 0.15F ? 0.3F + 0.7F * (t / 0.15F) : 1.0F - 0.45F * ((t - 0.15F) / 0.85F);
			}
		},
		/** Shockwaves: race outwards, then slow. */
		RING {
			@Override
			public float scale(float t) {
				return 0.08F + 0.92F * Mth.sqrt(t);
			}
		};

		public abstract float scale(float t);
	}

	public enum Fade {
		/** Full alpha, then a quick fade at the very end. */
		LATE {
			@Override
			public float alpha(float t) {
				return t < 0.75F ? 1.0F : 1.0F - (t - 0.75F) / 0.25F;
			}
		},
		/** Linear fade over the whole life. */
		LINEAR {
			@Override
			public float alpha(float t) {
				return 1.0F - t;
			}
		},
		/** Fade in, hold, fade out (smoke, ash). */
		SMOOTH {
			@Override
			public float alpha(float t) {
				if (t < 0.12F) {
					return t / 0.12F;
				}
				return t < 0.55F ? 1.0F : 1.0F - (t - 0.55F) / 0.45F;
			}
		};

		public abstract float alpha(float t);
	}

	public static Builder builder() {
		return new Builder();
	}

	public static final class Builder {
		private float sizeMin = 0.1F;
		private float sizeMax = 0.1F;
		private int lifeMin = 20;
		private int lifeMax = 20;
		private float gravity;
		private float friction = 0.98F;
		private boolean physics;
		private boolean fullBright;
		private int colorStart = 0xFFFFFF;
		private int colorEnd = 0xFFFFFF;
		private float alpha = 1.0F;
		private Fade fade = Fade.LATE;
		private Curve curve = Curve.CONSTANT;
		private boolean animated;
		private float spin;
		private float rise;
		private float jitter;
		private float flicker;
		private boolean staticParams;
		private boolean horizontal;

		public Builder size(float min, float max) {
			this.sizeMin = min;
			this.sizeMax = max;
			return this;
		}

		public Builder life(int min, int max) {
			this.lifeMin = min;
			this.lifeMax = max;
			return this;
		}

		public Builder gravity(float gravity) {
			this.gravity = gravity;
			return this;
		}

		public Builder friction(float friction) {
			this.friction = friction;
			return this;
		}

		public Builder physics() {
			this.physics = true;
			return this;
		}

		public Builder glowing() {
			this.fullBright = true;
			return this;
		}

		public Builder color(int start, int end) {
			this.colorStart = start;
			this.colorEnd = end;
			return this;
		}

		public Builder alpha(float alpha) {
			this.alpha = alpha;
			return this;
		}

		public Builder fade(Fade fade) {
			this.fade = fade;
			return this;
		}

		public Builder curve(Curve curve) {
			this.curve = curve;
			return this;
		}

		public Builder animated() {
			this.animated = true;
			return this;
		}

		public Builder spin(float spin) {
			this.spin = spin;
			return this;
		}

		public Builder rise(float rise) {
			this.rise = rise;
			return this;
		}

		public Builder jitter(float jitter) {
			this.jitter = jitter;
			return this;
		}

		public Builder flicker(float flicker) {
			this.flicker = flicker;
			return this;
		}

		public Builder staticParams() {
			this.staticParams = true;
			return this;
		}

		public Builder horizontal() {
			this.horizontal = true;
			return this;
		}

		public ParticleStyle build() {
			return new ParticleStyle(this.sizeMin, this.sizeMax, this.lifeMin, this.lifeMax, this.gravity, this.friction, this.physics, this.fullBright,
				this.colorStart, this.colorEnd, this.alpha, this.fade, this.curve, this.animated, this.spin, this.rise, this.jitter, this.flicker,
				this.staticParams, this.horizontal);
		}
	}
}
