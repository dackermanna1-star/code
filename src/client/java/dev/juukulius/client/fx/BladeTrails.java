package dev.juukulius.client.fx;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import dev.juukulius.client.anim.AnimClip.TrailStyle;
import dev.juukulius.client.config.JuliusClientConfig;
import dev.juukulius.client.render.FxDraw;
import dev.juukulius.client.render.JuliusRenderTypes;
import dev.juukulius.client.render.JuliusTextures;
import it.unimi.dsi.fastutil.ints.Int2ObjectMap;
import it.unimi.dsi.fastutil.ints.Int2ObjectOpenHashMap;
import net.minecraft.client.Camera;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.util.Mth;
import net.minecraft.world.phys.Vec3;
import org.jspecify.annotations.Nullable;
import org.joml.Matrix4f;
import org.joml.Quaternionf;
import org.joml.Vector3f;

/**
 * Rainbow sword trails that follow the real blade. Every frame the renderer reports the blade's base and tip (taken from
 * the exact matrix the sword is drawn with, so animation, body motion and hand pose are all included); while the playing
 * clip's trail window is open the samples are linked into a fading ribbon of layered light.
 */
public final class BladeTrails {
	private static final Int2ObjectMap<Trail> WORLD_TRAILS = new Int2ObjectOpenHashMap<>();
	private static final Trail FIRST_PERSON = new Trail();
	private static final Vector3f BASE = new Vector3f();
	private static final Vector3f TIP = new Vector3f();

	private BladeTrails() {
	}

	// ------------------------------------------------------------------------------------------------ capture

	/**
	 * Third-person capture. {@code handPose} is the pose the sword is submitted with (before its display transform),
	 * in camera-relative world space; {@code clad} is the Al Clarista aura strength (0 = none).
	 */
	public static void captureWorld(int entityId, Matrix4f handPose, boolean leftHand, Vec3 camera, @Nullable TrailStyle style, float time, float clad) {
		Trail trail = WORLD_TRAILS.computeIfAbsent(entityId, id -> new Trail());
		Matrix4f model = BladeGeometry.withDisplay(handPose, false, leftHand);
		BladeGeometry.base(model, BASE);
		BladeGeometry.tip(model, TIP);
		trail.lastBase = new Vec3(BASE.x + camera.x, BASE.y + camera.y, BASE.z + camera.z);
		trail.lastTip = new Vec3(TIP.x + camera.x, TIP.y + camera.y, TIP.z + camera.z);
		trail.lastCapture = time;
		trail.glow = clad;
		trail.add(style, time, trail.lastBase, trail.lastTip);
	}

	/** First-person capture: {@code handPose} maps to view space; samples are stored world-oriented around the camera. */
	public static void captureFirstPerson(Matrix4f handPose, boolean leftHand, Camera camera, @Nullable TrailStyle style, float time, float clad) {
		Matrix4f model = BladeGeometry.withDisplay(handPose, true, leftHand);
		BladeGeometry.base(model, BASE);
		BladeGeometry.tip(model, TIP);
		FIRST_PERSON.viewBase = new Vector3f(BASE);
		FIRST_PERSON.viewTip = new Vector3f(TIP);
		FIRST_PERSON.glow = clad;
		FIRST_PERSON.lastCapture = time;
		Quaternionf rotation = new Quaternionf(camera.rotation());
		BASE.rotate(rotation);
		TIP.rotate(rotation);
		Vec3 eye = camera.position();
		FIRST_PERSON.add(style, time, new Vec3(BASE.x + eye.x, BASE.y + eye.y, BASE.z + eye.z), new Vec3(TIP.x + eye.x, TIP.y + eye.y, TIP.z + eye.z));
	}

	/** Midpoint of the most recently drawn blade, or {@code fallback} if the sword was not drawn recently. */
	public static Vec3 bladeCenter(int entityId, Vec3 fallback) {
		Trail trail = WORLD_TRAILS.get(entityId);
		if (trail == null || trail.lastBase == null || trail.lastTip == null || trail.lastCaptureAge() > 0.25F) {
			return fallback;
		}

		return trail.lastBase.lerp(trail.lastTip, 0.6);
	}

