package com.jjkshowdown.world;

import com.jjkshowdown.JjkShowdown;
import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import it.unimi.dsi.fastutil.longs.Long2ObjectMap;
import it.unimi.dsi.fastutil.longs.Long2ObjectOpenHashMap;
import it.unimi.dsi.fastutil.longs.LongArrayList;
import net.minecraft.core.BlockPos;
import net.minecraft.core.UUIDUtil;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.datafix.DataFixTypes;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.saveddata.SavedData;
import net.minecraft.world.level.saveddata.SavedDataType;
import net.minecraft.world.phys.AABB;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Remembers every block the mod changed so it can be put back: domain arenas (always) and technique destruction
 * (when {@code destruction.restoreTerrain} is on). Persisted with the world, so a crash or server stop in the middle
 * of a domain never leaves barrier blocks behind.
 */
public final class TerrainJournal extends SavedData {
	/** Entries held by an active domain never restore on their own until the domain releases them. */
	public static final long HELD = Long.MAX_VALUE;
	public static final int FLAGS = Block.UPDATE_CLIENTS | Block.UPDATE_SKIP_ALL_SIDEEFFECTS;

	private record Entry(BlockState original, BlockState placed, long restoreAt, Optional<UUID> holder) {
		static final Codec<Entry> CODEC = RecordCodecBuilder.create(i -> i.group(
				BlockState.CODEC.fieldOf("o").forGetter(Entry::original),
				BlockState.CODEC.fieldOf("p").forGetter(Entry::placed),
				Codec.LONG.fieldOf("t").forGetter(Entry::restoreAt),
				UUIDUtil.CODEC.optionalFieldOf("h").forGetter(Entry::holder)
		).apply(i, Entry::new));
	}

	private record Stored(long pos, Entry entry) {
		static final Codec<Stored> CODEC = RecordCodecBuilder.create(i -> i.group(
				Codec.LONG.fieldOf("pos").forGetter(Stored::pos),
				Entry.CODEC.fieldOf("e").forGetter(Stored::entry)
		).apply(i, Stored::new));
	}

	public static final Codec<TerrainJournal> CODEC = Stored.CODEC.listOf().xmap(TerrainJournal::new, TerrainJournal::toList);
	public static final SavedDataType<TerrainJournal> TYPE = new SavedDataType<>(JjkShowdown.MOD_ID + "_terrain_journal",
			TerrainJournal::new, CODEC, DataFixTypes.SAVED_DATA_COMMAND_STORAGE);

	private final Long2ObjectOpenHashMap<Entry> entries = new Long2ObjectOpenHashMap<>();
	private final LongArrayList due = new LongArrayList();
	private int scanTimer;

	public TerrainJournal() {
	}

	private TerrainJournal(List<Stored> stored) {
		for (Stored s : stored) entries.put(s.pos(), s.entry());
	}

	private List<Stored> toList() {
		List<Stored> out = new ArrayList<>(entries.size());
		for (Long2ObjectMap.Entry<Entry> e : entries.long2ObjectEntrySet()) out.add(new Stored(e.getLongKey(), e.getValue()));
		return out;
	}

	public static TerrainJournal get(ServerLevel level) {
		return level.getDataStorage().computeIfAbsent(TYPE);
	}

	public boolean isTracked(BlockPos pos) {
		return entries.containsKey(pos.asLong());
	}

	public int size() {
		return entries.size();
	}

	/**
	 * Change a block and remember the original. If the position is already journaled, the oldest original is kept
	 * (so a domain placed over earlier destruction still restores the real terrain).
	 */
	public boolean replace(ServerLevel level, BlockPos pos, BlockState newState, long restoreAt, UUID holder) {
		BlockState current = level.getBlockState(pos);
		if (current == newState) return false;
		long key = pos.asLong();
		Entry old = entries.get(key);
		BlockState original = old != null ? old.original() : current;
		Optional<UUID> h = holder != null ? Optional.of(holder) : (old != null ? old.holder() : Optional.empty());
		long at = holder != null ? HELD : (old != null && old.holder().isPresent() ? old.restoreAt() : restoreAt);
		if (!level.setBlock(pos, newState, FLAGS)) return false;
		entries.put(key, new Entry(original, newState, at, h));
		setDirty();
		return true;
	}

	/** Change a block permanently without journaling (used when terrain restoration is disabled). */
	public static boolean replacePermanent(ServerLevel level, BlockPos pos, BlockState newState) {
		return level.setBlock(pos, newState, FLAGS);
	}

