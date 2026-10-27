package dev.visceral.client.fx;

import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.particle.ParticleProvider;
import net.minecraft.client.particle.SingleQuadParticle;
import net.minecraft.client.particle.SpriteSet;
import net.minecraft.core.Direction;
import net.minecraft.core.particles.SimpleParticleType;
import org.jspecify.annotations.Nullable;

/** Blood droplets, mist and bone chips. Created directly by {@link BloodFx} so they can carry a colour. */
public final class BloodParticles {
	static @Nullable SpriteSet dropSprites, mistSprites, boneSprites;

	private BloodParticles() {
	}

	/** Falling droplet: arcs under gravity and leaves a splat decal where it lands. */
	public static final class Drop extends SingleQuadParticle {
		private final boolean leavesDecal;
		private final float decalSize;

		public Drop(ClientLevel level, double x, double y, double z, double vx, double vy, double vz, SpriteSet sprites, float r, float g, float b,
			boolean leavesDecal, float decalSize) {
			super(level, x, y, z, vx, vy, vz, sprites.get(level.random));
			this.xd = vx;
			this.yd = vy;
			this.zd = vz;
			this.gravity = 1.1f;
			this.friction = 0.985f;
			this.lifetime = 50 + random.nextInt(40);
			this.quadSize = 0.035f + random.nextFloat() * 0.045f;
			float shade = 0.85f + random.nextFloat() * 0.25f;
			setColor(r * shade, g * shade, b * shade);
			setSize(0.04f, 0.04f);
			this.leavesDecal = leavesDecal;
			this.decalSize = decalSize;
		}

		@Override
		protected Layer getLayer() {
			return Layer.OPAQUE;
		}

		@Override
		public void tick() {
			double pvx = xd, pvz = zd;
			super.tick();
			if (!isAlive()) return;
			Direction hit = null;
			if (onGround) hit = Direction.UP;
			else if (Math.abs(pvx) > 0.01 && xd == 0) hit = pvx > 0 ? Direction.WEST : Direction.EAST;
			else if (Math.abs(pvz) > 0.01 && zd == 0) hit = pvz > 0 ? Direction.NORTH : Direction.SOUTH;
			if (hit != null) {
				if (leavesDecal) BloodDecals.splat(level, x, y, z, hit, decalSize * (0.7f + random.nextFloat() * 0.6f), rCol, gCol, bCol);
				remove();
			}
		}
	}

	/** Short-lived spray mist at the wound. */
	public static final class Mist extends SingleQuadParticle {
		private final float startSize;

		public Mist(ClientLevel level, double x, double y, double z, double vx, double vy, double vz, SpriteSet sprites, float r, float g, float b, float size) {
			super(level, x, y, z, vx, vy, vz, sprites.get(level.random));
			this.xd = vx;
			this.yd = vy;
			this.zd = vz;
			this.gravity = 0.15f;
			this.friction = 0.82f;
			this.lifetime = 8 + random.nextInt(7);
			this.startSize = size;
			this.quadSize = size;
			this.hasPhysics = false;
			this.roll = random.nextFloat() * 6.28f;
			this.oRoll = roll;
			setColor(r, g, b);
			setAlpha(0.75f);
		}

		@Override
		protected Layer getLayer() {
			return Layer.TRANSLUCENT;
		}

		@Override
		public void tick() {
			super.tick();
			float t = age / (float) lifetime;
			quadSize = startSize * (1f + t * 1.6f);
			setAlpha(0.75f * (1f - t));
		}
	}

	/** Bone fragments and dust (skeletons). */
	public static final class Chip extends SingleQuadParticle {
		public Chip(ClientLevel level, double x, double y, double z, double vx, double vy, double vz, SpriteSet sprites) {
			super(level, x, y, z, vx, vy, vz, sprites.get(level.random));
			this.xd = vx;
			this.yd = vy;
			this.zd = vz;
			this.gravity = 1.0f;
			this.lifetime = 30 + random.nextInt(30);
			this.quadSize = 0.05f + random.nextFloat() * 0.05f;
			this.roll = random.nextFloat() * 6.28f;
			this.oRoll = roll;
		}

		@Override
		protected Layer getLayer() {
			return Layer.OPAQUE;
		}

		@Override
		public void tick() {
			oRoll = roll;
			super.tick();
			if (!onGround) roll += 0.3f;
			if (onGround) {
				xd *= 0.5;
				zd *= 0.5;
			}
		}
	}

	/** Providers only capture sprite sets; particles are spawned with colour by {@link BloodFx}. */
	public static ParticleProvider<SimpleParticleType> dropProvider(SpriteSet sprites) {
		dropSprites = sprites;
		return (type, level, x, y, z, vx, vy, vz, random) -> new Drop(level, x, y, z, vx, vy, vz, sprites, 0.45f, 0.02f, 0.02f, true, 0.4f);
	}

	public static ParticleProvider<SimpleParticleType> mistProvider(SpriteSet sprites) {
		mistSprites = sprites;
		return (type, level, x, y, z, vx, vy, vz, random) -> new Mist(level, x, y, z, vx, vy, vz, sprites, 0.45f, 0.02f, 0.02f, 0.15f);
	}

	public static ParticleProvider<SimpleParticleType> chipProvider(SpriteSet sprites) {
		boneSprites = sprites;
		return (type, level, x, y, z, vx, vy, vz, random) -> new Chip(level, x, y, z, vx, vy, vz, sprites);
	}
}