	public static @Nullable Vec3 bladeTip(int entityId) {
		Trail trail = WORLD_TRAILS.get(entityId);
		return trail == null || trail.lastCaptureAge() > 0.25F ? null : trail.lastTip;
	}

	// ------------------------------------------------------------------------------------------------ render

	public static void renderWorld(FxContext context) {
		boolean trails = JuliusClientConfig.get().swordTrails;
		VertexConsumer consumer = context.buffers.getBuffer(JuliusRenderTypes.glow(JuliusTextures.TRAIL));
		for (Trail trail : WORLD_TRAILS.values()) {
			if (trails) {
				trail.render(consumer, context.matrix, context.camera, null, context.time);
			}
		}

		VertexConsumer aura = context.buffers.getBuffer(JuliusRenderTypes.glow(JuliusTextures.BEAM));
		for (Trail trail : WORLD_TRAILS.values()) {
			if (trail.glow > 0.0F && trail.lastBase != null && trail.lastTip != null && context.time - trail.lastCapture < 0.06F) {
				Vector3f base = context.rel(trail.lastBase);
				Vector3f tip = context.rel(trail.lastTip);
				renderAura(aura, context.matrix, base, tip, new Vector3f(base).negate(), trail.glow, context.time);
			}
		}
	}

	/** Renders the first-person trail and blade aura in the hand pass, re-projected into the current view. */
	public static void renderFirstPerson(SubmitNodeCollector collector, Camera camera, float time) {
		boolean trail = JuliusClientConfig.get().swordTrails && !FIRST_PERSON.isEmpty(time);
		boolean aura = FIRST_PERSON.glow > 0.0F && FIRST_PERSON.viewBase != null && time - FIRST_PERSON.lastCapture < 0.06F;
		if (trail) {
			Quaternionf inverse = new Quaternionf(camera.rotation()).conjugate();
			Vec3 eye = camera.position();
			collector.submitCustomGeometry(new PoseStack(), JuliusRenderTypes.glow(JuliusTextures.TRAIL),
				(pose, consumer) -> FIRST_PERSON.render(consumer, pose.pose(), eye, inverse, time));
		}

		if (aura) {
			Vector3f base = new Vector3f(FIRST_PERSON.viewBase);
			Vector3f tip = new Vector3f(FIRST_PERSON.viewTip);
			float glow = FIRST_PERSON.glow;
			collector.submitCustomGeometry(new PoseStack(), JuliusRenderTypes.glow(JuliusTextures.BEAM),
				(pose, consumer) -> renderAura(consumer, pose.pose(), base, tip, new Vector3f(base).negate(), glow, time));
		}
	}

	/** Al Clarista: the blade clad in a layered rainbow light, brightest along the edge, shimmering with time. */
	private static void renderAura(VertexConsumer consumer, Matrix4f matrix, Vector3f base, Vector3f tip, Vector3f toCamera, float strength,
		float time) {
		Vector3f axis = new Vector3f(tip).sub(base);
		Vector3f side = new Vector3f(axis).cross(toCamera);
		if (side.lengthSquared() < 1.0E-8F) {
			return;
		}

		side.normalize();
		int segments = 6;
		for (int layer = 0; layer < 2; layer++) {
			float width = layer == 0 ? 0.11F : 0.045F;
			float alpha = (layer == 0 ? 0.55F : 0.9F) * strength;
			for (int i = 0; i < segments; i++) {
				float t0 = i / (float) segments;
				float t1 = (i + 1) / (float) segments;
				float w0 = width * (1.0F - t0 * 0.55F);
				float w1 = width * (1.0F - t1 * 0.55F);
				Vector3f p0 = new Vector3f(axis).mul(t0).add(base);
				Vector3f p1 = new Vector3f(axis).mul(t1).add(base);
				int c0 = layer == 0 ? FxDraw.rainbow(time * 0.45F + t0 * 0.9F) : FxDraw.lerpRgb(0.6F, FxDraw.rainbow(time * 0.45F + t0 * 0.9F), 0xFFFFFF);
				int c1 = layer == 0 ? FxDraw.rainbow(time * 0.45F + t1 * 0.9F) : FxDraw.lerpRgb(0.6F, FxDraw.rainbow(time * 0.45F + t1 * 0.9F), 0xFFFFFF);
				FxDraw.gradientQuad(consumer, matrix,
					new Vector3f(side).mul(-w0).add(p0), new Vector3f(side).mul(w0).add(p0),
					new Vector3f(side).mul(w1).add(p1), new Vector3f(side).mul(-w1).add(p1),
					0.0F, 0.0F, 1.0F, 1.0F, FxDraw.argb(alpha, c0), FxDraw.argb(alpha, c1));
			}
		}
	}

