package com.godforge.client.particle;

import com.godforge.client.render.GfRenderTypes;
import com.godforge.registry.FxParticleOptions;
import net.minecraft.client.Camera;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.particle.SingleQuadParticle;
import net.minecraft.client.particle.SpriteSet;
import net.minecraft.client.renderer.LightTexture;
import net.minecraft.client.renderer.state.QuadParticleRenderState;
import net.minecraft.util.ARGB;
import net.minecraft.util.Mth;
import org.joml.Quaternionf;

/** One particle implementation driven entirely by {@link FxParticleOptions} flags. */
public class FxParticle extends SingleQuadParticle {
	private final FxParticleOptions options;
	private final SpriteSet sprites;
	private final boolean animated;
	private final float baseSize;
	private final float spinSpeed;
	private final float hueOffset;
	private double targetX;
	private double targetY;
	private double targetZ;

	public FxParticle(ClientLevel level, double x, double y, double z, double dx, double dy, double dz, FxParticleOptions options, SpriteSet sprites, boolean animated) {
		super(level, x, y, z, sprites.first());
		this.options = options;
		this.sprites = sprites;
		this.animated = animated;
		int flags = options.flags();
		if (has(flags, FxParticleOptions.F_ATTRACT)) {
			this.targetX = dx;
			this.targetY = dy;
			this.targetZ = dz;
			this.xd = 0;
			this.yd = 0;
			this.zd = 0;
		} else {
			this.xd = dx;
			this.yd = dy;
			this.zd = dz;
		}
		this.lifetime = Math.max(2, (int) (options.lifetime() * (0.85F + this.random.nextFloat() * 0.3F)));
		this.gravity = options.gravity();
		this.hasPhysics = !has(flags, FxParticleOptions.F_NO_PHYSICS);
		this.friction = has(flags, FxParticleOptions.F_NO_DRAG) ? 1.0F : 0.94F;
		this.baseSize = options.size() * (0.85F + this.random.nextFloat() * 0.3F);
		this.quadSize = this.baseSize;
		this.spinSpeed = has(flags, FxParticleOptions.F_SPIN) ? (this.random.nextFloat() - 0.5F) * 0.35F : 0.0F;
		this.roll = this.random.nextFloat() * Mth.TWO_PI;
		this.oRoll = this.roll;
		this.hueOffset = this.random.nextFloat();
		if (animated) {
			this.setSpriteFromAge(sprites);
		} else {
			this.setSprite(sprites.get(this.random));
		}
		this.updateColor(0.0F);
	}

	private static boolean has(int flags, int flag) {
		return (flags & flag) != 0;
	}

	private void updateColor(float t) {
		int flags = this.options.flags();
		int rgb;
		if (has(flags, FxParticleOptions.F_RAINBOW)) {
			rgb = Mth.hsvToRgb((this.hueOffset + t * 0.6F + this.age * 0.02F) % 1.0F, 0.75F, 1.0F);
		} else {
			rgb = ARGB.srgbLerp(t, this.options.color(), this.options.fadeColor());
		}
		this.setColor(ARGB.red(rgb) / 255.0F, ARGB.green(rgb) / 255.0F, ARGB.blue(rgb) / 255.0F);
		float fade = t > 0.6F ? 1.0F - (t - 0.6F) / 0.4F : Math.min(1.0F, t * 8.0F + 0.35F);
		this.setAlpha(Mth.clamp(fade, 0.0F, 1.0F));
	}

	@Override
	public void tick() {
		int flags = this.options.flags();
		if (has(flags, FxParticleOptions.F_ATTRACT)) {
			double dx = this.targetX - this.x;
			double dy = this.targetY - this.y;
			double dz = this.targetZ - this.z;
			double dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
			if (dist < 0.25) {
				this.remove();
				return;
			}
			double speed = Math.min(dist, 0.08 + 0.18 * (1.0 - (double) this.age / this.lifetime) + dist * 0.12);
			this.xd = dx / dist * speed;
			this.yd = dy / dist * speed;
			this.zd = dz / dist * speed;
			if (has(flags, FxParticleOptions.F_SPIN)) {
				// orbit while falling inward
				this.xd += -dz / dist * speed * 0.6;
				this.zd += dx / dist * speed * 0.6;
			}
		}
		this.oRoll = this.roll;
		this.roll += this.spinSpeed;
		super.tick();
		if (has(flags, FxParticleOptions.F_ATTRACT)) {
			this.xd = 0;
			this.yd = 0;
			this.zd = 0;
		}
		if (this.animated) {
			this.setSpriteFromAge(this.sprites);
		}
		this.updateColor(Mth.clamp((float) this.age / this.lifetime, 0.0F, 1.0F));
	}

	@Override
	public float getQuadSize(float partialTick) {
		float t = Mth.clamp((this.age + partialTick) / this.lifetime, 0.0F, 1.0F);
		int flags = this.options.flags();
		if (has(flags, FxParticleOptions.F_GROW)) {
			return this.baseSize * (0.4F + t * 2.6F);
		}
		if (has(flags, FxParticleOptions.F_SHRINK)) {
			return this.baseSize * (1.0F - t * t);
		}
		return this.baseSize;
	}

	@Override
	public void extract(QuadParticleRenderState state, Camera camera, float partialTick) {
		if (has(this.options.flags(), FxParticleOptions.F_FLAT)) {
			Quaternionf rotation = new Quaternionf().rotationX(-Mth.HALF_PI).rotateZ(Mth.lerp(partialTick, this.oRoll, this.roll));
			this.extractRotatedQuad(state, camera, rotation, partialTick);
			return;
		}
		super.extract(state, camera, partialTick);
	}

	@Override
	protected Layer getLayer() {
		return has(this.options.flags(), FxParticleOptions.F_ADDITIVE) ? GfRenderTypes.PARTICLE_GLOW_LAYER : Layer.TRANSLUCENT;
	}

	@Override
	public int getLightColor(float partialTick) {
		return has(this.options.flags(), FxParticleOptions.F_ADDITIVE) ? LightTexture.FULL_BRIGHT : super.getLightColor(partialTick);
	}
}
