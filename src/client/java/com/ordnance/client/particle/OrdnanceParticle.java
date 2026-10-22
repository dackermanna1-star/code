package com.ordnance.client.particle;

import java.util.List;
import java.util.function.Consumer;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.particle.BillboardParticle;
import net.minecraft.client.particle.BillboardParticleSubmittable;
import net.minecraft.client.particle.SpriteProvider;
import net.minecraft.client.render.Camera;
import net.minecraft.client.render.LightmapTextureManager;
import net.minecraft.client.world.ClientWorld;
import net.minecraft.entity.Entity;
import net.minecraft.util.math.MathHelper;
import net.minecraft.util.math.Vec3d;
import org.joml.Quaternionf;
import org.jspecify.annotations.Nullable;

/**
 * One data-driven particle used by every Ordnance effect: colour keyframes, alpha fade, size growth, gravity,
 * buoyancy, drag, wind drift, emissive fade, optional bouncing collision and flat (ground ring) orientation.
 * Build one with {@link #builder(SpriteProvider)}.
 */
public class OrdnanceParticle extends BillboardParticle {
	private static final int FULL_BRIGHT = LightmapTextureManager.MAX_LIGHT_COORDINATE;
	private final SpriteProvider sprites;
	private final boolean animated;
	private final BillboardParticle.RenderType renderType;
	private final int colorStart;
	private final int colorMid;
	private final int colorEnd;
	private final float colorMidPoint;
	private final float alphaMax;
	private final float fadeIn;
	private final float fadeOutStart;
	private final float sizeStart;
	private final float sizeEnd;
	private final float sizeExponent;
	private final float gravity;
	private final float buoyancy;
	private final float drag;
	private final float wind;
	private final double windX;
	private final double windZ;
	private final float emissiveStart;
	private final float emissiveEnd;
	private final float spin;
	private final boolean horizontal;
	private final boolean collide;
	private final boolean bounce;
	private final float restitution;
	@Nullable
	private final Consumer<OrdnanceParticle> tickAction;
	@Nullable
	private final Consumer<OrdnanceParticle> deathAction;

	private OrdnanceParticle(ClientWorld world, double x, double y, double z, Builder b) {
		super(world, x, y, z, b.sprites.getFirst());
		this.sprites = b.sprites;
		this.animated = b.animated;
		this.renderType = b.renderType;
		this.colorStart = b.colorStart;
		this.colorMid = b.colorMid;
		this.colorEnd = b.colorEnd;
		this.colorMidPoint = b.colorMidPoint;
		this.alphaMax = b.alpha;
		this.fadeIn = b.fadeIn;
		this.fadeOutStart = b.fadeOutStart;
		this.sizeStart = b.sizeStart;
		this.sizeEnd = b.sizeEnd;
		this.sizeExponent = b.sizeExponent;
		this.gravity = b.gravity;
		this.buoyancy = b.buoyancy;
		this.drag = b.drag;
		this.wind = b.wind;
		this.windX = b.windX;
		this.windZ = b.windZ;
		this.emissiveStart = b.emissiveStart;
		this.emissiveEnd = b.emissiveEnd;
		this.horizontal = b.horizontal;
		this.collide = b.collide;
		this.collidesWithWorld = b.collide;
		this.bounce = b.bounce;
		this.restitution = b.restitution;
		this.tickAction = b.tickAction;
		this.deathAction = b.deathAction;
		this.velocityX = b.vx;
		this.velocityY = b.vy;
		this.velocityZ = b.vz;
		this.maxAge = b.lifeMin + (b.lifeMax > b.lifeMin ? this.random.nextInt(b.lifeMax - b.lifeMin + 1) : 0);
		this.spin = b.spin == 0.0F ? 0.0F : (this.random.nextFloat() * 2.0F - 1.0F) * b.spin;
		this.zRotation = this.random.nextFloat() * MathHelper.TAU;
		this.lastZRotation = this.zRotation;
		this.setBoundingBoxSpacing(b.hitbox, b.hitbox);
		this.setSprite(this.animated ? this.sprites.getSprite(0, this.maxAge) : this.sprites.getSprite(this.random));
		this.updateColor(0.0F);
	}

