package dev.portalgun.client.particle;

import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.particle.Particle;
import net.minecraft.client.particle.ParticleProvider;
import net.minecraft.client.particle.SingleQuadParticle;
import net.minecraft.client.particle.SpriteSet;
import net.minecraft.core.particles.SimpleParticleType;
import net.minecraft.util.RandomSource;

/** Little lime twinkles that drift off portals and trail behind portal-gun shots. */
public class PortalSparkParticle extends SingleQuadParticle {
	private final float startSize;

	protected PortalSparkParticle(ClientLevel level, double x, double y, double z, double vx, double vy, double vz, SpriteSet sprites) {
		super(level, x, y, z, vx, vy, vz, sprites.first());
		this.xd = vx;
		this.yd = vy;
		this.zd = vz;
		this.friction = 0.92F;
		this.hasPhysics = false;
		this.gravity = 0.0F;
		this.lifetime = 14 + this.random.nextInt(14);
		this.quadSize = 0.06F + this.random.nextFloat() * 0.07F;
		this.startSize = this.quadSize;
		float tint = this.random.nextFloat();
		this.setColor(0.65F + tint * 0.35F, 1.0F, 0.45F + tint * 0.5F);
	}

	@Override
	public void tick() {
		super.tick();
		float t = (float) this.age / this.lifetime;
		this.quadSize = this.startSize * (1.0F - t * t);
		this.setAlpha(1.0F - t * 0.6F);
	}

	@Override
	protected Layer getLayer() {
		return Layer.TRANSLUCENT;
	}

	@Override
	public int getLightColor(float partialTick) {
		return 0xF000F0;
	}

	public static class Provider implements ParticleProvider<SimpleParticleType> {
		private final SpriteSet sprites;

		public Provider(SpriteSet sprites) {
			this.sprites = sprites;
		}

		@Override
		public Particle createParticle(SimpleParticleType type, ClientLevel level, double x, double y, double z, double vx, double vy, double vz, RandomSource random) {
			return new PortalSparkParticle(level, x, y, z, vx, vy, vz, this.sprites);
		}
	}
}
