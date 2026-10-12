package com.chaosunleashed.core;

import com.chaosunleashed.ChaosUnleashed;
import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import it.unimi.dsi.fastutil.longs.LongOpenHashSet;
import it.unimi.dsi.fastutil.longs.LongSet;
import net.minecraft.server.MinecraftServer;
import net.minecraft.world.PersistentState;
import net.minecraft.world.PersistentStateType;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Per-world (per save) persistent state: which events are toggled on for random triggering, the master random
 * switch, the cooldown timestamp, and redstone chunks that still need a refresh after a Solar Flare.
 * <p>
 * Stored in the overworld's data folder ({@code data/chaosunleashed.dat}). Both the {@code /chaos} commands and
 * the Chaos Control Panel read and write this same object, so they always stay in sync.
 */
public final class ChaosWorldData extends PersistentState {
	public static final Codec<ChaosWorldData> CODEC = RecordCodecBuilder.create(instance -> instance.group(
		Codec.unboundedMap(Codec.STRING, Codec.BOOL).optionalFieldOf("enabled", Map.of()).forGetter(data -> data.enabled),
		Codec.BOOL.optionalFieldOf("random_enabled", true).forGetter(data -> data.randomEnabled),
		Codec.LONG.optionalFieldOf("last_event_end", Long.MIN_VALUE).forGetter(data -> data.lastEventEnd),
		Codec.unboundedMap(Codec.STRING, Codec.LONG.listOf()).optionalFieldOf("pending_redstone_refresh", Map.of())
			.forGetter(ChaosWorldData::encodePendingRedstone)
	).apply(instance, ChaosWorldData::new));

	public static final PersistentStateType<ChaosWorldData> TYPE = new PersistentStateType<>(
		ChaosUnleashed.MOD_ID, ChaosWorldData::new, CODEC, null);

	private final Map<String, Boolean> enabled = new HashMap<>();
	private boolean randomEnabled;
	private long lastEventEnd;
	private final Map<String, LongSet> pendingRedstoneRefresh = new HashMap<>();

	/** Fresh world: take defaults from the config. */
	private ChaosWorldData() {
		ChaosConfig config = ChaosConfig.get();
		for (ChaosEventType type : ChaosEventType.values()) {
			this.enabled.put(type.id(), config.event(type).enabledByDefault);
		}
		this.randomEnabled = config.randomEventsEnabledByDefault;
		this.lastEventEnd = Long.MIN_VALUE;
	}

	private ChaosWorldData(Map<String, Boolean> enabled, boolean randomEnabled, long lastEventEnd, Map<String, List<Long>> pending) {
		this.enabled.putAll(enabled);
		this.randomEnabled = randomEnabled;
		this.lastEventEnd = lastEventEnd;
		pending.forEach((dimension, chunks) -> this.pendingRedstoneRefresh.put(dimension, new LongOpenHashSet(chunks)));
	}

	private Map<String, List<Long>> encodePendingRedstone() {
		Map<String, List<Long>> map = new HashMap<>();
		this.pendingRedstoneRefresh.forEach((dimension, chunks) -> {
			if (!chunks.isEmpty()) {
				map.put(dimension, new ArrayList<>(chunks));
			}
		});
		return map;
	}

	public static ChaosWorldData get(MinecraftServer server) {
		return server.getOverworld().getPersistentStateManager().getOrCreate(TYPE);
	}

	public boolean isEnabled(ChaosEventType type) {
		Boolean value = this.enabled.get(type.id());
		return value != null ? value : ChaosConfig.get().event(type).enabledByDefault;
	}

	public void setEnabled(ChaosEventType type, boolean value) {
		this.enabled.put(type.id(), value);
		this.markDirty();
	}

	public boolean isRandomEnabled() {
		return this.randomEnabled;
	}

	public void setRandomEnabled(boolean randomEnabled) {
		this.randomEnabled = randomEnabled;
		this.markDirty();
	}

	public long getLastEventEnd() {
		return this.lastEventEnd;
	}

	public void setLastEventEnd(long lastEventEnd) {
		this.lastEventEnd = lastEventEnd;
		this.markDirty();
	}

	/** Bitmask of enabled events (bit = ordinal), used for network sync. */
	public int enabledMask() {
		int mask = 0;
		for (ChaosEventType type : ChaosEventType.values()) {
			if (this.isEnabled(type)) {
				mask |= 1 << type.ordinal();
			}
		}
		return mask;
	}

	public LongSet pendingRedstone(String dimension) {
		return this.pendingRedstoneRefresh.computeIfAbsent(dimension, d -> new LongOpenHashSet());
	}

	public boolean hasPendingRedstone(String dimension) {
		LongSet set = this.pendingRedstoneRefresh.get(dimension);
		return set != null && !set.isEmpty();
	}
}
