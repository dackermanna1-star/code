package com.godforge.client.fx;

import com.godforge.client.render.FxDraw;
import com.godforge.client.render.GfRenderTypes;
import com.mojang.blaze3d.vertex.PoseStack;
import java.util.ArrayList;
import java.util.List;
import net.fabricmc.fabric.api.client.rendering.v1.world.WorldRenderContext;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.world.phys.Vec3;

/** Short-lived client-side 3D effects (shockwaves, orbital lances, cut flashes ...) drawn in world space. */
public final class WorldFx {
	public abstract static class Effect {
		protected final Vec3 pos;
		protected final int duration;
		protected int age;

		protected Effect(Vec3 pos, int duration) {
			this.pos = pos;
			this.duration = Math.max(1, duration);
		}

		/** @return false when finished */
		boolean tick() {
			return ++this.age < this.duration;
		}

		protected float progress(float partialTick) {
			return Mth.clamp((this.age + partialTick) / this.duration, 0.0F, 1.0F);
		}

		abstract void render(PoseStack poseStack, SubmitNodeCollector collector, Vec3 camera, float partialTick);
	}

	private static final List<Effect> EFFECTS = new ArrayList<>();
	private static final int MAX = 384;

	private WorldFx() {
	}

	public static void add(Effect effect) {
		if (EFFECTS.size() >= MAX) {
			EFFECTS.removeFirst();
		}
		EFFECTS.add(effect);
	}

	public static void tick() {
		EFFECTS.removeIf(effect -> !effect.tick());
	}

	public static void clear() {
		EFFECTS.clear();
	}

	public static void render(WorldRenderContext context) {
		if (EFFECTS.isEmpty()) {
			return;
		}
		Vec3 camera = context.worldState().cameraRenderState.pos;
		float partial = Minecraft.getInstance().getDeltaTracker().getGameTimeDeltaPartialTick(false);
		PoseStack poseStack = context.matrices();
		SubmitNodeCollector collector = context.commandQueue();
		for (Effect effect : EFFECTS) {
			poseStack.pushPose();
			poseStack.translate(effect.pos.x - camera.x, effect.pos.y - camera.y, effect.pos.z - camera.z);
			effect.render(poseStack, collector, camera.subtract(effect.pos), partial);
			poseStack.popPose();
		}
	}

	// ------------------------------------------------------------------ effect types

	/** An expanding ground ring with a short glowing wall. */
	public static final class Shockwave extends Effect {
		private final float radius;
		private final int color;

		public Shockwave(Vec3 pos, float radius, int duration, int color) {
			super(pos, duration);
			this.radius = radius;
			this.color = color;
		}

		@Override
		void render(PoseStack poseStack, SubmitNodeCollector collector, Vec3 camera, float partialTick) {
			float t = this.progress(partialTick);
			float ease = 1.0F - (1.0F - t) * (1.0F - t) * (1.0F - t);
			float r = Math.max(0.5F, this.radius * ease);
			float width = 1.2F + this.radius * 0.07F;
			float alpha = (1.0F - t) * 0.95F;
			float wall = 0.8F + this.radius * 0.035F;
			int segments = Mth.clamp((int) (r * 3.0F), 24, 160);
			int c = this.color;
			collector.submitCustomGeometry(poseStack, GfRenderTypes.additive(), (pose, vc) -> {
				FxDraw.colorRing(vc, pose, Math.max(0.0F, r - width), r, 0.15F, segments, FxDraw.argb(c, 0.0F), FxDraw.argb(c, alpha));
				FxDraw.colorRing(vc, pose, r, r + width * 0.35F, 0.15F, segments, FxDraw.argb(0xFFFFFF, alpha), FxDraw.argb(c, 0.0F));
				FxDraw.colorWall(vc, pose, r, 0.0F, wall, segments, FxDraw.argb(c, alpha * 0.8F), FxDraw.argb(c, 0.0F));
			});
		}
	}

	/** A lance of energy from the sky (or any two points). */
	public static final class Beam extends Effect {
		private final Vec3 to;
		private final float radius;
		private final int color;

		public Beam(Vec3 from, Vec3 to, float radius, int duration, int color) {
			super(from, duration);
			this.to = to.subtract(from);
			this.radius = radius;
			this.color = color;
		}