	public static Builder builder(SpriteProvider sprites) {
		return new Builder(sprites);
	}

	public double getX() {
		return this.x;
	}

	public double getY() {
		return this.y;
	}

	public double getZ() {
		return this.z;
	}

	public Vec3d getPos() {
		return new Vec3d(this.x, this.y, this.z);
	}

	public Vec3d getVelocity() {
		return new Vec3d(this.velocityX, this.velocityY, this.velocityZ);
	}

	public int getAge() {
		return this.age;
	}

	public boolean isOnGround() {
		return this.onGround;
	}

	@Override
	public void tick() {
		this.lastX = this.x;
		this.lastY = this.y;
		this.lastZ = this.z;
		this.lastZRotation = this.zRotation;
		if (this.age++ >= this.maxAge) {
			this.markDead();
			if (this.deathAction != null) {
				this.deathAction.accept(this);
			}

			return;
		}

		if (this.animated) {
			this.setSprite(this.sprites.getSprite(this.age, this.maxAge));
		}

		this.velocityY += this.buoyancy - this.gravity;
		if (this.wind != 0.0F) {
			this.velocityX += (this.windX - this.velocityX) * 0.03 * this.wind;
			this.velocityZ += (this.windZ - this.velocityZ) * 0.03 * this.wind;
		}

		this.move(this.velocityX, this.velocityY, this.velocityZ);
		this.velocityX *= this.drag;
		this.velocityY *= this.drag;
		this.velocityZ *= this.drag;
		this.zRotation += this.spin;
		if (this.tickAction != null) {
			this.tickAction.accept(this);
		}
	}

	@Override
	public void move(double dx, double dy, double dz) {
		if (!this.collide) {
			this.setBoundingBox(this.getBoundingBox().offset(dx, dy, dz));
			this.repositionFromBoundingBox();
			return;
		}

		Vec3d adjusted = Entity.adjustMovementForCollisions(null, new Vec3d(dx, dy, dz), this.getBoundingBox(), this.world, List.of());
		this.setBoundingBox(this.getBoundingBox().offset(adjusted));
		this.repositionFromBoundingBox();
		boolean hitX = Math.abs(adjusted.x - dx) > 1.0E-6;
		boolean hitY = Math.abs(adjusted.y - dy) > 1.0E-6;
		boolean hitZ = Math.abs(adjusted.z - dz) > 1.0E-6;
		this.onGround = hitY && dy < 0.0;
		if (hitX) {
			this.velocityX = this.bounce ? -this.velocityX * this.restitution : 0.0;
		}

		if (hitZ) {
			this.velocityZ = this.bounce ? -this.velocityZ * this.restitution : 0.0;
		}

		if (hitY) {
			this.velocityY = this.bounce && Math.abs(this.velocityY) > 0.05 ? -this.velocityY * this.restitution : 0.0;
		}

		if (this.onGround) {
			this.velocityX *= 0.7;
			this.velocityZ *= 0.7;
		}
	}

	@Override
	public void markDead() {
		if (!this.dead) {
			ParticleBudget.release();
		}

		super.markDead();
	}

	private float progress(float tickProgress) {
		return MathHelper.clamp((this.age + tickProgress) / this.maxAge, 0.0F, 1.0F);
	}

	private void updateColor(float t) {
		int c;
		if (t < this.colorMidPoint) {
			c = lerpColor(t / Math.max(1.0E-4F, this.colorMidPoint), this.colorStart, this.colorMid);
		} else {
			c = lerpColor((t - this.colorMidPoint) / Math.max(1.0E-4F, 1.0F - this.colorMidPoint), this.colorMid, this.colorEnd);
		}

		this.red = (c >> 16 & 0xFF) / 255.0F;
		this.green = (c >> 8 & 0xFF) / 255.0F;
		this.blue = (c & 0xFF) / 255.0F;
		float a = (c >>> 24 & 0xFF) / 255.0F * this.alphaMax;
		if (this.fadeIn > 0.0F && t < this.fadeIn) {
			a *= t / this.fadeIn;
		}

		if (t > this.fadeOutStart) {
			a *= 1.0F - (t - this.fadeOutStart) / Math.max(1.0E-4F, 1.0F - this.fadeOutStart);
		}

		this.alpha = MathHelper.clamp(a, 0.0F, 1.0F);
	}

