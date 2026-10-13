package dev.calibercraft.client.fx;

import dev.calibercraft.client.config.ClientConfig;
import dev.calibercraft.client.sound.GunSounds;
import dev.calibercraft.registry.ModParticles;
import dev.calibercraft.registry.ModSounds;
import java.util.ArrayDeque;
import java.util.Deque;
import net.fabricmc.fabric.api.client.particle.v1.ParticleFactoryRegistry;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.particle.Particle;
import net.minecraft.client.particle.SingleQuadParticle;
import net.minecraft.client.particle.SpriteSet;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.world.phys.Vec3;
import org.joml.Quaternionf;
import org.joml.Vector3f;

/** Particle implementations for weapon effects. All counts are bounded; decals and casings are capped globally. */
public final class CCParticles {
	private static final int FULL_BRIGHT = 0xF000F0;
	private static final Deque<Particle> HOLES = new ArrayDeque<>();
	private static final Deque<Particle> CASINGS = new ArrayDeque<>();

	private CCParticles() {
	}

	public static void register() {
		ParticleFactoryRegistry r = ParticleFactoryRegistry.getInstance();
		r.register(ModParticles.MUZZLE_SMOKE, sprites -> (t, level, x, y, z, dx, dy, dz, rnd) -> new Smoke(level, x, y, z, dx, dy, dz, sprites));
		r.register(ModParticles.SPARK, sprites -> (t, level, x, y, z, dx, dy, dz, rnd) -> new Spark(level, x, y, z, dx, dy, dz, sprites));
		r.register(ModParticles.IMPACT_FLASH, sprites -> (t, level, x, y, z, dx, dy, dz, rnd) -> new Flash(level, x, y, z, sprites, 0.18f, 2));
		r.register(ModParticles.MUZZLE_FLASH, sprites -> (t, level, x, y, z, dx, dy, dz, rnd) -> new Flash(level, x, y, z, sprites,
			(float) Math.max(0.1, dx), 2));
		r.register(ModParticles.BULLET_HOLE, sprites -> (t, level, x, y, z, dx, dy, dz, rnd) -> track(HOLES,
			new BulletHole(level, x, y, z, new Vector3f((float) dx, (float) dy, (float) dz), sprites.get(rnd)),
			ClientConfig.get().maxBulletHoles));
		r.register(ModParticles.CASING_BRASS, sprites -> (t, level, x, y, z, dx, dy, dz, rnd) -> track(CASINGS,
			new Casing(level, x, y, z, dx, dy, dz, sprites.first(), false), ClientConfig.get().maxCasings));
		r.register(ModParticles.CASING_SHELL, sprites -> (t, level, x, y, z, dx, dy, dz, rnd) -> track(CASINGS,
			new Casing(level, x, y, z, dx, dy, dz, sprites.first(), true), ClientConfig.get().maxCasings));
	}

	/** Keeps at most {@code max} live particles of a kind by retiring the oldest. */
	private static Particle track(Deque<Particle> list, Particle p, int max) {
		if (max <= 0) {
			return null;
		}
		list.removeIf(x -> !x.isAlive());
		while (list.size() >= max) {
			Particle old = list.pollFirst();
			if (old != null) {
				old.remove();
			}
		}
		list.addLast(p);
		return p;
	}

	public static void clear() {
		HOLES.clear();
		CASINGS.clear();
	}

	// ------------------------------------------------------------------------------------------------

	static final class Smoke extends SingleQuadParticle {
		private final SpriteSet sprites;
		private final float baseSize;

		Smoke(ClientLevel level, double x, double y, double z, double dx, double dy, double dz, SpriteSet sprites) {
			super(level, x, y, z, sprites.first());
			this.sprites = sprites;
			this.xd = dx + (random.nextFloat() - 0.5f) * 0.01;
			this.yd = dy + 0.008 + random.nextFloat() * 0.01;
			this.zd = dz + (random.nextFloat() - 0.5f) * 0.01;
			this.lifetime = 22 + random.nextInt(14);
			this.friction = 0.9f;
			this.gravity = -0.02f;
			this.hasPhysics = false;
			this.baseSize = 0.07f + random.nextFloat() * 0.05f;
			this.quadSize = baseSize;
			float g = 0.75f + random.nextFloat() * 0.15f;
			setColor(g, g, g);
			this.alpha = 0.45f;
			this.roll = random.nextFloat() * Mth.TWO_PI;
			this.oRoll = roll;
			setSpriteFromAge(sprites);
		}

		@Override
		public void tick() {
			super.tick();
			oRoll = roll;
			roll += 0.03f;
			float f = (float) age / lifetime;
			quadSize = baseSize * (1 + f * 3.5f);
			alpha = 0.45f * (1 - f) * (1 - f);
			setSpriteFromAge(sprites);
		}

		@Override
		protected Layer getLayer() {
			return Layer.TRANSLUCENT;
		}
	}

