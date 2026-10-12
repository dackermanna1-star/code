package com.chaosunleashed.events.solarflare;

import com.chaosunleashed.core.BlockChangeQueue;
import com.chaosunleashed.core.ChaosEventManager;
import com.chaosunleashed.core.ChaosWorldData;
import com.chaosunleashed.registry.ModBlocks;
import it.unimi.dsi.fastutil.longs.Long2ObjectOpenHashMap;
import it.unimi.dsi.fastutil.longs.LongOpenHashSet;
import it.unimi.dsi.fastutil.longs.LongSet;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerChunkEvents;
import net.minecraft.block.AbstractRedstoneGateBlock;
import net.minecraft.block.Block;
import net.minecraft.block.BlockState;
import net.minecraft.block.RedstoneWireBlock;
import net.minecraft.registry.RegistryKey;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.ChunkPos;
import net.minecraft.util.math.ChunkSectionPos;
import net.minecraft.util.math.Direction;
import net.minecraft.world.BlockView;
import net.minecraft.world.World;
import net.minecraft.world.chunk.ChunkSection;
import net.minecraft.world.chunk.WorldChunk;

import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Solar Flare redstone blackout. While a world is suppressed, every redstone <em>source</em> (levers, buttons,
 * torches, redstone blocks, observers, daylight sensors, plates...) outputs 0. Transmission components (dust,
 * repeaters, comparators) keep working so the Chaos Control Panel's signal can still be wired to alarms/doors.
 * <p>
 * Nothing is permanently changed: suppression only alters the value returned by the power queries
 * ({@code AbstractBlockStateMixin}). At the start and end of the blackout every affected circuit is "refreshed"
 * (neighbor updates around each source) so machines switch off, then back on. Chunks that were unloaded when the
 * flare ended are remembered in the world's saved data and refreshed as soon as they load again.
 */
public final class RedstoneSuppression {
	private static final Set<RegistryKey<World>> SUPPRESSED = ConcurrentHashMap.newKeySet();
	private static volatile boolean anySuppressed;
	/** Positions of sources that actually returned a suppressed value, per world (server thread only). */
	private static final Map<RegistryKey<World>, LongSet> TOUCHED = new HashMap<>();

	private RedstoneSuppression() {
	}

	public static void init() {
		ServerChunkEvents.CHUNK_LOAD.register(RedstoneSuppression::onChunkLoad);
	}

	/** Called from the mixin for every weak/strong power query. Must be fast. */
	public static boolean shouldSuppress(BlockView view, BlockPos pos, BlockState state) {
		if (!anySuppressed || !(view instanceof ServerWorld world) || !SUPPRESSED.contains(world.getRegistryKey())) {
			return false;
		}
		if (isExempt(state)) {
			return false;
		}
		TOUCHED.computeIfAbsent(world.getRegistryKey(), k -> new LongOpenHashSet()).add(pos.asLong());
		return true;
	}

	/** Transmission components and the Chaos Control Panel are never suppressed. */
	public static boolean isExempt(BlockState state) {
		Block block = state.getBlock();
		return block == ModBlocks.CHAOS_CONTROL_PANEL || block instanceof RedstoneWireBlock || block instanceof AbstractRedstoneGateBlock;
	}

	public static boolean isSuppressed(World world) {
		return anySuppressed && SUPPRESSED.contains(world.getRegistryKey());
	}

	public static void begin(ServerWorld world) {
		if (!SUPPRESSED.add(world.getRegistryKey())) {
			return;
		}
		anySuppressed = true;
		refreshAroundPlayers(world);
	}

	public static void end(ServerWorld world) {
		if (!SUPPRESSED.remove(world.getRegistryKey())) {
			return;
		}
		anySuppressed = !SUPPRESSED.isEmpty();
		ChaosEventManager manager = ChaosEventManager.get();
		LongSet touched = TOUCHED.remove(world.getRegistryKey());
		if (manager == null) {
			return;
		}
		// Refresh every source that was suppressed, grouped by chunk; unloaded chunks are refreshed on load.
		LongSet chunks = new LongOpenHashSet();
		Long2ObjectOpenHashMap<LongSet> byChunk = new Long2ObjectOpenHashMap<>();
		if (touched != null) {
			for (long packed : touched) {
				BlockPos pos = BlockPos.fromLong(packed);
				long chunk = ChunkPos.toLong(pos.getX() >> 4, pos.getZ() >> 4);
				byChunk.computeIfAbsent(chunk, c -> new LongOpenHashSet()).add(packed);
			}
		}
		ChaosWorldData data = manager.data();
		String dimension = world.getRegistryKey().getValue().toString();
		for (Long2ObjectOpenHashMap.Entry<LongSet> entry : byChunk.long2ObjectEntrySet()) {
			long chunk = entry.getLongKey();
			ChunkPos chunkPos = new ChunkPos(chunk);
			if (world.isChunkLoaded(chunkPos.x, chunkPos.z)) {
				LongSet positions = entry.getValue();
				manager.blockQueue().enqueueEssential(null, () -> refreshPositions(world, positions));
			} else {
				data.pendingRedstone(dimension).add(chunk);
				data.markDirty();
			}
			chunks.add(chunk);
		}
		refreshAroundPlayers(world);
	}

