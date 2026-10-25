package com.modernapartments.build.placement;

import com.modernapartments.ModConfig;
import com.modernapartments.ModernApartments;
import com.modernapartments.build.BlockBuffer;
import com.modernapartments.build.BuildCache;
import com.modernapartments.build.ComplexType;
import com.modernapartments.build.Orientation;
import com.mojang.serialization.Codec;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import net.fabricmc.fabric.api.attachment.v1.AttachmentRegistry;
import net.fabricmc.fabric.api.attachment.v1.AttachmentType;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.network.chat.Component;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.levelgen.structure.BoundingBox;
import org.jspecify.annotations.Nullable;

/**
 * Runs building placements (one job at a time, spread over ticks), remembers placed buildings per
 * dimension, and supports undo/demolition. Buildings are generated off-thread before placement starts.
 */
public final class PlacementManager {
	public static final AttachmentType<List<PlacedBuilding>> PLACED = AttachmentRegistry.create(
		ModernApartments.id("placed_buildings"),
		builder -> builder.persistent(Codec.list(PlacedBuilding.CODEC)).initializer(List::of));

	private static final Deque<PlacementJob> JOBS = new ArrayDeque<>();
	private static final List<PendingBuild> PENDING = new ArrayList<>();
	private static final Deque<RestoreJob> RESTORES = new ArrayDeque<>();
	private static final Map<UUID, Snapshot> SNAPSHOTS = new LinkedHashMap<>(8, 0.75F, true) {
		@Override
		protected boolean removeEldestEntry(Map.Entry<UUID, Snapshot> eldest) {
			return size() > 6;
		}
	};

	private record PendingBuild(ServerLevel level, ComplexType type, long seed, PlacementTransform transform,
			@Nullable UUID player, CompletableFuture<BlockBuffer> future) {
	}

	private PlacementManager() {
	}

	public static void init() {
		ServerTickEvents.END_SERVER_TICK.register(PlacementManager::tick);
		ServerLifecycleEvents.SERVER_STOPPING.register(server -> {
			JOBS.clear();
			PENDING.clear();
			RESTORES.clear();
			SNAPSHOTS.clear();
		});
	}

	public static boolean isBusy() {
		return !JOBS.isEmpty() || !PENDING.isEmpty() || !RESTORES.isEmpty();
	}

	/**
	 * Transform that puts the centre of the building's front edge at {@code frontCenter} (a ground block)
	 * with the entrance facing {@code front}.
	 */
	public static PlacementTransform transformFor(ComplexType type, BlockPos frontCenter, Direction front) {
		PlacementTransform probe = new PlacementTransform(BlockPos.ZERO, Orientation.rotationFor(front), type.sizeX(), type.sizeY(), type.sizeZ());
		int fx = probe.worldX(type.sizeX() / 2, 0);
		int fz = probe.worldZ(type.sizeX() / 2, 0);
		BlockPos min = new BlockPos(frontCenter.getX() - fx, frontCenter.getY() - type.groundY(), frontCenter.getZ() - fz);
		return new PlacementTransform(min, probe.rotation(), type.sizeX(), type.sizeY(), type.sizeZ());
	}

	/** Validates world height limits; returns an error message or null. */
	public static @Nullable Component checkFits(ServerLevel level, PlacementTransform t) {
		if (t.min().getY() < level.getMinY() + 1) {
			return Component.translatable("message.modernapartments.too_low");
		}
		if (t.min().getY() + t.sizeY() + 2 > level.getMaxY()) {
			return Component.translatable("message.modernapartments.too_high");
		}
		return null;
	}

	public static void start(ServerLevel level, ComplexType type, long seed, PlacementTransform transform, @Nullable ServerPlayer player) {
		CompletableFuture<BlockBuffer> future = CompletableFuture.supplyAsync(() -> BuildCache.get(type, seed));
		PENDING.add(new PendingBuild(level, type, seed, transform, player == null ? null : player.getUUID(), future));
		if (player != null) {
			player.displayClientMessage(Component.translatable("message.modernapartments.build_planning", type.displayName()), true);
		}
	}

	private static void tick(MinecraftServer server) {
		for (int i = PENDING.size() - 1; i >= 0; i--) {
			PendingBuild p = PENDING.get(i);
			if (!p.future.isDone()) {
				continue;
			}
			PENDING.remove(i);
			try {
				BlockBuffer buffer = p.future.join();
				PlacementJob job = new PlacementJob(p.level, buffer, p.type, p.seed, p.transform, p.player);
				job.captureSnapshot();
				JOBS.add(job);
			} catch (Exception e) {
				ModernApartments.LOGGER.error("Failed to generate {}", p.type.id(), e);
				ServerPlayer player = p.player == null ? null : server.getPlayerList().getPlayer(p.player);
				if (player != null) {
					player.displayClientMessage(Component.translatable("message.modernapartments.build_failed"), false);
				}
			}
		}
		long budget = Math.max(5, ModConfig.get().placementMillisPerTick) * 1_000_000L;
		PlacementJob job = JOBS.peek();
		if (job != null && job.tick(budget)) {
			JOBS.poll();
			finish(job);
		}
		RestoreJob restore = RESTORES.peek();
		if (restore != null && restore.tick(budget)) {
			RESTORES.poll();
		}
	}