	public static void clear() {
		WORLD_TRAILS.clear();
		FIRST_PERSON.clear();
	}

	public static void prune(float time) {
		WORLD_TRAILS.values().removeIf(trail -> trail.lastCaptureAge(time) > 5.0F);
	}

	// ------------------------------------------------------------------------------------------------ data

	static final class Trail {
		private static final int CAPACITY = 48;
		private final Vec3[] bases = new Vec3[CAPACITY];
		private final Vec3[] tips = new Vec3[CAPACITY];
		private final float[] times = new float[CAPACITY];
		private final TrailStyle[] styles = new TrailStyle[CAPACITY];
		private final boolean[] linked = new boolean[CAPACITY];
		private int head = -1;
		private int size;
		private boolean previousActive;
		@Nullable Vec3 lastBase;
		@Nullable Vec3 lastTip;
		@Nullable Vector3f viewBase;
		@Nullable Vector3f viewTip;
		float lastCapture = -100.0F;
		float glow;

		float lastCaptureAge() {
			return this.lastCaptureAge(dev.juukulius.client.anim.ClientClock.seconds(0.0F));
		}

		float lastCaptureAge(float time) {
			return time - this.lastCapture;
		}

		void add(@Nullable TrailStyle style, float time, Vec3 base, Vec3 tip) {
			if (style == null) {
				this.previousActive = false;
				return;
			}

			if (this.head >= 0 && time - this.times[this.head] < 0.004F) {
				return;
			}

			this.head = (this.head + 1) % CAPACITY;
			this.bases[this.head] = base;
			this.tips[this.head] = tip;
			this.times[this.head] = time;
			this.styles[this.head] = style;
			this.linked[this.head] = this.previousActive;
			this.previousActive = true;
			this.size = Math.min(CAPACITY, this.size + 1);
		}

		boolean isEmpty(float time) {
			return this.head < 0 || time - this.times[this.head] > maxAge(this.styles[this.head]);
		}

		void clear() {
			this.head = -1;
			this.size = 0;
			this.previousActive = false;
		}

		void render(VertexConsumer consumer, Matrix4f matrix, Vec3 camera, @Nullable Quaternionf viewRotation, float time) {
			if (this.head < 0) {
				return;
			}

			for (int k = 0; k < this.size - 1; k++) {
				int current = Math.floorMod(this.head - k, CAPACITY);
				int older = Math.floorMod(this.head - k - 1, CAPACITY);
				if (!this.linked[current] || this.bases[older] == null) {
					continue;
				}

				TrailStyle style = this.styles[current];
				float maxAge = maxAge(style);
				float ageNew = time - this.times[current];
				float ageOld = time - this.times[older];
				if (ageOld > maxAge) {
					break;
				}

				float fadeNew = Mth.clamp(1.0F - ageNew / maxAge, 0.0F, 1.0F);
				float fadeOld = Mth.clamp(1.0F - ageOld / maxAge, 0.0F, 1.0F);
				this.segment(consumer, matrix, camera, viewRotation, current, older, fadeNew, fadeOld, style, time);
			}
		}

