package com.realweather.client.render;

import com.mojang.blaze3d.vertex.VertexConsumer;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import org.joml.Matrix4f;
import org.joml.Vector3f;

/**
 * Procedural cloud-to-ground lightning: a jagged main channel that wanders down from the cloud base and is pulled
 * towards the strike point, with forked branches (and sub-branches) that thin out and fade. Shapes are cached per
 * seed so a bolt keeps its channel through all of its return strokes.
 */
public final class LightningGeometry {
	public record Segment(float x0, float y0, float z0, float x1, float y1, float z1, float width, float brightness) {
	}

	private static final int CACHE_SIZE = 48;
	private static final Map<Long, List<Segment>> CACHE = new LinkedHashMap<>(64, 0.75F, true) {
		@Override
		protected boolean removeEldestEntry(Map.Entry<Long, List<Segment>> eldest) {
			return this.size() > CACHE_SIZE;
		}
	};

	private LightningGeometry() {
	}

	/** Channel from the ground (origin) up to {@code height} blocks above it. */
	public static List<Segment> get(long seed, float height) {
		long key = seed * 31L + Math.round(height / 8.0F);
		return CACHE.computeIfAbsent(key, k -> build(seed, height));
	}

	private static List<Segment> build(long seed, float height) {
		RandomSource random = RandomSource.create(seed);
		List<Segment> segments = new ArrayList<>(256);
		float spread = Mth.clamp(height * 0.12F, 6.0F, 26.0F);
		float x = (random.nextFloat() - 0.5F) * spread * 2.0F;
		float z = (random.nextFloat() - 0.5F) * spread * 2.0F;
		float y = height;
		int steps = Mth.clamp((int) (height / 3.2F), 18, 110);
		float stepY = height / steps;
		for (int i = 0; i < steps; i++) {
			float progress = (i + 1) / (float) steps;
			float ny = height - stepY * (i + 1);
			// Lateral wander that is pulled harder towards the strike point as the leader approaches the ground.
			float pull = progress * progress;
			float nx = x + (float) random.nextGaussian() * 1.6F * (1.0F - pull * 0.7F) - x * (0.08F + 0.5F * pull);
			float nz = z + (float) random.nextGaussian() * 1.6F * (1.0F - pull * 0.7F) - z * (0.08F + 0.5F * pull);
			if (i == steps - 1) {
				nx = 0.0F;
				nz = 0.0F;
				ny = 0.0F;
			}
			float width = 0.16F + 0.1F * (1.0F - progress * 0.3F);
			segments.add(new Segment(x, y, z, nx, ny, nz, width, 1.0F));
			if (i > 1 && i < steps - 3 && random.nextFloat() < 0.16F * (1.0F - progress * 0.6F)) {
				branch(random, segments, nx, ny, nz, 0.62F, width * 0.6F, 1, Mth.clamp((int) (steps * (0.15F + 0.3F * random.nextFloat())), 4, 40));
			}
			x = nx;
			y = ny;
			z = nz;
		}
		return segments;
	}

	private static void branch(RandomSource random, List<Segment> segments, float x, float y, float z, float brightness, float width, int depth, int length) {
		float angle = random.nextFloat() * Mth.TWO_PI;
		float dirX = Mth.cos(angle);
		float dirZ = Mth.sin(angle);
		float outward = 1.2F + random.nextFloat() * 1.6F;
		for (int i = 0; i < length && y > 1.0F; i++) {
			float fade = 1.0F - i / (float) length;
			float nx = x + dirX * outward + (float) random.nextGaussian() * 1.3F;
			float nz = z + dirZ * outward + (float) random.nextGaussian() * 1.3F;
			float ny = y - (1.8F + random.nextFloat() * 2.8F);
			segments.add(new Segment(x, y, z, nx, Math.max(ny, 0.0F), nz, width * (0.45F + 0.55F * fade), brightness * (0.35F + 0.65F * fade)));
			if (depth < 3 && random.nextFloat() < 0.09F) {
				branch(random, segments, nx, ny, nz, brightness * 0.6F, width * 0.6F, depth + 1, Math.max(3, (length - i) / 2));
			}
			x = nx;
			y = ny;
			z = nz;
		}
	}

	/**
	 * Emits the channel as camera-facing ribbons: a white-hot core plus a wider, bluish glow.
	 *
	 * @param pose     transform from bolt-local to camera-relative space
	 * @param cameraX  camera position in bolt-local space
	 */
	public static void emit(VertexConsumer consumer, Matrix4f pose, List<Segment> segments, float cameraX, float cameraY, float cameraZ,
			float brightness) {
		if (brightness <= 0.01F) {
			return;
		}
		Vector3f side = new Vector3f();
		Vector3f along = new Vector3f();
		Vector3f view = new Vector3f();
		for (Segment segment : segments) {
			float b = segment.brightness * brightness;
			if (b < 0.02F) {
				continue;
			}
			along.set(segment.x1 - segment.x0, segment.y1 - segment.y0, segment.z1 - segment.z0);
			view.set((segment.x0 + segment.x1) * 0.5F - cameraX, (segment.y0 + segment.y1) * 0.5F - cameraY, (segment.z0 + segment.z1) * 0.5F - cameraZ);
			along.cross(view, side);
			if (side.lengthSquared() < 1.0E-8F) {
				continue;
			}
			side.normalize();
			// Keep a minimum on-screen width so distant bolts don't shimmer away into sub-pixel lines.
			float distance = view.length();
			float minWidth = distance * 0.0016F;
			float core = Math.max(segment.width, minWidth);
			quad(consumer, pose, segment, side, core, 0.95F, 0.97F, 1.0F, Math.min(1.0F, b));
			quad(consumer, pose, segment, side, Math.max(core * 5.0F, minWidth * 3.0F), 0.52F, 0.6F, 1.0F, Math.min(1.0F, b * 0.22F));
			quad(consumer, pose, segment, side, Math.max(core * 16.0F, minWidth * 8.0F), 0.45F, 0.5F, 0.95F, Math.min(1.0F, b * 0.05F));
		}
	}

	private static void quad(VertexConsumer consumer, Matrix4f pose, Segment s, Vector3f side, float halfWidth, float r, float g, float b, float a) {
		float sx = side.x * halfWidth;
		float sy = side.y * halfWidth;
		float sz = side.z * halfWidth;
		consumer.addVertex(pose, s.x0 - sx, s.y0 - sy, s.z0 - sz).setColor(r, g, b, a);
		consumer.addVertex(pose, s.x0 + sx, s.y0 + sy, s.z0 + sz).setColor(r, g, b, a);
		consumer.addVertex(pose, s.x1 + sx, s.y1 + sy, s.z1 + sz).setColor(r, g, b, a);
		consumer.addVertex(pose, s.x1 - sx, s.y1 - sy, s.z1 - sz).setColor(r, g, b, a);
	}
}
