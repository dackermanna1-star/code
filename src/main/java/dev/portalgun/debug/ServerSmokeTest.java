package dev.portalgun.debug;

import dev.portalgun.PortalGunMod;
import dev.portalgun.content.ContentSpec;
import dev.portalgun.dimension.Destinations;
import dev.portalgun.registry.ModCreatures;
import dev.portalgun.travel.SafeSpotFinder;
import java.util.ArrayList;
import java.util.List;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.minecraft.core.BlockPos;
import net.minecraft.resources.Identifier;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.phys.Vec3;

/**
 * Headless smoke test for dedicated servers (and anything else running the server side), enabled only with
 * {@code -Dportalgun.smoketest=true}. On server start it generates chunks in every portal gun dimension (around the
 * origin and far away), finds an arrival spot, spawns every spec creature of the dimension there, lets the world tick
 * for a while and then logs a summary line per dimension and stops the server. Inert unless the property is set.
 */
public final class ServerSmokeTest {
	private static final int TICKS = 200;
	private static final List<Entity> SPAWNED = new ArrayList<>();
	private static int ticks = -1;

	private ServerSmokeTest() {
	}

	public static void init() {
		if (!Boolean.getBoolean("portalgun.smoketest")) {
			return;
		}
		PortalGunMod.LOGGER.warn("[smoketest] enabled - the server stops after the test");
		ServerLifecycleEvents.SERVER_STARTED.register(ServerSmokeTest::start);
		ServerTickEvents.END_SERVER_TICK.register(ServerSmokeTest::tick);
	}

	private static void start(MinecraftServer server) {
		int dims = 0;
		for (ServerLevel level : server.getAllLevels()) {
			Identifier id = level.dimension().identifier();
			if (!id.getNamespace().equals(PortalGunMod.MOD_ID)) {
				continue;
			}
			dims++;
			ContentSpec.DimensionInfo info = Destinations.info(id);
			long t0 = System.nanoTime();
			int chunks = 0;
			try {
				for (int[] c : new int[][] {{0, 0}, {2000, 0}, {-3000, 1500}, {700, -4100}}) {
					for (int dx = -2; dx <= 2; dx++) {
						for (int dz = -2; dz <= 2; dz++) {
							level.getChunk((c[0] >> 4) + dx, (c[1] >> 4) + dz);
							chunks++;
						}
					}
				}
			} catch (RuntimeException e) {
				PortalGunMod.LOGGER.error("[smoketest] {}: chunk generation FAILED", id, e);
				continue;
			}
			long genMs = (System.nanoTime() - t0) / 1_000_000L;
			int arrivalY = info != null ? info.arrivalY : 80;
			SafeSpotFinder.Spot spot = SafeSpotFinder.find(level, new Vec3(0.5, arrivalY, 0.5));
			int spawned = 0;
			if (info != null) {
				for (String cid : info.creatures) {
					EntityType<?> type = ModCreatures.TYPES.get(cid);
					if (type == null) {
						PortalGunMod.LOGGER.error("[smoketest] {}: creature {} is not registered", id, cid);
						continue;
					}
					Entity e = type.create(level, EntitySpawnReason.COMMAND);
					if (e == null) {
						PortalGunMod.LOGGER.error("[smoketest] {}: creature {} could not be created", id, cid);
						continue;
					}
					Vec3 p = spot.pos().add((spawned % 5) * 2 - 4, 0, (spawned / 5) * 2 - 4);
					e.snapTo(p.x, p.y, p.z, 0, 0);
					level.addFreshEntity(e);
					SPAWNED.add(e);
					spawned++;
				}
			}
			PortalGunMod.LOGGER.info("[smoketest] {}: {} chunks in {} ms, arrival {} {} (platform={}), biome at arrival {}, {} creatures spawned",
				id, chunks, genMs, info != null ? info.arrival : "?", BlockPos.containing(spot.pos()).toShortString(), spot.builtPlatform(),
				level.getBiome(BlockPos.containing(spot.pos())).unwrapKey().map(k -> k.identifier().toString()).orElse("?"), spawned);
		}
		PortalGunMod.LOGGER.info("[smoketest] generated {} portal gun dimensions; ticking {} ticks", dims, TICKS);
		ticks = 0;
	}

	private static void tick(MinecraftServer server) {
		if (ticks < 0) {
			return;
		}
		if (++ticks < TICKS) {
			return;
		}
		ticks = -1;
		int alive = 0;
		for (Entity e : SPAWNED) {
			if (e.isAlive()) {
				alive++;
			} else {
				PortalGunMod.LOGGER.info("[smoketest] {} is gone after {} ticks ({})", e.getType().getDescriptionId(), TICKS, e.getRemovalReason());
			}
		}
		PortalGunMod.LOGGER.info("[smoketest] DONE: {}/{} spawned creatures alive after {} ticks", alive, SPAWNED.size(), TICKS);
		server.halt(false);
	}
}
