package com.modernapartments.build.placement;

import com.modernapartments.build.BlockBuffer;
import com.modernapartments.build.ComplexType;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.level.levelgen.structure.BoundingBox;
import org.jspecify.annotations.Nullable;

/**
 * Places a generated building into a loaded world over several ticks (bottom-up, one 16x16x16 region
 * at a time within a per-tick time budget) so even a 50-storey tower never freezes the server.
 */
public final class PlacementJob {
	private record Step(BoundingBox clip, int y0, int y1, boolean terrain) {
	}

	private final ServerLevel level;
	private final BlockBuffer buffer;
	private final ComplexType type;
	private final long seed;
	private final PlacementTransform transform;
	private final @Nullable UUID playerId;
	private final TerrainAdapter adapter;
	private final List<Step> steps = new ArrayList<>();
	private int next;
	private long placedBlocks;
	private int lastReportedPercent = -1;
	private @Nullable Snapshot snapshot;

	public PlacementJob(ServerLevel level, BlockBuffer buffer, ComplexType type, long seed, PlacementTransform transform,
			@Nullable UUID playerId) {
		this.level = level;
		this.buffer = buffer;
		this.type = type;
		this.seed = seed;
		this.transform = transform;
		this.playerId = playerId;
		this.adapter = new TerrainAdapter(level, buffer, transform, level.random);
		BoundingBox full = TerrainAdapter.fullBox(transform);
		int cx0 = full.minX() >> 4;
		int cx1 = full.maxX() >> 4;
		int cz0 = full.minZ() >> 4;
		int cz1 = full.maxZ() >> 4;
		for (int y = 0; y < buffer.sizeY; y += 16) {
			for (int cx = cx0; cx <= cx1; cx++) {
				for (int cz = cz0; cz <= cz1; cz++) {
					BoundingBox clip = new BoundingBox(cx << 4, level.getMinY(), cz << 4, (cx << 4) + 15, level.getMaxY(), (cz << 4) + 15);
					steps.add(new Step(clip, y, y + 16, y == 0));
				}
			}
		}
	}

	public void captureSnapshot() {
		BoundingBox f = transform.footprintBox();
		snapshot = Snapshot.capture(level, new BoundingBox(f.minX(), f.minY(), f.minZ(), f.maxX(),
			Math.min(level.getMaxY(), f.maxY() + TerrainAdapter.CLEAR_ABOVE), f.maxZ()));
	}

	public @Nullable Snapshot snapshot() {
		return snapshot;
	}

	public ServerLevel level() {
		return level;
	}

	public PlacementTransform transform() {
		return transform;
	}

	public ComplexType type() {
		return type;
	}

	public long seed() {
		return seed;
	}

	public boolean isDone() {
		return next >= steps.size();
	}

	/** Works until the time budget is spent; returns true when finished. */
	public boolean tick(long budgetNanos) {
		long deadline = System.nanoTime() + budgetNanos;
		while (next < steps.size() && System.nanoTime() < deadline) {
			Step step = steps.get(next++);
			level.getChunk(step.clip.minX() >> 4, step.clip.minZ() >> 4);
			if (step.terrain) {
				adapter.adaptTerrain(step.clip);
			}
			placedBlocks += adapter.placeBlocks(step.clip, step.y0, step.y1, null);
		}
		report();
		return isDone();
	}

	private void report() {
		ServerPlayer player = playerId == null ? null : level.getServer().getPlayerList().getPlayer(playerId);
		if (player == null) {
			return;
		}
		int percent = steps.isEmpty() ? 100 : (int) (100L * next / steps.size());
		if (percent / 5 != lastReportedPercent / 5 || isDone()) {
			lastReportedPercent = percent;
			player.displayClientMessage(isDone()
				? Component.translatable("message.modernapartments.build_done", type.displayName(), placedBlocks)
				: Component.translatable("message.modernapartments.build_progress", type.displayName(), percent), true);
		}
	}
}