		@Override
		void render(PoseStack poseStack, SubmitNodeCollector collector, Vec3 camera, float partialTick) {
			float t = this.progress(partialTick);
			float swell = t < 0.15F ? t / 0.15F : 1.0F - (t - 0.15F) / 0.85F;
			float r = this.radius * (0.3F + 0.7F * swell);
			int c = this.color;
			Vec3 end = this.to;
			collector.submitCustomGeometry(poseStack, GfRenderTypes.additive(), (pose, vc) -> {
				FxDraw.colorBeam(vc, pose, Vec3.ZERO, end, r * 0.35F, 12, FxDraw.argb(0xFFFFFF, swell), FxDraw.argb(0xFFFFFF, swell));
				FxDraw.colorBeam(vc, pose, Vec3.ZERO, end, r, 16, FxDraw.argb(c, swell * 0.6F), FxDraw.argb(c, swell * 0.6F));
				FxDraw.colorBeam(vc, pose, Vec3.ZERO, end, r * 2.2F, 16, FxDraw.argb(c, swell * 0.18F), FxDraw.argb(c, swell * 0.18F));
			});
			collector.submitCustomGeometry(poseStack, GfRenderTypes.glow(GfRenderTypes.TEX_BEAM), (pose, vc) -> {
				FxDraw.texStrip(vc, pose, Vec3.ZERO, end, camera, r * 5.0F, -this.age * 0.3F, 6.0F, FxDraw.argb(c, swell), FxDraw.argb(c, swell * 0.3F));
			});
		}
	}

	/** The Worldcutter's blinding vertical cut, racing along the ground. */
	public static final class Sever extends Effect {
		private final Vec3 dir;
		private final float length;
		private final float height;
		private final int color;

		public Sever(Vec3 origin, Vec3 vec, float height, int color) {
			super(origin, 36);
			this.length = (float) vec.length();
			this.dir = vec.lengthSqr() > 1.0E-6 ? vec.normalize() : new Vec3(0, 0, 1);
			this.height = height;
			this.color = color;
		}

		@Override
		void render(PoseStack poseStack, SubmitNodeCollector collector, Vec3 camera, float partialTick) {
			float t = this.progress(partialTick);
			float reveal = Mth.clamp((this.age + partialTick) / 12.0F, 0.0F, 1.0F);
			float fade = t < 0.35F ? 1.0F : 1.0F - (t - 0.35F) / 0.65F;
			float len = this.length * reveal;
			int c = this.color;
			int segments = Math.max(1, (int) (len / 4.0F));
			collector.submitCustomGeometry(poseStack, GfRenderTypes.additive(), (pose, vc) -> {
				for (int i = 0; i < segments; i++) {
					float a = len * i / segments;
					float b = len * (i + 1) / segments;
					float x0 = (float) this.dir.x * a;
					float z0 = (float) this.dir.z * a;
					float x1 = (float) this.dir.x * b;
					float z1 = (float) this.dir.z * b;
					float h = this.height * fade;
					// bright core band around ground level fading upward and downward
					int core = FxDraw.argb(0xFFFFFF, fade);
					int edge = FxDraw.argb(c, 0.0F);
					FxDraw.cv(vc, pose, x0, 0, z0, core);
					FxDraw.cv(vc, pose, x1, 0, z1, core);
					FxDraw.cv(vc, pose, x1, h, z1, edge);
					FxDraw.cv(vc, pose, x0, h, z0, edge);
					FxDraw.cv(vc, pose, x0, -h * 0.6F, z0, edge);
					FxDraw.cv(vc, pose, x1, -h * 0.6F, z1, edge);
					FxDraw.cv(vc, pose, x1, 0, z1, core);
					FxDraw.cv(vc, pose, x0, 0, z0, core);
				}
				// the leading tip blazes brightest
				FxDraw.colorBeam(vc, pose, new Vec3(this.dir.x * len, -4, this.dir.z * len), new Vec3(this.dir.x * len, this.height * 0.4, this.dir.z * len), 0.8F, 8,
					FxDraw.argb(0xFFFFFF, fade), FxDraw.argb(c, 0.0F));
			});
		}
	}

	/** An expanding (or collapsing) glowing shell. */
	public static final class Shell extends Effect {
		private final float from;
		private final float to;
		private final int color;
		private final boolean rainbow;

		public Shell(Vec3 pos, float from, float to, int duration, int color, boolean rainbow) {
			super(pos, duration);
			this.from = from;
			this.to = to;
			this.color = color;
			this.rainbow = rainbow;
		}

		@Override
		void render(PoseStack poseStack, SubmitNodeCollector collector, Vec3 camera, float partialTick) {
			float t = this.progress(partialTick);
			float ease = 1.0F - (1.0F - t) * (1.0F - t);
			float r = Mth.lerp(ease, this.from, this.to);
			float alpha = (1.0F - t) * 0.55F;
			int c = this.rainbow ? Mth.hsvToRgb((this.age + partialTick) * 0.03F % 1.0F, 0.6F, 1.0F) : this.color;
			int rings = Mth.clamp((int) (r * 1.2F), 10, 32);
			collector.submitCustomGeometry(poseStack, GfRenderTypes.glow(GfRenderTypes.TEX_SWIRL), (pose, vc) ->
				FxDraw.texSphere(vc, pose, r, rings, rings * 2, FxDraw.argb(c, alpha), 3.0F, this.age * 0.01F, 0.0F)
			);
			collector.submitCustomGeometry(poseStack, GfRenderTypes.additive(), (pose, vc) ->
				FxDraw.colorSphere(vc, pose, r * 0.92F, rings, rings * 2, FxDraw.argb(0xFFFFFF, alpha * 0.25F))
			);
		}
	}

