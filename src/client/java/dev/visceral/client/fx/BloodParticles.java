package dev.visceral.client.fx;

import com.mojang.blaze3d.vertex.PoseStack;
import dev.visceral.blood.BloodType;
import dev.visceral.client.render.Atlas;
import dev.visceral.client.render.QuadBatch;
import dev.visceral.client.render.VisceralRenderTypes;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.client.Camera;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.renderer.LevelRenderer;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.culling.Frustum;
import net.minecraft.core.BlockPos;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.tags.FluidTags;
import net.minecraft.util.ARGB;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.ClipContext;
import net.minecraft.world.level.material.FluidState;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;
import net.minecraft.world.phys.shapes.CollisionContext;
import org.joml.Vector3f;
import org.joml.Vector3fc;

/**
 * Lightweight particle simulation dedicated to blood. Droplets are drawn stretched along their
 * velocity (motion blur), splash into stains when they hit a block and bloom into clouds under water.
 */
public final class BloodParticles {
	public static final int DROP = 0;
	public static final int MIST = 1;
	public static final int CLOUD = 2;
	public static final int CHIP = 3;
	public static final int SPARK = 4;
	public static final int EMBER = 5;

	private static final int MAX_PARTICLES = 4000;
	private static final double GRAVITY = 0.045;
	private static final List<Particle> PARTICLES = new ArrayList<>();
	private static final RandomSource RANDOM = RandomSource.create();

	private BloodParticles() {
	}

	static final class Particle {
		int kind;
		BloodType blood;
		double x;
		double y;
		double z;
		double prevX;
		double prevY;
		double prevZ;
		double vx;
		double vy;
		double vz;
		float size;
		float prevSize;
		float roll;
		float prevRoll;
		float spin;
		int age;
		int lifetime;
		int color;
		float alpha;
		int light;
		boolean glow;
		boolean resting;
		boolean bounced;
	}

	public static int count() {
		return PARTICLES.size();
	}

	public static void clear() {
		PARTICLES.clear();
	}

	// ------------------------------------------------------------------ spawning

	/** A liquid droplet; {@code v*} in blocks per tick. */
	public static void drop(ClientLevel level, double x, double y, double z, double vx, double vy, double vz, float size, BloodType blood) {
		Particle p = spawn(DROP, blood, x, y, z, vx, vy, vz, size, 60 + RANDOM.nextInt(60));
		if (p != null) {
			p.color = BloodType.lerpRgb(blood.fresh, 0xFFFFFF, 0.04F);
			p.alpha = 0.96F;
			p.glow = blood.glows();
			FluidState fluid = level.getFluidState(BlockPos.containing(x, y, z));
			if (fluid.is(FluidTags.WATER)) {
				toCloud(p);
			}
		}
	}

	public static void mist(double x, double y, double z, double vx, double vy, double vz, float size, BloodType blood, float alpha) {
		Particle p = spawn(MIST, blood, x, y, z, vx, vy, vz, size, 5 + RANDOM.nextInt(6));
		if (p != null) {
			p.color = blood.fresh;
			p.alpha = alpha;
			p.roll = RANDOM.nextFloat() * Mth.TWO_PI;
			p.spin = (RANDOM.nextFloat() - 0.5F) * 0.2F;
			p.glow = blood.glows();
		}
	}

	public static void cloud(double x, double y, double z, double vx, double vy, double vz, float size, BloodType blood) {
		Particle p = spawn(CLOUD, blood, x, y, z, vx, vy, vz, size, 70 + RANDOM.nextInt(70));
		if (p != null) {
			toCloud(p);
		}
	}

