package com.ordnance.client.fx;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import net.minecraft.entity.Entity;
import net.minecraft.util.math.MathHelper;
import net.minecraft.util.math.Vec3d;
import org.jspecify.annotations.Nullable;

/**
 * Approximate volumes of thick smoke. When the camera is inside one, the screen is overlaid with smoke so vision is
 * genuinely obstructed (the particles alone would be culled from the inside).
 */
public final class SmokeVolumes {
	private static final List<Volume> VOLUMES = new ArrayList<>();
	private static long now;

	private SmokeVolumes() {
	}

	/** A cloud that expands to {@code radius} and thins out over {@code lifeTicks}. */
	public static void add(Vec3d center, float radius, float density, int lifeTicks, int rgb) {
		VOLUMES.add(new Volume(center, radius, density, now, lifeTicks, rgb, null));
	}

	/** A cloud fed by an entity (smoke canister); it follows the entity and lingers after it stops. */
	public static void attach(Entity source, float radius, float density, int rgb) {
		for (Volume volume : VOLUMES) {
			if (volume.anchor == source) {
				volume.refresh(now);
				return;
			}
		}

		VOLUMES.add(new Volume(source.getEntityPos(), radius, density, now, 160, rgb, source));
	}

	public static void tick() {
		now++;
		for (Iterator<Volume> it = VOLUMES.iterator(); it.hasNext(); ) {
			Volume volume = it.next();
			if (volume.anchor != null && !volume.anchor.isRemoved()) {
				volume.center = volume.anchor.getEntityPos().add(0.0, 1.2, 0.0);
			}

			if (now - volume.lastFed > volume.life) {
				it.remove();
			}
		}
	}

	public static void clear() {
		VOLUMES.clear();
	}

	/** Smoke density at a point, 0..1, plus the dominant colour. */
	public static Sample sample(Vec3d pos) {
		float total = 0.0F;
		int color = 0x6A6662;
		float best = 0.0F;
		for (Volume volume : VOLUMES) {
			long age = now - volume.born;
			float grow = MathHelper.clamp(age / 60.0F, 0.35F, 1.0F);
			float fade = 1.0F - MathHelper.clamp((now - volume.lastFed) / (float)volume.life, 0.0F, 1.0F);
			float radius = volume.radius * grow;
			double d = pos.distanceTo(volume.center.add(0.0, Math.min(3.0, age * 0.01), 0.0));
			if (d < radius) {
				float k = (float)(1.0 - d * d / (radius * radius));
				float contribution = volume.density * k * (float)Math.pow(fade, 0.7);
				total += contribution;
				if (contribution > best) {
					best = contribution;
					color = volume.rgb;
				}
			}
		}

		return new Sample(MathHelper.clamp(total, 0.0F, 1.0F), color);
	}

	public record Sample(float density, int rgb) {
	}

	private static final class Volume {
		Vec3d center;
		final float radius;
		final float density;
		final long born;
		long lastFed;
		final int life;
		final int rgb;
		@Nullable
		final Entity anchor;

		Volume(Vec3d center, float radius, float density, long born, int life, int rgb, @Nullable Entity anchor) {
			this.center = center;
			this.radius = radius;
			this.density = density;
			this.born = born;
			this.lastFed = born;
			this.life = life;
			this.rgb = rgb;
			this.anchor = anchor;
		}

		void refresh(long now) {
			this.lastFed = now;
		}
	}
}
