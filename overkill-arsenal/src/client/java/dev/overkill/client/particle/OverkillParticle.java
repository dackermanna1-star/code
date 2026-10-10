package dev.overkill.client.particle;

import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.particle.ParticleProvider;
import net.minecraft.client.particle.SingleQuadParticle;
import net.minecraft.client.particle.SpriteSet;
import net.minecraft.core.particles.SimpleParticleType;
import net.minecraft.util.ARGB;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;

/**
 * One configurable particle class drives every particle in the mod; a {@link ParticleStyle} decides
 * how it looks and moves. For "static" styles the spawn velocity is reinterpreted as
 * (size multiplier, alpha multiplier, lifetime override) and the particle stays put.
 */
public class OverkillParticle extends SingleQuadParticle {
	private static final int FULL_BRIGHT = 0xF000F0;
	private static final SingleQuadParticle.FacingCameraMode FACE_UP = (rotation, camera, partialTick) -> rotation.rotationX((float) (-Math.PI / 2.0));

	private final ParticleStyle style;
	private final SpriteSet sprites;
	private final float baseSize;
	private final float baseAlpha;
	private final float spin;
	private final float flickerSeed;

	protected OverkillParticle(ClientLevel level, double x, double y, double z, double vx, double vy, double vz, SpriteSet sprites,
		ParticleStyle style, RandomSource random) {
		super(level, x, y, z, style.animated() ? sprites.first() : sprites.get(random));
		this.style = style;
		this.sprites = sprites;
		this.gravity = style.gravity();
		this.friction = style.friction();
		this.hasPhysics = style.physics();

		float size = Mth.lerp(random.nextFloat(), style.sizeMin(), style.sizeMax());
		float alpha = style.alpha();
		int life = style.lifeMin() + (style.lifeMax() > style.lifeMin() ? random.nextInt(style.lifeMax() - style.lifeMin() + 1) : 0);
		if (style.staticParams()) {
			size *= vx > 0.0 ? (float) vx : 1.0F;
			alpha *= vy > 0.0 ? (float) vy : 1.0F;
			life = vz > 0.0 ? (int) vz : life;
			this.xd = 0.0;
			this.yd = 0.0;
			this.zd = 0.0;
		} else {
			this.xd = vx;
			this.yd = vy;
			this.zd = vz;
		}
		this.baseSize = size;
		this.baseAlpha = Mth.clamp(alpha, 0.0F, 1.0F);
		this.quadSize = size;
		this.lifetime = Math.max(1, life);
		this.spin = style.spin() > 0.0F ? (random.nextFloat() * 2.0F - 1.0F) * style.spin() : 0.0F;
		this.roll = style.spin() > 0.0F ? random.nextFloat() * Mth.TWO_PI : 0.0F;
		this.oRoll = this.roll;
		this.flickerSeed = random.nextFloat() * 100.0F;
		this.updateColor(0.0F);
	}

	@Override
	public void tick() {
		super.tick();
		if (this.removed) {
			return;
		}
		if (this.style.animated()) {
			this.setSpriteFromAge(this.sprites);
		}
		this.yd += this.style.rise();
		float jitter = this.style.jitter();
		if (jitter > 0.0F) {
			this.xd += (this.random.nextFloat() - 0.5F) * jitter;
			this.yd += (this.random.nextFloat() - 0.5F) * jitter;
			this.zd += (this.random.nextFloat() - 0.5F) * jitter;
		}
		this.oRoll = this.roll;
		this.roll += this.spin;
		this.updateColor(this.age / (float) this.lifetime);
	}

	private void updateColor(float t) {
		int color = ARGB.srgbLerp(t, this.style.colorStart(), this.style.colorEnd());
		float flicker = 1.0F;
		if (this.style.flicker() > 0.0F) {
			flicker = 1.0F - this.style.flicker() * (0.5F + 0.5F * Mth.sin((this.age + this.flickerSeed) * 1.7F));
		}
		this.rCol = ARGB.redFloat(color) * flicker;
		this.gCol = ARGB.greenFloat(color) * flicker;
		this.bCol = ARGB.blueFloat(color) * flicker;
		this.alpha = this.baseAlpha * this.style.fade().alpha(t);
	}

	@Override
	public float getQuadSize(float partialTick) {
		float t = Mth.clamp((this.age + partialTick) / this.lifetime, 0.0F, 1.0F);
		return this.baseSize * this.style.curve().scale(t);
	}

	@Override
	protected int getLightColor(float partialTick) {
		return this.style.fullBright() ? FULL_BRIGHT : super.getLightColor(partialTick);
	}

	@Override
	public SingleQuadParticle.FacingCameraMode getFacingCameraMode() {
		return this.style.horizontal() ? FACE_UP : SingleQuadParticle.FacingCameraMode.LOOKAT_XYZ;
	}

	@Override
	protected SingleQuadParticle.Layer getLayer() {
		return SingleQuadParticle.Layer.TRANSLUCENT;
	}

	public static ParticleProvider<SimpleParticleType> provider(SpriteSet sprites, ParticleStyle style) {
		return (type, level, x, y, z, vx, vy, vz, random) -> new OverkillParticle(level, x, y, z, vx, vy, vz, sprites, style, random);
	}
}