	private static int lerpColor(float t, int from, int to) {
		t = MathHelper.clamp(t, 0.0F, 1.0F);
		int a = (int)MathHelper.lerp(t, from >>> 24 & 0xFF, to >>> 24 & 0xFF);
		int r = (int)MathHelper.lerp(t, from >> 16 & 0xFF, to >> 16 & 0xFF);
		int g = (int)MathHelper.lerp(t, from >> 8 & 0xFF, to >> 8 & 0xFF);
		int b = (int)MathHelper.lerp(t, from & 0xFF, to & 0xFF);
		return a << 24 | r << 16 | g << 8 | b;
	}

	@Override
	public void render(BillboardParticleSubmittable submittable, Camera camera, float tickProgress) {
		this.updateColor(this.progress(tickProgress));
		if (this.alpha <= 0.003F) {
			return;
		}

		if (this.horizontal) {
			float roll = MathHelper.lerp(tickProgress, this.lastZRotation, this.zRotation);
			this.render(submittable, camera, new Quaternionf().rotationX((float)(-Math.PI / 2.0)).rotateZ(roll), tickProgress);
			this.render(submittable, camera, new Quaternionf().rotationX((float)(Math.PI / 2.0)).rotateZ(roll), tickProgress);
		} else {
			super.render(submittable, camera, tickProgress);
		}
	}

	@Override
	public float getSize(float tickProgress) {
		float t = this.progress(tickProgress);
		float eased = this.sizeExponent == 1.0F ? t : (float)Math.pow(t, this.sizeExponent);
		return MathHelper.lerp(eased, this.sizeStart, this.sizeEnd);
	}

	@Override
	protected int getBrightness(float tint) {
		float emissive = MathHelper.lerp(this.progress(tint), this.emissiveStart, this.emissiveEnd);
		if (emissive >= 0.999F) {
			return FULL_BRIGHT;
		}

		int light = super.getBrightness(tint);
		if (emissive <= 0.001F) {
			return light;
		}

		int glow = Math.round(emissive * 15.0F);
		int block = Math.max(LightmapTextureManager.getBlockLightCoordinates(light), glow);
		int sky = Math.max(LightmapTextureManager.getSkyLightCoordinates(light), glow);
		return LightmapTextureManager.pack(block, sky);
	}

	@Override
	protected BillboardParticle.RenderType getRenderType() {
		return this.renderType;
	}

	public static final class Builder {
		private final SpriteProvider sprites;
		private boolean animated;
		private BillboardParticle.RenderType renderType = OrdnanceRenderTypes.SOFT;
		private int lifeMin = 20;
		private int lifeMax = 30;
		private float sizeStart = 0.5F;
		private float sizeEnd = 0.5F;
		private float sizeExponent = 1.0F;
		private int colorStart = 0xFFFFFFFF;
		private int colorMid = 0xFFFFFFFF;
		private int colorEnd = 0xFFFFFFFF;
		private float colorMidPoint = 0.5F;
		private float alpha = 1.0F;
		private float fadeIn;
		private float fadeOutStart = 0.6F;
		private double vx;
		private double vy;
		private double vz;
		private float gravity;
		private float buoyancy;
		private float drag = 0.98F;
		private float wind;
		private double windX;
		private double windZ;
		private float emissiveStart;
		private float emissiveEnd;
		private float spin;
		private boolean horizontal;
		private boolean collide;
		private boolean bounce;
		private float restitution = 0.4F;
		private float hitbox = 0.1F;
		@Nullable
		private Consumer<OrdnanceParticle> tickAction;
		@Nullable
		private Consumer<OrdnanceParticle> deathAction;