	/** Server shutdown during a flare: lift suppression; everything that was touched is refreshed on next load. */
	public static void endAllForShutdown() {
		ChaosEventManager manager = ChaosEventManager.get();
		for (RegistryKey<World> key : SUPPRESSED) {
			LongSet touched = TOUCHED.remove(key);
			if (manager != null && touched != null) {
				LongSet pending = manager.data().pendingRedstone(key.getValue().toString());
				for (long packed : touched) {
					BlockPos pos = BlockPos.fromLong(packed);
					pending.add(ChunkPos.toLong(pos.getX() >> 4, pos.getZ() >> 4));
				}
				manager.data().markDirty();
			}
		}
		SUPPRESSED.clear();
		anySuppressed = false;
	}

	private static void refreshAroundPlayers(ServerWorld world) {
		ChaosEventManager manager = ChaosEventManager.get();
		if (manager == null) {
			return;
		}
		int radius = Math.max(2, world.getServer().getPlayerManager().getViewDistance());
		LongSet done = new LongOpenHashSet();
		for (ServerPlayerEntity player : world.getPlayers()) {
			ChunkPos center = player.getChunkPos();
			for (int dx = -radius; dx <= radius; dx++) {
				for (int dz = -radius; dz <= radius; dz++) {
					int cx = center.x + dx;
					int cz = center.z + dz;
					if (done.add(ChunkPos.toLong(cx, cz)) && world.isChunkLoaded(cx, cz)) {
						enqueueChunkRefresh(manager.blockQueue(), world, cx, cz);
					}
				}
			}
		}
	}

	private static void enqueueChunkRefresh(BlockChangeQueue queue, ServerWorld world, int cx, int cz) {
		queue.enqueueEssential(null, () -> refreshChunk(world, cx, cz));
	}

	/** Neighbor-updates every redstone emitter in a chunk. Returns the cost for the block budget. */
	private static int refreshChunk(ServerWorld world, int cx, int cz) {
		if (!world.isChunkLoaded(cx, cz)) {
			return 1;
		}
		WorldChunk chunk = world.getChunk(cx, cz);
		ChunkSection[] sections = chunk.getSectionArray();
		int cost = 1;
		BlockPos.Mutable pos = new BlockPos.Mutable();
		for (int i = 0; i < sections.length; i++) {
			ChunkSection section = sections[i];
			if (section.isEmpty() || !section.hasAny(BlockState::emitsRedstonePower)) {
				continue;
			}
			int baseY = ChunkSectionPos.getBlockCoord(chunk.sectionIndexToCoord(i));
			for (int y = 0; y < 16; y++) {
				for (int z = 0; z < 16; z++) {
					for (int x = 0; x < 16; x++) {
						BlockState state = section.getBlockState(x, y, z);
						if (state.emitsRedstonePower() && !isExempt(state)) {
							pos.set((cx << 4) + x, baseY + y, (cz << 4) + z);
							refreshSource(world, pos.toImmutable(), state.getBlock());
							cost++;
						}
					}
				}
			}
		}
		return cost;
	}

	private static int refreshPositions(ServerWorld world, LongSet positions) {
		int cost = 1;
		for (long packed : positions) {
			BlockPos pos = BlockPos.fromLong(packed);
			if (!world.isChunkLoaded(pos.getX() >> 4, pos.getZ() >> 4)) {
				continue;
			}
			BlockState state = world.getBlockState(pos);
			refreshSource(world, pos, state.getBlock());
			cost++;
		}
		return cost;
	}

	/** Updates the neighbors of a source and of every block next to it (blocks it may be strongly powering). */
	private static void refreshSource(ServerWorld world, BlockPos pos, Block block) {
		world.updateNeighborsAlways(pos, block, null);
		for (Direction direction : Direction.values()) {
			world.updateNeighborsAlways(pos.offset(direction), block, null);
		}
	}

	private static void onChunkLoad(ServerWorld world, WorldChunk chunk) {
		ChaosEventManager manager = ChaosEventManager.get();
		if (manager == null) {
			return;
		}
		ChaosWorldData data = manager.data();
		String dimension = world.getRegistryKey().getValue().toString();
		if (!data.hasPendingRedstone(dimension)) {
			return;
		}
		ChunkPos chunkPos = chunk.getPos();
		if (data.pendingRedstone(dimension).remove(chunkPos.toLong())) {
			data.markDirty();
			enqueueChunkRefresh(manager.blockQueue(), world, chunkPos.x, chunkPos.z);
		}
	}
}