	/** Holographic target designation on the ground. */
	public static final class LockOn extends Effect {
		private final float radius;
		private final int color;

		public LockOn(Vec3 pos, float radius, int duration, int color) {
			super(pos, Math.max(10, duration));
			this.radius = radius;
			this.color = color;
		}

		@Override
		void render(PoseStack poseStack, SubmitNodeCollector collector, Vec3 camera, float partialTick) {
			float t = this.progress(partialTick);
			float spin = (this.age + partialTick) * 0.08F;
			float pulse = 0.6F + 0.4F * Mth.sin((this.age + partialTick) * 0.5F);
			float alpha = (t > 0.8F ? (1.0F - t) / 0.2F : 1.0F) * pulse;
			float r = this.radius * (1.6F - 0.6F * Math.min(1.0F, t * 3.0F));
			int c = this.color;
			poseStack.pushPose();
			poseStack.translate(0.0F, 0.2F, 0.0F);
			collector.submitCustomGeometry(poseStack, GfRenderTypes.glow(GfRenderTypes.TEX_RING), (pose, vc) -> {
				FxDraw.flat(vc, pose, r, spin, FxDraw.argb(c, alpha));
				FxDraw.flat(vc, pose, r * 0.55F, -spin * 1.6F, FxDraw.argb(0xFFFFFF, alpha * 0.8F));
			});
			collector.submitCustomGeometry(poseStack, GfRenderTypes.additive(), (pose, vc) ->
				FxDraw.colorBeam(vc, pose, Vec3.ZERO, new Vec3(0, 96, 0), 0.25F + this.radius * 0.02F, 8, FxDraw.argb(c, alpha * 0.8F), FxDraw.argb(c, 0.0F))
			);
			poseStack.popPose();
		}
	}

	/** A jagged electric arc between two points. */
	public static final class Arc extends Effect {
		private final Vec3 to;
		private final int color;
		private final float width;
		private final long seed;

		public Arc(Vec3 from, Vec3 to, float width, int duration, int color, long seed) {
			super(from, duration);
			this.to = to.subtract(from);
			this.color = color;
			this.width = width;
			this.seed = seed;
		}

		@Override
		void render(PoseStack poseStack, SubmitNodeCollector collector, Vec3 camera, float partialTick) {
			float t = this.progress(partialTick);
			float alpha = 1.0F - t;
			RandomSource random = RandomSource.create(this.seed + this.age / 2);
			int segments = Mth.clamp((int) (this.to.length() / 1.5), 4, 40);
			double jitter = Math.min(3.0, this.to.length() * 0.06);
			int c = this.color;
			collector.submitCustomGeometry(poseStack, GfRenderTypes.additive(), (pose, vc) -> {
				Vec3 prev = Vec3.ZERO;
				for (int i = 1; i <= segments; i++) {
					Vec3 base = this.to.scale((double) i / segments);
					Vec3 next = i == segments ? this.to : base.add((random.nextDouble() - 0.5) * jitter, (random.nextDouble() - 0.5) * jitter, (random.nextDouble() - 0.5) * jitter);
					FxDraw.colorStrip(vc, pose, prev, next, camera, this.width, FxDraw.argb(0xFFFFFF, alpha), FxDraw.argb(0xFFFFFF, alpha));
					FxDraw.colorStrip(vc, pose, prev, next, camera, this.width * 4.0F, FxDraw.argb(c, alpha * 0.5F), FxDraw.argb(c, alpha * 0.5F));
					prev = next;
				}
			});
		}
	}

	/** A camera-facing glow flash (explosion cores, muzzle flashes). */
	public static final class Glow extends Effect {
		private final float size;
		private final int color;

		public Glow(Vec3 pos, float size, int duration, int color) {
			super(pos, duration);
			this.size = size;
			this.color = color;
		}

		@Override
		void render(PoseStack poseStack, SubmitNodeCollector collector, Vec3 camera, float partialTick) {
			float t = this.progress(partialTick);
			float alpha = 1.0F - t;
			float s = this.size * (0.6F + 0.6F * t);
			poseStack.pushPose();
			poseStack.mulPose(Minecraft.getInstance().gameRenderer.getMainCamera().rotation());
			int c = this.color;
			collector.submitCustomGeometry(poseStack, GfRenderTypes.glow(GfRenderTypes.TEX_GLOW), (pose, vc) -> {
				FxDraw.billboard(vc, pose, s * 2.2F, FxDraw.argb(c, alpha));
				FxDraw.billboard(vc, pose, s, FxDraw.argb(0xFFFFFF, alpha));
			});
			collector.submitCustomGeometry(poseStack, GfRenderTypes.glow(GfRenderTypes.TEX_FLARE), (pose, vc) ->
				FxDraw.billboard(vc, pose, s * 3.0F, t * 1.2F, FxDraw.argb(c, alpha * 0.8F))
			);
			poseStack.popPose();
		}
	}
}
