package com.mineception.dream.render;

import com.mineception.dream.LaptopData;
import com.mineception.dream.MiniBlock;
import com.mineception.dream.MiniWorld;
import com.mineception.dream.Theme;
import com.mineception.dream.WorldGen;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

/**
 * The four dream levels of one laptop as a client sees them: generated from the laptop's seed, with the laptop's edits
 * and this client's not yet confirmed edits on top.
 *
 * <p>Published levels are never changed in place: an edit or a sync installs a modified copy instead. A renderer that
 * took a {@link #snapshot()} (e.g. on a background thread) therefore always sees complete, consistent levels, and the
 * raycaster's light fields, which are cached per level object, stay valid for every level whose blocks did not change.
 * A sync keeps the existing object of every level whose blocks come out the same, so confirming a local edit or a
 * change in another level costs no relighting.
 *
 * <p>Not thread-safe: one thread (the client thread) owns it; only snapshots are handed to other threads.
 */
public final class DreamLevels {
	private final MiniWorld[] worlds = new MiniWorld[Theme.DEPTHS];
	private final MiniWorld[] generated = new MiniWorld[Theme.DEPTHS];
	private final List<PendingEdit> pending = new ArrayList<>();
	private boolean built;
	private long seed;

	/** A block change shown locally until the laptop data confirms it, or until {@code expires}. */
	private record PendingEdit(int depth, int index, int block, long expires) {
	}

	/** Whether {@link #sync} has run at least once. */
	public boolean built() {
		return built;
	}

	/** Level 1..4. Never modified once returned: later changes replace the level with a new object. */
	public MiniWorld world(int depth) {
		return worlds[depth - 1];
	}

	/** The current levels, index {@code depth - 1}. Safe to read from any thread, as the levels never change. */
	public MiniWorld[] snapshot() {
		return worlds.clone();
	}

	/** Number of local edits still waiting for confirmation. */
	public int pendingEdits() {
		return pending.size();
	}

	/**
	 * Brings the levels in line with the laptop's data: generated terrain, the data's edits, and the local edits it does
	 * not confirm yet. Levels whose blocks are unchanged keep their objects. Returns true when the seed changed (or on the
	 * first sync), i.e. every level is a new one and avatars should be placed again.
	 */
	public boolean sync(LaptopData data) {
		boolean newSeed = !built || data.seed() != seed;
		if (newSeed) {
			seed = data.seed();
			Arrays.fill(generated, null);
			Arrays.fill(worlds, null);
			pending.clear();
		}
		for (int depth = 1; depth <= Theme.DEPTHS; depth++) {
			if (generated[depth - 1] == null) {
				generated[depth - 1] = WorldGen.generate(seed, depth);
			}
			MiniWorld world = generated[depth - 1].copy();
			data.applyEdits(world);
			applyPending(world, data);
			MiniWorld current = worlds[depth - 1];
			if (current == null || !Arrays.equals(current.rawBlocks(), world.rawBlocks())) {
				worlds[depth - 1] = world;
			}
		}
		built = true;
		return newSeed;
	}

	/** Drops local edits the data confirms and applies the ones still on their way. */
	private void applyPending(MiniWorld world, LaptopData data) {
		Map<Integer, Byte> edits = data.edits(world.depth);
		pending.removeIf(edit -> {
			Byte confirmed = edits.get(edit.index());
			return edit.depth() == world.depth && confirmed != null && (confirmed & 0xFF) == edit.block();
		});
		for (PendingEdit edit : pending) {
			if (edit.depth() == world.depth) {
				world.set(edit.index(), MiniBlock.byId(edit.block()));
			}
		}
	}

	/**
	 * Shows a block change at once (copy-on-write: the level is replaced by a changed copy) and remembers it until the
	 * laptop's data confirms it or {@code expires} passes. The caller has validated the edit.
	 */
	public void editLocally(int depth, int index, MiniBlock block, long expires) {
		if (!built) {
			throw new IllegalStateException("levels not built yet");
		}
		MiniWorld current = worlds[depth - 1];
		if (current.get(index) != block) {
			MiniWorld changed = current.copy();
			changed.set(index, block);
			worlds[depth - 1] = changed;
		}
		pending.add(new PendingEdit(depth, index, block.id, expires));
	}

	/**
	 * Forgets local edits that were not confirmed by {@code now}. Returns true if any were dropped: the caller then
	 * syncs again so the levels show the laptop's data without them.
	 */
	public boolean expire(long now) {
		return pending.removeIf(edit -> edit.expires() <= now);
	}
}
