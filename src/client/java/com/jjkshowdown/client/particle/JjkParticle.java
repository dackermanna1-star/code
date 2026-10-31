package com.jjkshowdown.client.particle;

import com.jjkshowdown.client.render.JjkRenderTypes;
import com.jjkshowdown.registry.ModParticles;
import net.fabricmc.fabric.api.client.particle.v1.ParticleFactoryRegistry;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.particle.ParticleProvider;
import net.minecraft.client.particle.SingleQuadParticle;
import net.minecraft.client.particle.SpriteSet;
import net.minecraft.core.particles.SimpleParticleType;
import net.minecraft.util.Mth;

/** All of the mod's particles: one configurable class, styled per type. */
public class JjkParticle extends SingleQuadParticle {
	public enum Style {
		SPARK(10, 0.12f, 0.0f, 0.86f, true, 0.0f),
		WISP(22, 0.22f, -0.012f, 0.92f, true, 0.02f),
		SLASH(7, 0.6f, 0.0f, 0.6f, true, 0.0f),
		BLACK_FLASH(6, 0.7f, 0.0f, 0.7f, false, 0.0f),
		STAR(40, 0.09f, -0.001f, 0.98f, true, 0.0f),
		SHOCKWAVE(16, 0.6f, 0.0f, 1.0f, true, 0.0f),
		IMPACT(6, 0.9f, 0.0f, 1.0f, true, 0.0f),
		GLOW(24, 0.12f, -0.005f, 0.9f, true, 0.0f),
		FLAME(16, 0.3f, -0.02f, 0.9f, true, 0.04f),
		BLOOD(26, 0.08f, 0.06f, 0.95f, false, 0.0f),
		EMBER(40, 0.07f, -0.008f, 0.96f, true, 0.01f);

		final int life;
		final float size;
		final float gravity;
		final float friction;
		final boolean additive;
		final float drift;

		Style(int life, float size, float gravity, float friction, boolean additive, float drift) {
			this.life = life;
			this.size = size;
			this.gravity = gravity;
			this.friction = friction;
			this.additive = additive;
			this.drift = drift;
		}
	}

	private static final FacingCameraMode FLAT = (q, cam, f) -> q.identity().rotateX((float) (-Math.PI / 2));

	private final SpriteSet sprites;
	private final Style style;
	private final float startSize;
	private final float spin;

	protected JjkParticle(ClientLevel level, double x, double y, double z, double vx, double vy, double vz, SpriteSet sprites, Style style) {
		super(level, x, y, z, sprites.first());
		this.sprites = sprites;
		this.style = style;
		this.xd = vx;
		this.yd = vy;
		this.zd = vz;
		this.hasPhysics = style == Style.BLOOD;
		this.gravity = style.gravity;
		this.friction = style.friction;
		this.lifetime = (int) (style.life * (0.75f + random.nextFloat() * 0.5f));
		this.quadSize = style.size * (0.7f + random.nextFloat() * 0.6f);
		this.startSize = quadSize;
		this.roll = random.nextFloat() * Mth.TWO_PI;
		this.oRoll = roll;
		this.spin = style == Style.SLASH || style == Style.BLACK_FLASH ? 0f : (random.nextFloat() - 0.5f) * 0.2f;
		if (style == Style.SHOCKWAVE) roll = 0;
		setSpriteFromAge(sprites);
	}

	@Override
	public void tick() {
		super.tick();
		if (style.drift > 0) {
			xd += (random.nextFloat() - 0.5f) * style.drift;
			zd += (random.nextFloat() - 0.5f) * style.drift;
		}
		oRoll = roll;
		roll += spin;
		setSpriteFromAge(sprites);
		float p = (float) age / lifetime;
		alpha = switch (style) {
			case STAR -> 0.5f + 0.5f * Mth.sin(age * 0.6f + startSize * 50);
			case SHOCKWAVE, IMPACT -> 1f - p;
			default -> p < 0.6f ? 1f : 1f - (p - 0.6f) / 0.4f;
		};
	}

	@Override
	public float getQuadSize(float partial) {
		float p = (age + partial) / lifetime;
		return switch (style) {
			case SHOCKWAVE -> startSize * (1f + p * 14f);
			case IMPACT -> startSize * (0.6f + p * 2.2f);
			case WISP, FLAME -> startSize * (1f - p * 0.6f);
			case SLASH -> startSize * (1f + p * 0.5f);
			default -> startSize;
		};
	}

	@Override
	public FacingCameraMode getFacingCameraMode() {
		return style == Style.SHOCKWAVE ? FLAT : FacingCameraMode.LOOKAT_XYZ;
	}

	@Override
	protected Layer getLayer() {
		return style.additive ? JjkRenderTypes.ADDITIVE_PARTICLES : Layer.TRANSLUCENT;
	}

	@Override
	public int getLightColor(float partial) {
		return style == Style.BLOOD ? super.getLightColor(partial) : 15728880;
	}

	private static void reg(SimpleParticleType type, Style style) {
		ParticleFactoryRegistry.getInstance().register(type, sprites ->
				(ParticleProvider<SimpleParticleType>) (t, level, x, y, z, vx, vy, vz, rnd) -> new JjkParticle(level, x, y, z, vx, vy, vz, sprites, style));
	}

	public static void registerAll() {
		reg(ModParticles.BLUE_SPARK, Style.SPARK);
		reg(ModParticles.RED_SPARK, Style.SPARK);
		reg(ModParticles.PURPLE_SPARK, Style.SPARK);
		reg(ModParticles.CE_WISP_BLUE, Style.WISP);
		reg(ModParticles.CE_WISP_RED, Style.WISP);
		reg(ModParticles.SLASH, Style.SLASH);
		reg(ModParticles.SLASH_RED, Style.SLASH);
		reg(ModParticles.BLACK_FLASH, Style.BLACK_FLASH);
		reg(ModParticles.VOID_STAR, Style.STAR);
		reg(ModParticles.SHOCKWAVE, Style.SHOCKWAVE);
		reg(ModParticles.IMPACT_FLASH, Style.IMPACT);
		reg(ModParticles.RCT_GLOW, Style.GLOW);
		reg(ModParticles.FUGA_FLAME, Style.FLAME);
		reg(ModParticles.BLOOD, Style.BLOOD);
		reg(ModParticles.DOMAIN_EMBER, Style.EMBER);
	}
}