		private Builder(SpriteProvider sprites) {
			this.sprites = sprites;
		}

		public Builder animated() {
			this.animated = true;
			return this;
		}

		public Builder glow() {
			this.renderType = OrdnanceRenderTypes.GLOW;
			return this;
		}

		public Builder life(int min, int max) {
			this.lifeMin = Math.max(1, min);
			this.lifeMax = Math.max(this.lifeMin, max);
			return this;
		}

		public Builder size(float start, float end) {
			this.sizeStart = start;
			this.sizeEnd = end;
			return this;
		}

		/** Size growth curve: below 1 grows fast then slows (billowing), above 1 starts slow. */
		public Builder sizeCurve(float exponent) {
			this.sizeExponent = exponent;
			return this;
		}

		public Builder color(int argb) {
			return this.colors(argb, argb, argb);
		}

		public Builder colors(int start, int end) {
			return this.colors(start, lerp(start, end), end);
		}

		public Builder colors(int start, int mid, int end) {
			this.colorStart = start;
			this.colorMid = mid;
			this.colorEnd = end;
			return this;
		}

		public Builder colorMidPoint(float t) {
			this.colorMidPoint = t;
			return this;
		}

		public Builder alpha(float alpha) {
			this.alpha = alpha;
			return this;
		}

		public Builder fade(float fadeIn, float fadeOutStart) {
			this.fadeIn = fadeIn;
			this.fadeOutStart = fadeOutStart;
			return this;
		}

		public Builder velocity(double x, double y, double z) {
			this.vx = x;
			this.vy = y;
			this.vz = z;
			return this;
		}

		public Builder velocity(Vec3d v) {
			return this.velocity(v.x, v.y, v.z);
		}

		public Builder gravity(float gravity) {
			this.gravity = gravity;
			return this;
		}

		public Builder buoyancy(float buoyancy) {
			this.buoyancy = buoyancy;
			return this;
		}

		public Builder drag(float drag) {
			this.drag = drag;
			return this;
		}

		/** Drift towards the given wind velocity with the given responsiveness. */
		public Builder wind(Vec3d windVelocity, float factor) {
			this.wind = factor;
			this.windX = windVelocity.x;
			this.windZ = windVelocity.z;
			return this;
		}

		/** 1 = fully self-lit, 0 = world light; fades over the lifetime. */
		public Builder emissive(float start, float end) {
			this.emissiveStart = start;
			this.emissiveEnd = end;
			return this;
		}

		public Builder spin(float maxRadiansPerTick) {
			this.spin = maxRadiansPerTick;
			return this;
		}

		public Builder horizontal() {
			this.horizontal = true;
			return this;
		}

		public Builder collide() {
			this.collide = true;
			return this;
		}

		public Builder bounce(float restitution) {
			this.collide = true;
			this.bounce = true;
			this.restitution = restitution;
			return this;
		}

		public Builder onTick(Consumer<OrdnanceParticle> action) {
			this.tickAction = action;
			return this;
		}

		public Builder onDeath(Consumer<OrdnanceParticle> action) {
			this.deathAction = action;
			return this;
		}

		/** Spawns the particle if the budget allows; returns null otherwise. */
		@Nullable
		public OrdnanceParticle spawn(ClientWorld world, double x, double y, double z) {
			if (!ParticleBudget.tryAcquire()) {
				return null;
			}

			OrdnanceParticle particle = new OrdnanceParticle(world, x, y, z, this);
			MinecraftClient.getInstance().particleManager.addParticle(particle);
			return particle;
		}

		@Nullable
		public OrdnanceParticle spawn(ClientWorld world, Vec3d pos) {
			return this.spawn(world, pos.x, pos.y, pos.z);
		}

		/** Builds without adding it to the particle manager (for particle factories). Budget must already be held. */
		public OrdnanceParticle build(ClientWorld world, double x, double y, double z) {
			return new OrdnanceParticle(world, x, y, z, this);
		}

		private static int lerp(int a, int b) {
			return OrdnanceParticle.lerpColor(0.5F, a, b);
		}
	}
}