	private static void finish(PlacementJob job) {
		UUID id = UUID.randomUUID();
		PlacedBuilding record = new PlacedBuilding(id, job.type().id(), job.seed(), job.transform(), job.level().getGameTime());
		List<PlacedBuilding> list = new ArrayList<>(job.level().getAttachedOrCreate(PLACED));
		list.add(record);
		job.level().setAttached(PLACED, List.copyOf(list));
		if (job.snapshot() != null) {
			SNAPSHOTS.put(id, job.snapshot());
		}
		ModernApartments.LOGGER.info("Placed {} at {}", job.type().id(), job.transform().min());
	}

	public static List<PlacedBuilding> placed(ServerLevel level) {
		return level.getAttachedOrCreate(PLACED);
	}

	public static @Nullable PlacedBuilding findAt(ServerLevel level, BlockPos pos) {
		for (PlacedBuilding b : placed(level)) {
			if (b.contains(pos.getX(), pos.getY(), pos.getZ())) {
				return b;
			}
		}
		return null;
	}

	public static @Nullable PlacedBuilding latest(ServerLevel level) {
		List<PlacedBuilding> list = placed(level);
		return list.isEmpty() ? null : list.get(list.size() - 1);
	}

	/** Removes a building: restores the snapshot from this session if available, otherwise leaves a grassy lot. */
	public static void demolish(ServerLevel level, PlacedBuilding building) {
		List<PlacedBuilding> list = new ArrayList<>(placed(level));
		list.removeIf(b -> b.id().equals(building.id()));
		level.setAttached(PLACED, List.copyOf(list));
		Snapshot snap = SNAPSHOTS.remove(building.id());
		RESTORES.add(snap != null ? RestoreJob.restore(level, snap) : RestoreJob.clearLot(level, building.transform(),
			building.complexType().groundY()));
	}

	/** Restores a snapshot or clears a lot over several ticks. */
	static final class RestoreJob {
		private final ServerLevel level;
		private final @Nullable Snapshot snapshot;
		private final BoundingBox box;
		private final int groundY;
		private int index;
		private final int total;

		private RestoreJob(ServerLevel level, @Nullable Snapshot snapshot, BoundingBox box, int groundY) {
			this.level = level;
			this.snapshot = snapshot;
			this.box = box;
			this.groundY = groundY;
			this.total = box.getXSpan() * box.getYSpan() * box.getZSpan();
		}

		static RestoreJob restore(ServerLevel level, Snapshot snapshot) {
			return new RestoreJob(level, snapshot, snapshot.box(), 0);
		}

		static RestoreJob clearLot(ServerLevel level, PlacementTransform t, int groundY) {
			BoundingBox f = t.footprintBox();
			return new RestoreJob(level, null, new BoundingBox(f.minX(), f.minY(), f.minZ(), f.maxX(),
				Math.min(level.getMaxY(), f.maxY() + 2), f.maxZ()), t.worldY(groundY));
		}

		boolean tick(long budgetNanos) {
			long deadline = System.nanoTime() + budgetNanos;
			BlockPos.MutableBlockPos p = new BlockPos.MutableBlockPos();
			int sx = box.getXSpan();
			int sz = box.getZSpan();
			while (index < total && System.nanoTime() < deadline) {
				for (int n = 0; n < 512 && index < total; n++, index++) {
					int x = box.minX() + index % sx;
					int z = box.minZ() + (index / sx) % sz;
					int y = box.minY() + index / (sx * sz);
					BlockState s;
					if (snapshot != null) {
						s = snapshot.stateAt(index);
					} else if (y < groundY) {
						s = Blocks.DIRT.defaultBlockState();
					} else if (y == groundY) {
						s = Blocks.GRASS_BLOCK.defaultBlockState();
					} else {
						s = Blocks.AIR.defaultBlockState();
					}
					p.set(x, y, z);
					if (level.getBlockState(p) != s) {
						if (level.getBlockState(p).hasBlockEntity()) {
							level.setBlock(p, Blocks.AIR.defaultBlockState(), Block.UPDATE_CLIENTS | Block.UPDATE_SKIP_ALL_SIDEEFFECTS);
						}
						level.setBlock(p, s, Block.UPDATE_CLIENTS | Block.UPDATE_SKIP_ALL_SIDEEFFECTS);
					}
				}
			}
			return index >= total;
		}
	}
}