		private void segment(VertexConsumer consumer, Matrix4f matrix, Vec3 camera, @Nullable Quaternionf viewRotation, int current, int older,
			float fadeNew, float fadeOld, TrailStyle style, float time) {
			float extend = style == TrailStyle.WIDE ? 0.35F : 0.0F;
			Vector3f baseNew = toView(this.bases[current], camera, viewRotation);
			Vector3f tipNew = toView(extendTip(this.bases[current], this.tips[current], extend), camera, viewRotation);
			Vector3f baseOld = toView(this.bases[older], camera, viewRotation);
			Vector3f tipOld = toView(extendTip(this.bases[older], this.tips[older], extend), camera, viewRotation);
			// The trail is brightest along the cutting edge near the tip and fades towards the hilt.
			Vector3f midNew = new Vector3f(baseNew).lerp(tipNew, 0.35F);
			Vector3f midOld = new Vector3f(baseOld).lerp(tipOld, 0.35F);
			float hueNew = hue(style, time, this.times[current]);
			float hueOld = hue(style, time, this.times[older]);
			int colorNew = color(style, hueNew);
			int colorOld = color(style, hueOld);
			float strength = style == TrailStyle.WIDE ? 1.0F : 0.85F;
			// Rendered without culling, so one quad serves both sides. Each edge fades with the age of its sample.
			FxDraw.cornerQuad(consumer, matrix, midOld, midNew, tipNew, tipOld, 0.0F, 0.0F, 1.0F, 1.0F,
				FxDraw.argb(0.0F, colorOld), FxDraw.argb(0.0F, colorNew), FxDraw.argb(strength * fadeNew, colorNew),
				FxDraw.argb(strength * fadeOld, colorOld));
			// Thin white-hot core along the edge, kept faint so the colour still reads against a bright sky.
			Vector3f innerNew = new Vector3f(baseNew).lerp(tipNew, 0.88F);
			Vector3f innerOld = new Vector3f(baseOld).lerp(tipOld, 0.88F);
			FxDraw.cornerQuad(consumer, matrix, innerOld, innerNew, tipNew, tipOld, 0.0F, 0.0F, 1.0F, 1.0F,
				FxDraw.argb(0.0F, 0xFFFFFF), FxDraw.argb(0.0F, 0xFFFFFF), FxDraw.argb(0.42F * fadeNew * fadeNew, 0xFFFFFF),
				FxDraw.argb(0.42F * fadeOld * fadeOld, 0xFFFFFF));
		}

		private static Vec3 extendTip(Vec3 base, Vec3 tip, float extend) {
			return extend <= 0.0F ? tip : tip.add(tip.subtract(base).scale(extend));
		}

		private static Vector3f toView(Vec3 world, Vec3 camera, @Nullable Quaternionf viewRotation) {
			Vector3f v = new Vector3f((float) (world.x - camera.x), (float) (world.y - camera.y), (float) (world.z - camera.z));
			if (viewRotation != null) {
				v.rotate(viewRotation);
			}

			return v;
		}

		private static float maxAge(TrailStyle style) {
			return style == TrailStyle.WIDE ? 0.24F : 0.17F;
		}

		private static float hue(TrailStyle style, float now, float sampleTime) {
			return switch (style) {
				case COOL -> 0.55F + (now - sampleTime) * 1.2F;
				case WARM -> 0.0F + (now - sampleTime) * 0.9F;
				case RAINBOW, WIDE -> sampleTime * 2.2F;
			};
		}

		private static int color(TrailStyle style, float hue) {
			return switch (style) {
				case COOL -> FxDraw.lerpRgb(Mth.clamp((hue - 0.55F) * 4.0F, 0.0F, 1.0F), 0x4FA2FF, 0x9B5BFF);
				case WARM -> FxDraw.lerpRgb(Mth.clamp(hue * 4.0F, 0.0F, 1.0F), 0xFFC23F, 0xFF4F2E);
				case RAINBOW, WIDE -> FxDraw.rainbow(hue);
			};
		}
	}
}