	/** Solid fragments: bone chips, wood splinters, snow and metal flakes. */
	public static void chip(double x, double y, double z, double vx, double vy, double vz, float size, BloodType blood, int color) {
		Particle p = spawn(CHIP, blood, x, y, z, vx, vy, vz, size, 30 + RANDOM.nextInt(25));
		if (p != null) {
			p.color = color;
			p.alpha = 1.0F;
			p.roll = RANDOM.nextFloat() * Mth.TWO_PI;
			p.spin = (RANDOM.nextFloat() - 0.5F) * 0.8F;
		}
	}

	public static void spark(double x, double y, double z, double vx, double vy, double vz, float size, int color) {
		Particle p = spawn(SPARK, BloodType.METAL, x, y, z, vx, vy, vz, size, 5 + RANDOM.nextInt(8));
		if (p != null) {
			p.color = color;
			p.alpha = 1.0F;
			p.glow = true;
		}
	}

	public static void ember(double x, double y, double z, double vx, double vy, double vz, float size, int color) {
		Particle p = spawn(EMBER, BloodType.EMBER, x, y, z, vx, vy, vz, size, 18 + RANDOM.nextInt(24));
		if (p != null) {
			p.color = color;
			p.alpha = 1.0F;
			p.glow = true;
		}
	}

	private static Particle spawn(int kind, BloodType blood, double x, double y, double z, double vx, double vy, double vz, float size, int lifetime) {
		if (PARTICLES.size() >= MAX_PARTICLES) {
			// Recycle the oldest particle instead of growing without bound.
			PARTICLES.removeFirst();
		}
		Particle p = new Particle();
		p.kind = kind;
		p.blood = blood;
		p.x = p.prevX = x;
		p.y = p.prevY = y;
		p.z = p.prevZ = z;
		p.vx = vx;
		p.vy = vy;
		p.vz = vz;
		p.size = p.prevSize = size;
		p.lifetime = lifetime;
		p.light = -1;
		PARTICLES.add(p);
		return p;
	}

	private static void toCloud(Particle p) {
		p.kind = CLOUD;
		p.vx *= 0.15;
		p.vy *= 0.15;
		p.vz *= 0.15;
		p.size = p.prevSize = Math.max(0.06F, p.size * 1.5F);
		p.age = 0;
		p.lifetime = 70 + RANDOM.nextInt(70);
		p.color = p.blood.fresh;
		p.alpha = 0.42F;
		p.roll = RANDOM.nextFloat() * Mth.TWO_PI;
		p.spin = (RANDOM.nextFloat() - 0.5F) * 0.05F;
	}

	// ------------------------------------------------------------------ simulation

	public static void tick(ClientLevel level) {
		for (int i = PARTICLES.size() - 1; i >= 0; i--) {
			Particle p = PARTICLES.get(i);
			if (!tick(level, p)) {
				int last = PARTICLES.size() - 1;
				PARTICLES.set(i, PARTICLES.get(last));
				PARTICLES.remove(last);
			}
		}
	}