	/** A domain has ended: its blocks restore after {@code delay} ticks. */
	public void release(ServerLevel level, UUID holder, long delay) {
		long at = level.getGameTime() + delay;
		for (Long2ObjectMap.Entry<Entry> e : entries.long2ObjectEntrySet()) {
			Entry en = e.getValue();
			if (en.holder().isPresent() && en.holder().get().equals(holder)) {
				e.setValue(new Entry(en.original(), en.placed(), at, Optional.empty()));
			}
		}
		setDirty();
	}

	/** Release every hold (e.g. holders that no longer exist after a reload). */
	public void releaseOrphans(ServerLevel level, java.util.function.Predicate<UUID> stillActive) {
		long at = level.getGameTime() + 20;
		boolean changed = false;
		for (Long2ObjectMap.Entry<Entry> e : entries.long2ObjectEntrySet()) {
			Entry en = e.getValue();
			if (en.holder().isPresent() && !stillActive.test(en.holder().get())) {
				e.setValue(new Entry(en.original(), en.placed(), at, Optional.empty()));
				changed = true;
			}
		}
		if (changed) setDirty();
	}

	public void tick(ServerLevel level, int budget) {
		if (entries.isEmpty()) return;
		long now = level.getGameTime();
		if (due.isEmpty() && --scanTimer <= 0) {
			scanTimer = 20;
			for (Long2ObjectMap.Entry<Entry> e : entries.long2ObjectEntrySet()) {
				if (e.getValue().restoreAt() <= now) due.add(e.getLongKey());
			}
			// restore bottom-up so supported blocks (torches, plants) find their support first
			due.sort((a, b) -> Integer.compare(BlockPos.getY(a), BlockPos.getY(b)));
		}
		int done = 0;
		int idx = 0;
		while (idx < due.size() && done < budget) {
			long key = due.getLong(idx++);
			Entry e = entries.get(key);
			if (e == null || e.restoreAt() > now) continue;
			BlockPos pos = BlockPos.of(key);
			if (!level.isLoaded(pos)) {
				continue; // retry when the chunk is loaded again
			}
			if (restoreOne(level, pos, key, e, now)) done++;
		}
		if (idx >= due.size()) {
			due.clear();
		} else {
			due.removeElements(0, idx);
		}
	}

	private boolean restoreOne(ServerLevel level, BlockPos pos, long key, Entry e, long now) {
		BlockState current = level.getBlockState(pos);
		boolean untouched = current == e.placed() || (e.placed().isAir() && (current.isAir() || current.is(net.minecraft.world.level.block.Blocks.FIRE)));
		if (!untouched) {
			entries.remove(key); // a player built something here; respect it
			setDirty();
			return false;
		}
		if (!e.original().getCollisionShape(level, pos).isEmpty()
				&& !level.getEntities((net.minecraft.world.entity.Entity) null, new AABB(pos), en -> en instanceof net.minecraft.world.entity.LivingEntity).isEmpty()) {
			// someone is standing inside: try again shortly instead of suffocating them
			entries.put(key, new Entry(e.original(), e.placed(), now + 40, e.holder()));
			return false;
		}
		level.setBlock(pos, e.original(), FLAGS);
		entries.remove(key);
		setDirty();
		return true;
	}

	/** Immediately restore everything (server stopping or /jjk restore). */
	public int restoreAll(ServerLevel level) {
		LongArrayList keys = new LongArrayList(entries.keySet());
		keys.sort((a, b) -> Integer.compare(BlockPos.getY(a), BlockPos.getY(b)));
		int n = 0;
		for (long key : keys) {
			Entry e = entries.get(key);
			if (e == null) continue;
			BlockPos pos = BlockPos.of(key);
			BlockState current = level.getBlockState(pos);
			boolean untouched = current == e.placed() || (e.placed().isAir() && current.isAir());
			if (untouched) {
				level.setBlock(pos, e.original(), FLAGS);
				n++;
			}
			entries.remove(key);
		}
		due.clear();
		setDirty();
		return n;
	}

	/** Restore only the blocks of one holder right now (domain collapsed and terrain should snap back). */
	public void restoreHolderNow(ServerLevel level, UUID holder) {
		LongArrayList keys = new LongArrayList();
		for (Long2ObjectMap.Entry<Entry> e : entries.long2ObjectEntrySet()) {
			if (e.getValue().holder().isPresent() && e.getValue().holder().get().equals(holder)) keys.add(e.getLongKey());
		}
		keys.sort((a, b) -> Integer.compare(BlockPos.getY(a), BlockPos.getY(b)));
		for (long key : keys) {
			Entry e = entries.get(key);
			BlockPos pos = BlockPos.of(key);
			if (level.getBlockState(pos) == e.placed()) level.setBlock(pos, e.original(), FLAGS);
			entries.remove(key);
		}
		setDirty();
	}
}
