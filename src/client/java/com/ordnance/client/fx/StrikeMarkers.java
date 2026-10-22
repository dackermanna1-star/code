package com.ordnance.client.fx;

import com.ordnance.client.particle.OrdnanceParticle;
import com.ordnance.client.particle.ParticleSprites;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.world.ClientWorld;
import net.minecraft.util.math.Vec3d;
import org.jspecify.annotations.Nullable;

/** Incoming missile markers: a pulsing red target ring and red smoke flare at the aim point, plus HUD countdown. */
public final class StrikeMarkers {
	private static final List<Marker> MARKERS = new ArrayList<>();
	private static long now;

	private StrikeMarkers() {
	}

	public static void warn(Vec3d target, int ticksToImpact) {
		for (Marker marker : MARKERS) {
			if (marker.target.squaredDistanceTo(target) < 1.0) {
				marker.impactTick = now + ticksToImpact;
				return;
			}
		}

		MARKERS.add(new Marker(target, now + ticksToImpact));
	}

	public static void tick(MinecraftClient client) {
		now++;
		ClientWorld world = client.world;
		for (Iterator<Marker> it = MARKERS.iterator(); it.hasNext(); ) {
			Marker marker = it.next();
			if (now > marker.impactTick + 5) {
				it.remove();
				continue;
			}

			if (world == null || !ParticleSprites.ready()) {
				continue;
			}

			Vec3d t = marker.target;
			if (now % 10 == 0) {
				OrdnanceParticle.builder(ParticleSprites.SHOCKWAVE).horizontal().life(18, 18).size(0.4F, 3.2F).color(0xFFFF2010).alpha(0.8F)
					.fade(0.0F, 0.3F).emissive(1.0F, 1.0F).spawn(world, t.x, t.y + 0.1, t.z);
			}

			if (now % 2 == 0) {
				OrdnanceParticle.builder(ParticleSprites.SMOKE).life(60, 100).size(0.25F, 1.5F).sizeCurve(0.6F)
					.colors(0xE0E02010, 0xC0B03020, 0x80A06058).alpha(0.85F).velocity(0.0, 0.12, 0.0).drag(0.97F)
					.emissive(0.6F, 0.1F).spawn(world, t.x, t.y + 0.2, t.z);
			}
		}
	}

	/** Closest active marker to the camera within range, for the HUD. */
	@Nullable
	public static Marker nearest(Vec3d from, double range) {
		Marker best = null;
		double bestDistance = range;
		for (Marker marker : MARKERS) {
			double d = marker.target.distanceTo(from);
			if (d < bestDistance) {
				bestDistance = d;
				best = marker;
			}
		}

		return best;
	}

	public static float secondsLeft(Marker marker) {
		return Math.max(0.0F, (marker.impactTick - now) / 20.0F);
	}

	public static void clear() {
		MARKERS.clear();
	}

	public static final class Marker {
		public final Vec3d target;
		long impactTick;

		Marker(Vec3d target, long impactTick) {
			this.target = target;
			this.impactTick = impactTick;
		}
	}
}