	/** @return false when the particle died */
	private static boolean tick(ClientLevel level, Particle p) {
		p.prevX = p.x;
		p.prevY = p.y;
		p.prevZ = p.z;
		p.prevSize = p.size;
		p.prevRoll = p.roll;
		if (++p.age > p.lifetime) {
			return false;
		}
		if (p.light < 0 || (p.age & 3) == 0) {
			p.light = LevelRenderer.getLightColor(level, BlockPos.containing(p.x, p.y, p.z));
		}
		switch (p.kind) {
			case DROP -> {
				p.vy -= GRAVITY;
				p.vx *= 0.985;
				p.vy *= 0.985;
				p.vz *= 0.985;
				return moveAndCollide(level, p);
			}
			case MIST -> {
				p.vx *= 0.82;
				p.vy = p.vy * 0.82 - 0.003;
				p.vz *= 0.82;
				p.x += p.vx;
				p.y += p.vy;
				p.z += p.vz;
				p.size *= 1.045F;
				p.roll += p.spin;
				return true;
			}
			case CLOUD -> {
				p.vx = p.vx * 0.9 + (RANDOM.nextFloat() - 0.5F) * 0.002;
				p.vy = p.vy * 0.9 + 0.0006;
				p.vz = p.vz * 0.9 + (RANDOM.nextFloat() - 0.5F) * 0.002;
				p.x += p.vx;
				p.y += p.vy;
				p.z += p.vz;
				p.size = Math.min(p.size * 1.015F, 0.9F);
				p.roll += p.spin;
				return level.getFluidState(BlockPos.containing(p.x, p.y, p.z)).is(FluidTags.WATER) || p.age < 4;
			}
			case CHIP -> {
				if (!p.resting) {
					p.vy -= GRAVITY;
					p.vx *= 0.98;
					p.vy *= 0.98;
					p.vz *= 0.98;
					p.roll += p.spin;
					return moveAndCollide(level, p);
				}
				return true;
			}
			case SPARK -> {
				p.vy -= GRAVITY * 0.5;
				p.vx *= 0.93;
				p.vy *= 0.93;
				p.vz *= 0.93;
				p.size *= 0.93F;
				return moveAndCollide(level, p);
			}
			case EMBER -> {
				p.vx = p.vx * 0.92 + (RANDOM.nextFloat() - 0.5F) * 0.004;
				p.vy = p.vy * 0.92 + 0.004;
				p.vz = p.vz * 0.92 + (RANDOM.nextFloat() - 0.5F) * 0.004;
				p.x += p.vx;
				p.y += p.vy;
				p.z += p.vz;
				p.size *= 0.97F;
				return true;
			}
			default -> {
				return false;
			}
		}
	}

	private static boolean moveAndCollide(ClientLevel level, Particle p) {
		Vec3 from = new Vec3(p.x, p.y, p.z);
		Vec3 to = new Vec3(p.x + p.vx, p.y + p.vy, p.z + p.vz);
		if (!level.isLoaded(BlockPos.containing(to))) {
			return false;
		}
		BlockHitResult hit = level.clip(new ClipContext(from, to, ClipContext.Block.COLLIDER, ClipContext.Fluid.ANY, CollisionContext.empty()));
		if (hit.getType() == HitResult.Type.MISS) {
			p.x = to.x;
			p.y = to.y;
			p.z = to.z;
			return true;
		}
		Vec3 location = hit.getLocation();
		FluidState fluid = level.getFluidState(hit.getBlockPos());
		if (!fluid.isEmpty()) {
			if (fluid.is(FluidTags.LAVA)) {
				level.addParticle(ParticleTypes.SMOKE, location.x, location.y + 0.05, location.z, 0.0, 0.03, 0.0);
				return false;
			}
			if (p.kind == DROP) {
				p.x = location.x;
				p.y = location.y - 0.05;
				p.z = location.z;
				toCloud(p);
				return true;
			}
			return false;
		}
		Vec3 velocity = new Vec3(p.vx, p.vy, p.vz);
		switch (p.kind) {
			case DROP -> {
				BloodDecals.impact(level, location, hit.getDirection(), velocity, p.size, p.blood);
				// Fast drops throw a few smaller droplets back up.
				double speed = velocity.length();
				if (speed > 0.45 && p.size > 0.03F && RANDOM.nextFloat() < 0.5F) {
					Vec3 normal = Vec3.atLowerCornerOf(hit.getDirection().getUnitVec3i());
					for (int i = 0; i < 2; i++) {
						Vec3 bounce = velocity.subtract(normal.scale(velocity.dot(normal) * 1.6)).scale(0.25)
							.add((RANDOM.nextFloat() - 0.5F) * 0.06, (RANDOM.nextFloat() - 0.5F) * 0.06, (RANDOM.nextFloat() - 0.5F) * 0.06);
						Vec3 start = location.add(normal.scale(0.02));
						drop(level, start.x, start.y, start.z, bounce.x, bounce.y, bounce.z, p.size * 0.45F, p.blood);
					}
				}
				return false;
			}
			case CHIP -> {
				Vec3 normal = Vec3.atLowerCornerOf(hit.getDirection().getUnitVec3i());
				p.x = location.x + normal.x * 0.01;
				p.y = location.y + normal.y * 0.01;
				p.z = location.z + normal.z * 0.01;
				if (!p.bounced && velocity.lengthSqr() > 0.01) {
					Vec3 reflected = velocity.subtract(normal.scale(velocity.dot(normal) * 1.8)).scale(0.35);
					p.vx = reflected.x;
					p.vy = reflected.y;
					p.vz = reflected.z;
					p.bounced = true;
				} else {
					p.resting = hit.getDirection() == net.minecraft.core.Direction.UP;
					p.vx = 0;
					p.vy = 0;
					p.vz = 0;
					if (!p.resting) {
						return false;
					}
				}
				return true;
			}
			default -> {
				return false;
			}
		}
	}

