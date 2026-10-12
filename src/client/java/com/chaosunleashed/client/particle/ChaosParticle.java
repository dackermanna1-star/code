package com.chaosunleashed.client.particle;

import com.chaosunleashed.registry.ModParticles;
import net.fabricmc.fabric.api.client.particle.v1.ParticleFactoryRegistry;
import net.minecraft.client.particle.BillboardParticle;
import net.minecraft.client.particle.ParticleFactory;
import net.minecraft.client.particle.SpriteProvider;
import net.minecraft.client.world.ClientWorld;
import net.minecraft.particle.SimpleParticleType;
import net.minecraft.util.math.MathHelper;
import net.minecraft.util.math.random.Random;

/** One configurable particle class used for all Chaos particles (PLACEHOLDER sprites, see textures/particle). */
public class ChaosParticle extends BillboardParticle {
	/** Per-type behavior. */
	public record Style(float gravity, float friction, int minAge, int maxAge, float minScale, float maxScale,
						boolean glow, boolean keepVelocity, float spin, float startAlpha) {
	}

	private final SpriteProvider sprites;
	private final Style style;
	private final float baseAlpha;

	protected ChaosParticle(ClientWorld world, double x, double y, double z, double vx, double vy, double vz,
							SpriteProvider sprites, Style style, Random random) {
		super(world, x, y, z, vx, vy, vz, sprites.getSprite(random));
		this.sprites = sprites;
		this.style = style;
		if (style.keepVelocity()) {
			this.velocityX = vx;
			this.velocityY = vy;
			this.velocityZ = vz;
		}
		this.gravityStrength = style.gravity();
		this.velocityMultiplier = style.friction();
		this.maxAge = MathHelper.nextInt(random, style.minAge(), style.maxAge());
		this.scale = MathHelper.nextFloat(random, style.minScale(), style.maxScale());
		this.baseAlpha = style.startAlpha();
		this.alpha = this.baseAlpha;
		this.zRotation = random.nextFloat() * MathHelper.TAU;
		this.lastZRotation = this.zRotation;
		this.collidesWithWorld = !style.keepVelocity();
		this.updateSprite(sprites);
	}

	@Override
	public void tick() {
		super.tick();
		this.lastZRotation = this.zRotation;
		this.zRotation += this.style.spin();
		float life = this.age / (float) this.maxAge;
		this.alpha = this.baseAlpha * (life < 0.8F ? 1.0F : 1.0F - (life - 0.8F) / 0.2F);
		this.updateSprite(this.sprites);
	}

	@Override
	protected BillboardParticle.RenderType getRenderType() {
		return BillboardParticle.RenderType.PARTICLE_ATLAS_TRANSLUCENT;
	}

	@Override
	protected int getBrightness(float tint) {
		return this.style.glow() ? 0xF000F0 : super.getBrightness(tint);
	}

	public static ParticleFactory<SimpleParticleType> factory(SpriteProvider sprites, Style style) {
		return (type, world, x, y, z, vx, vy, vz, random) -> new ChaosParticle(world, x, y, z, vx, vy, vz, sprites, style, random);
	}

	public static void register() {
		ParticleFactoryRegistry registry = ParticleFactoryRegistry.getInstance();
		registry.register(ModParticles.EMBER, sprites -> factory(sprites, new Style(0.05F, 0.96F, 40, 90, 0.08F, 0.18F, true, false, 0.05F, 1.0F)));
		registry.register(ModParticles.BLOOD_MIST, sprites -> factory(sprites, new Style(-0.01F, 0.95F, 60, 120, 0.25F, 0.5F, false, false, 0.01F, 0.6F)));
		registry.register(ModParticles.RIFT_SPARK, sprites -> factory(sprites, new Style(0.3F, 0.98F, 20, 50, 0.1F, 0.25F, true, false, 0.2F, 1.0F)));
		registry.register(ModParticles.VOID_SWIRL, sprites -> factory(sprites, new Style(0.0F, 1.0F, 15, 30, 0.15F, 0.35F, true, true, 0.1F, 0.9F)));
		registry.register(ModParticles.DUST_CLOUD, sprites -> factory(sprites, new Style(-0.02F, 0.9F, 40, 80, 1.2F, 2.8F, false, false, 0.01F, 0.75F)));
		registry.register(ModParticles.PLASMA, sprites -> factory(sprites, new Style(0.0F, 0.9F, 8, 18, 0.1F, 0.25F, true, false, 0.3F, 1.0F)));
		registry.register(ModParticles.SHADOW_WISP, sprites -> factory(sprites, new Style(-0.02F, 0.94F, 40, 80, 0.2F, 0.45F, false, false, 0.02F, 0.8F)));
		registry.register(ModParticles.GRAVITY_MOTE, sprites -> factory(sprites, new Style(-0.08F, 0.95F, 30, 60, 0.08F, 0.16F, true, false, 0.1F, 1.0F)));
		registry.register(ModParticles.BEAM_SPARK, sprites -> factory(sprites, new Style(0.02F, 0.9F, 6, 14, 0.2F, 0.5F, true, false, 0.4F, 1.0F)));
	}
}