	static final class Spark extends SingleQuadParticle {
		Spark(ClientLevel level, double x, double y, double z, double dx, double dy, double dz, SpriteSet sprites) {
			super(level, x, y, z, sprites.get(RandomSource.create()));
			this.xd = dx;
			this.yd = dy;
			this.zd = dz;
			this.lifetime = 4 + random.nextInt(6);
			this.gravity = 1.0f;
			this.friction = 0.92f;
			this.quadSize = 0.025f + random.nextFloat() * 0.025f;
			setColor(1.0f, 0.85f + random.nextFloat() * 0.15f, 0.5f);
		}

		@Override
		public void tick() {
			super.tick();
			alpha = 1 - (float) age / lifetime;
			quadSize *= 0.92f;
		}

		@Override
		protected int getLightColor(float partial) {
			return FULL_BRIGHT;
		}

		@Override
		protected Layer getLayer() {
			return Layer.TRANSLUCENT;
		}
	}

	static final class Flash extends SingleQuadParticle {
		Flash(ClientLevel level, double x, double y, double z, SpriteSet sprites, float size, int life) {
			super(level, x, y, z, sprites.first());
			this.lifetime = life;
			this.quadSize = size;
			this.hasPhysics = false;
			this.roll = random.nextFloat() * Mth.TWO_PI;
			this.oRoll = roll;
		}

		@Override
		public void tick() {
			super.tick();
			alpha = 1 - (float) age / (lifetime + 1);
		}

		@Override
		protected int getLightColor(float partial) {
			return FULL_BRIGHT;
		}

		@Override
		protected Layer getLayer() {
			return Layer.TRANSLUCENT;
		}
	}

	/** A decal lying flat on the hit surface (fixed orientation instead of facing the camera). */
	static final class BulletHole extends SingleQuadParticle {
		private final Quaternionf orientation;

		BulletHole(ClientLevel level, double x, double y, double z, Vector3f normal, net.minecraft.client.renderer.texture.TextureAtlasSprite sprite) {
			super(level, x + normal.x * 0.012, y + normal.y * 0.012, z + normal.z * 0.012, sprite);
			Vector3f n = normal.lengthSquared() < 1e-6 ? new Vector3f(0, 1, 0) : new Vector3f(normal).normalize();
			// The quad lies in the XY plane facing +Z; rotate +Z onto the surface normal, then spin randomly.
			this.orientation = new Quaternionf().rotateTo(new Vector3f(0, 0, 1), n).rotateZ(random.nextFloat() * Mth.TWO_PI);
			this.lifetime = 300 + random.nextInt(200);
			this.quadSize = 0.055f + random.nextFloat() * 0.025f;
			this.hasPhysics = false;
			this.gravity = 0;
			this.xd = this.yd = this.zd = 0;
		}

		@Override
		public SingleQuadParticle.FacingCameraMode getFacingCameraMode() {
			return (q, camera, partial) -> q.set(orientation);
		}

		@Override
		public void tick() {
			xo = x;
			yo = y;
			zo = z;
			if (age++ >= lifetime) {
				remove();
			}
			float remaining = lifetime - age;
			alpha = remaining < 40 ? remaining / 40f : 1f;
		}

		@Override
		protected Layer getLayer() {
			return Layer.TRANSLUCENT;
		}
	}

	/** Ejected casing with simple physics, spin and a single bounce sound. */
	static final class Casing extends SingleQuadParticle {
		private final boolean shell;
		private int bounces;
		private final float spin;

		Casing(ClientLevel level, double x, double y, double z, double dx, double dy, double dz,
				net.minecraft.client.renderer.texture.TextureAtlasSprite sprite, boolean shell) {
			super(level, x, y, z, sprite);
			this.shell = shell;
			this.xd = dx;
			this.yd = dy;
			this.zd = dz;
			this.gravity = 1.0f;
			this.friction = 0.985f;
			this.lifetime = 50 + random.nextInt(30);
			this.quadSize = shell ? 0.06f : 0.035f;
			this.spin = (random.nextFloat() - 0.5f) * 0.9f;
			this.hasPhysics = true;
			setSize(0.05f, 0.05f);
		}

		@Override
		public void tick() {
			double vy = yd;
			super.tick();
			oRoll = roll;
			if (!onGround) {
				roll += spin;
			}
			if (onGround && vy < -0.06 && bounces < 2) {
				bounces++;
				yd = -vy * 0.35;
				xd *= 0.6;
				zd *= 0.6;
				if (bounces == 1) {
					GunSounds.playAt(ModSounds.get(shell ? "casing.shell" : "casing.brass"), new Vec3(x, y, z), 0.35f,
						0.9f + random.nextFloat() * 0.2f);
				}
			}
			if (lifetime - age < 10) {
				alpha = (lifetime - age) / 10f;
			}
		}

		@Override
		protected Layer getLayer() {
			return Layer.TRANSLUCENT;
		}
	}
}