	// ------------------------------------------------------------------ rendering

	public static void submit(SubmitNodeCollector collector, ClientLevel level, Camera camera, Frustum frustum, float partialTick) {
		if (PARTICLES.isEmpty()) {
			return;
		}
		Vec3 cam = camera.position();
		Vector3fc left = camera.leftVector();
		Vector3fc up = camera.upVector();
		QuadBatch lit = new QuadBatch(PARTICLES.size());
		QuadBatch glow = new QuadBatch(64);
		Vector3f normal = new Vector3f(camera.forwardVector()).negate();

		for (Particle p : PARTICLES) {
			double x = Mth.lerp(partialTick, p.prevX, p.x);
			double y = Mth.lerp(partialTick, p.prevY, p.y);
			double z = Mth.lerp(partialTick, p.prevZ, p.z);
			float size = Mth.lerp(partialTick, p.prevSize, p.size);
			if (frustum != null && !frustum.isVisible(new AABB(x - size, y - size, z - size, x + size, y + size, z + size))) {
				continue;
			}
			float rx = (float) (x - cam.x);
			float ry = (float) (y - cam.y);
			float rz = (float) (z - cam.z);
			float life = (float) p.age / p.lifetime;
			float alpha = switch (p.kind) {
				case MIST -> p.alpha * (1.0F - life);
				case CLOUD -> p.alpha * Math.min(1.0F, (1.0F - life) * 2.0F) * Math.min(1.0F, p.age / 6.0F);
				case CHIP, SPARK, EMBER -> p.alpha * Math.min(1.0F, (1.0F - life) * 3.0F);
				default -> p.alpha;
			};
			if (alpha <= 0.01F) {
				continue;
			}
			int color = ARGB.color(Math.round(alpha * 255.0F), p.color);
			int light = p.light < 0 ? LevelRenderer.getLightColor(level, BlockPos.containing(x, y, z)) : p.light;
			QuadBatch batch = p.glow ? glow : lit;
			switch (p.kind) {
				case DROP, SPARK -> {
					// Stretch along the screen-space velocity for a motion blurred streak.
					Vector3f velocity = new Vector3f((float) p.vx, (float) p.vy, (float) p.vz);
					Vector3f view = new Vector3f(rx, ry, rz);
					float distance = view.length();
					if (distance > 1.0E-4F) {
						view.div(distance);
					}
					Vector3f axis = new Vector3f(velocity).fma(-velocity.dot(view), view);
					float speed = axis.length();
					int cell = p.kind == SPARK ? Atlas.SPARK : Atlas.PARTICLE_DROP;
					if (speed < 1.0E-3F) {
						billboard(batch, rx, ry, rz, size * 0.6F, 0.0F, left, up, cell, color, light, normal);
					} else {
						axis.div(speed);
						Vector3f side = new Vector3f(axis).cross(view).normalize();
						float halfLength = size * 0.6F + speed * (p.kind == SPARK ? 0.9F : 0.32F);
						float halfWidth = size * (p.kind == SPARK ? 0.35F : 0.5F);
						stretched(batch, rx, ry, rz, axis, side, halfLength, halfWidth, cell, color, light, normal);
					}
				}
				case MIST, CLOUD -> billboard(batch, rx, ry, rz, size, Mth.lerp(partialTick, p.prevRoll, p.roll), left, up, Atlas.MIST, color, light, normal);
				case CHIP -> billboard(batch, rx, ry, rz, size, Mth.lerp(partialTick, p.prevRoll, p.roll), left, up, Atlas.CHIP, color, light, normal);
				case EMBER -> billboard(batch, rx, ry, rz, size, 0.0F, left, up, Atlas.PARTICLE_DROP, color, light, normal);
				default -> {
				}
			}
		}
		PoseStack identity = new PoseStack();
		if (lit.vertexCount() > 0) {
			collector.submitCustomGeometry(identity, VisceralRenderTypes.BLOOD, lit::emit);
		}
		if (glow.vertexCount() > 0) {
			collector.submitCustomGeometry(identity, VisceralRenderTypes.GLOWING, glow::emit);
		}
	}

