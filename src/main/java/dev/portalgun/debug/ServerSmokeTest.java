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
 * {@code -Dportalgun.smoketest=true}. After the server starts it visits one portal gun dimension every
 * {@value #GAP} ticks (so generated chunks can unload in between): generates chunks around the origin and far away,
 * probes arrival spots, spawns every spec creature of the dimension at the arrival point (chunks force-loaded); once
 * all dimensions are done the world ticks {@value #TICKS} more ticks, a summary is logged and the server stops.
 * Inert unless the property is set.
 */
public final class ServerSmokeTest {
	private static final int TICKS = 200;
	private static final int GAP = 40;
	private static final List<Entity> SPAWNED = new ArrayList<>();
	private static final java.util.ArrayDeque<ServerLevel> QUEUE = new java.util.ArrayDeque<>();
	private static int dims;
	private static int ticks = -1;
	private static int wait = -1;

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
		for (ServerLevel level : server.getAllLevels()) {
			if (level.dimension().identifier().getNamespace().equals(PortalGunMod.MOD_ID)) {
				QUEUE.add(level);
			}
		}
		dims = QUEUE.size();
		wait = 0;
	}

	private static void visit(ServerLevel level) {
		Identifier id = level.dimension().identifier();
		{
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
				return;
			}
			long genMs = (System.nanoTime() - t0) / 1_000_000L;
			int arrivalY = info != null ? info.arrivalY : 80;
			SafeSpotFinder.Spot spot = SafeSpotFinder.find(level, new Vec3(0.5, arrivalY, 0.5));
			// arrival quality at a few more places: y / sky light / block underfoot (platform marked with P)
			StringBuilder probes = new StringBuilder();
			int dark = 0;
			for (int k = 1; k <= 8; k++) {
				SafeSpotFinder.Spot sp = SafeSpotFinder.find(level, new Vec3(k * 613.5, arrivalY, -k * 389.5));
				BlockPos f = BlockPos.containing(sp.pos());
				int sky = level.getBrightness(net.minecraft.world.level.LightLayer.SKY, f);
				if (sky < 7 && !"cave".equals(info != null ? info.arrival : "")) {
					dark++;
				}
				probes.append(' ').append(f.getY()).append('/').append(sky).append(sp.builtPlatform() ? "P" : "")
					.append('/').append(net.minecraft.core.registries.BuiltInRegistries.BLOCK.getKey(level.getBlockState(f.below()).getBlock()).getPath());
			}
			PortalGunMod.LOGGER.info("[smoketest] {}: arrival probes (y/sky/floor):{}{}", id, probes, dark > 0 ? "  <-- " + dark + " DARK" : "");
			int spawned = 0;
			// keep the arrival area loaded and entity-ticking although no player is around
			int scx = BlockPos.containing(spot.pos()).getX() >> 4;
			int scz = BlockPos.containing(spot.pos()).getZ() >> 4;
			for (int dx = -1; dx <= 1; dx++) {
				for (int dz = -1; dz <= 1; dz++) {
					level.setChunkForced(scx + dx, scz + dz, true);
				}
			}
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
			BlockPos feet = BlockPos.containing(spot.pos());
			PortalGunMod.LOGGER.info("[smoketest] {}: {} chunks in {} ms, arrival {} {} (platform={}, sky light {}, standing on {}), biome at arrival {}, {} creatures spawned",
				id, chunks, genMs, info != null ? info.arrival : "?", feet.toShortString(), spot.builtPlatform(),
				level.getBrightness(net.minecraft.world.level.LightLayer.SKY, feet),
				net.minecraft.core.registries.BuiltInRegistries.BLOCK.getKey(level.getBlockState(feet.below()).getBlock()),
				level.getBiome(BlockPos.containing(spot.pos())).unwrapKey().map(k -> k.identifier().toString()).orElse("?"), spawned);
		}
	}

	private static void tick(MinecraftServer server) {
		if (wait >= 0 && ++wait >= GAP) {
			wait = 0;
			ServerLevel next = QUEUE.poll();
			if (next != null) {
				visit(next);
			}
			if (QUEUE.isEmpty()) {
				wait = -1;
				PortalGunMod.LOGGER.info("[smoketest] visited {} portal gun dimensions; ticking {} ticks", dims, TICKS);
				ticks = 0;
			}
			return;
		}
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
				Vec3 home = e.position();
				PortalGunMod.LOGGER.info("[smoketest] {} alive at {} hp {}/{}", e.getType().getDescriptionId(),
					BlockPos.containing(home).toShortString(), e instanceof net.minecraft.world.entity.LivingEntity l ? l.getHealth() : 0,
					e instanceof net.minecraft.world.entity.LivingEntity l2 ? l2.getMaxHealth() : 0);
			} else {
				PortalGunMod.LOGGER.info("[smoketest] {} is gone after {} ticks ({})", e.getType().getDescriptionId(), TICKS, e.getRemovalReason());
			}
		}
		PortalGunMod.LOGGER.info("[smoketest] DONE: {}/{} spawned creatures alive after {} ticks", alive, SPAWNED.size(), TICKS);
		server.halt(false);
	}
}
