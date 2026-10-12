package com.extremesports.server;

import com.extremesports.entity.SportEquipmentEntity;
import com.extremesports.physics.GrindFinder;
import com.extremesports.physics.GrindSegment;
import com.extremesports.physics.SurfaceSampler;
import com.extremesports.sport.SportType;
import com.extremesports.trick.ComboScorer;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import org.jspecify.annotations.Nullable;

/**
 * Server-side observation of a rider, independent of what their client claims. Air time, grind time and distance
 * are measured from the world so combo submissions can be sanity-checked before they are scored.
 */
public final class ServerRideTracker {
	private static final Map<UUID, ServerRideTracker> TRACKERS = new ConcurrentHashMap<>();

	public final ComboScorer.History history = new ComboScorer.History();
	public int airTicks;
	public int grindTicks;
	public int ridingTicks;
	public long lastComboTick = -100;
	public @Nullable SportType sport;
	public long lastRideTick = -1000;
	public double pendingDistance;
	private @Nullable Vec3 lastPos;

	public static ServerRideTracker get(ServerPlayer player) {
		return TRACKERS.computeIfAbsent(player.getUUID(), uuid -> new ServerRideTracker());
	}

	public static void remove(UUID uuid) {
		TRACKERS.remove(uuid);
	}

	public void onMount(SportEquipmentEntity entity) {
		sport = entity.sport();
		lastPos = entity.position();
		resetCounters();
	}

	public void onDismount(SportEquipmentEntity entity) {
		lastPos = null;
	}

	public void resetCounters() {
		airTicks = 0;
		grindTicks = 0;
		ridingTicks = 0;
	}

	public void sample(SportEquipmentEntity entity) {
		Level level = entity.level();
		sport = entity.sport();
		lastRideTick = level.getGameTime();
		ridingTicks++;
		Vec3 pos = entity.position();
		if (lastPos != null) {
			double dx = pos.x - lastPos.x;
			double dz = pos.z - lastPos.z;
			double moved = Math.sqrt(dx * dx + dz * dz);
			if (moved < 3.0) {
				pendingDistance += moved;
			}
		}
		lastPos = pos;
		if (nearGrindLine(entity)) {
			grindTicks++;
		} else if (!supported(entity)) {
			airTicks++;
		}
	}

	private static boolean supported(SportEquipmentEntity entity) {
		Vec3 pos = entity.position();
		AABB feet = new AABB(pos.x - 0.2, pos.y - 0.25, pos.z - 0.2, pos.x + 0.2, pos.y + 0.05, pos.z + 0.2);
		if (!entity.level().noCollision(entity, feet)) {
			return true;
		}
		return SurfaceSampler.sample(entity.level(), pos.x, pos.y, pos.z, 0.1, 0.3) != null;
	}

	private static boolean nearGrindLine(SportEquipmentEntity entity) {
		Vec3 pos = entity.position();
		for (GrindSegment segment : GrindFinder.collect(entity.level(), new AABB(pos, pos).inflate(0.6))) {
			if (segment.at(segment.closestT(pos)).distanceToSqr(pos) < 0.45 * 0.45) {
				return true;
			}
		}
		return false;
	}
}