	private static void billboard(QuadBatch batch, float x, float y, float z, float size, float roll, Vector3fc left, Vector3fc up, int cell, int color, int light, Vector3f normal) {
		float cos = Mth.cos(roll);
		float sin = Mth.sin(roll);
		// Rotated in-plane axes.
		float ax = (left.x() * cos + up.x() * sin) * size;
		float ay = (left.y() * cos + up.y() * sin) * size;
		float az = (left.z() * cos + up.z() * sin) * size;
		float bx = (-left.x() * sin + up.x() * cos) * size;
		float by = (-left.y() * sin + up.y() * cos) * size;
		float bz = (-left.z() * sin + up.z() * cos) * size;
		float u0 = Atlas.u0(cell);
		float u1 = Atlas.u1(cell);
		float v0 = Atlas.v0(cell);
		float v1 = Atlas.v1(cell);
		batch.vertex(x - ax - bx, y - ay - by, z - az - bz, u1, v1, color, light, normal.x, normal.y, normal.z);
		batch.vertex(x - ax + bx, y - ay + by, z - az + bz, u1, v0, color, light, normal.x, normal.y, normal.z);
		batch.vertex(x + ax + bx, y + ay + by, z + az + bz, u0, v0, color, light, normal.x, normal.y, normal.z);
		batch.vertex(x + ax - bx, y + ay - by, z + az - bz, u0, v1, color, light, normal.x, normal.y, normal.z);
	}

	/** Quad whose long side follows {@code axis}; the texture's bottom (droplet head) leads the motion. */
	private static void stretched(QuadBatch batch, float x, float y, float z, Vector3f axis, Vector3f side, float halfLength, float halfWidth, int cell, int color, int light, Vector3f normal) {
		float ax = axis.x * halfLength;
		float ay = axis.y * halfLength;
		float az = axis.z * halfLength;
		float sx = side.x * halfWidth;
		float sy = side.y * halfWidth;
		float sz = side.z * halfWidth;
		float u0 = Atlas.u0(cell);
		float u1 = Atlas.u1(cell);
		float v0 = Atlas.v0(cell);
		float v1 = Atlas.v1(cell);
		batch.vertex(x + ax - sx, y + ay - sy, z + az - sz, u0, v1, color, light, normal.x, normal.y, normal.z);
		batch.vertex(x + ax + sx, y + ay + sy, z + az + sz, u1, v1, color, light, normal.x, normal.y, normal.z);
		batch.vertex(x - ax + sx, y - ay + sy, z - az + sz, u1, v0, color, light, normal.x, normal.y, normal.z);
		batch.vertex(x - ax - sx, y - ay - sy, z - az - sz, u0, v0, color, light, normal.x, normal.y, normal.z);
	}

}
