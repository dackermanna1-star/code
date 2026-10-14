package net.abyssaldescent.dungeon.run;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import net.minecraft.core.UUIDUtil;
import org.jetbrains.annotations.Nullable;

/** Mutable state of the floor a run is currently on. Replaced when the party descends. */
public final class FloorState {
	public static final Codec<FloorState> CODEC = RecordCodecBuilder.create(i -> i.group(
		Codec.INT.fieldOf("floor").forGetter(s -> s.floor),
		Codec.unboundedMap(Codec.STRING, Codec.STRING).optionalFieldOf("rooms", Map.of()).forGetter(FloorState::encodeRooms),
		Codec.BOOL.optionalFieldOf("merchant", false).forGetter(s -> s.merchantSpawned),
		Codec.BOOL.optionalFieldOf("boss_started", false).forGetter(s -> s.bossStarted),
		Codec.BOOL.optionalFieldOf("boss_defeated", false).forGetter(s -> s.bossDefeated),
		Codec.BOOL.optionalFieldOf("reward_spawned", false).forGetter(s -> s.rewardSpawned),
		Codec.LONG.listOf().optionalFieldOf("used_shrines", List.of()).forGetter(s -> List.copyOf(s.usedShrines)),
		UUIDUtil.CODEC.listOf().optionalFieldOf("entities", List.of()).forGetter(s -> List.copyOf(s.floorEntities)),
		Codec.LONG.listOf().optionalFieldOf("seals", List.of()).forGetter(s -> List.copyOf(s.sealedBlocks)),
		Codec.LONG.listOf().optionalFieldOf("boss_seals", List.of()).forGetter(s -> List.copyOf(s.bossSeals)),
		UUIDUtil.CODEC.optionalFieldOf("boss").forGetter(s -> java.util.Optional.ofNullable(s.bossEntity)),
		Codec.LONG.optionalFieldOf("active_trial").forGetter(s -> java.util.Optional.ofNullable(s.activeTrial))
	).apply(i, FloorState::new));

	public final int floor;
	private final Map<Integer, RoomPhase> rooms = new HashMap<>();
	public boolean merchantSpawned;
	public boolean bossStarted;
	public boolean bossDefeated;
	public boolean rewardSpawned;
	public final Set<Long> usedShrines = new HashSet<>();
	/** Merchant, boss and other floor-bound entities that are discarded when the floor is left. */
	public final List<UUID> floorEntities = new ArrayList<>();
	/** Seal blocks of the room encounter currently placed (so they can be removed even after a restart). */
	public final List<Long> sealedBlocks = new ArrayList<>();
	/** Seal blocks of the boss arena, kept apart from the rooms' so that ending one fight never opens the other. */
	public final List<Long> bossSeals = new ArrayList<>();
	/** Ticks the started boss fight has had nobody in its arena (transient). */
	public int bossVacantTicks;
	/** Live encounter; not persisted (an interrupted encounter is reset on load). */
	@Nullable
	public Encounter encounter;
	/** Ticks left on the descent countdown (transient). */
	public int descentCountdown;
	@Nullable
	public UUID bossEntity;
	/**
	 * Altar whose trial is under way. Persisted, unlike the encounter, so a trial interrupted by a restart can be undone
	 * (its altar made usable again) instead of leaving the altar spent.
	 */
	@Nullable
	public Long activeTrial;

	public FloorState(int floor) {
		this.floor = floor;
	}

	private FloorState(int floor, Map<String, String> rooms, boolean merchant, boolean bossStarted, boolean bossDefeated, boolean rewardSpawned,
		List<Long> shrines, List<UUID> entities, List<Long> seals, List<Long> bossSeals, java.util.Optional<UUID> boss,
		java.util.Optional<Long> activeTrial) {
		this.floor = floor;
		rooms.forEach((k, v) -> {
			try {
				RoomPhase phase = RoomPhase.valueOf(v);
				// An encounter interrupted by a restart starts over.
				this.rooms.put(Integer.parseInt(k), phase == RoomPhase.ACTIVE ? RoomPhase.UNVISITED : phase);
			} catch (IllegalArgumentException ignored) {
			}
		});
		this.merchantSpawned = merchant;
		this.bossStarted = bossStarted && bossDefeated;
		this.bossDefeated = bossDefeated;
		this.rewardSpawned = rewardSpawned;
		this.usedShrines.addAll(shrines);
		this.floorEntities.addAll(entities);
		this.sealedBlocks.addAll(seals);
		this.bossSeals.addAll(bossSeals);
		this.bossEntity = boss.orElse(null);
		this.activeTrial = activeTrial.orElse(null);
	}

	private Map<String, String> encodeRooms() {
		Map<String, String> map = new HashMap<>();
		rooms.forEach((k, v) -> map.put(Integer.toString(k), v.name()));
		return map;
	}

	public RoomPhase phase(int room) {
		return rooms.getOrDefault(room, RoomPhase.UNVISITED);
	}

	public void setPhase(int room, RoomPhase phase) {
		rooms.put(room, phase);
	}

	public int clearedCount() {
		int n = 0;
		for (RoomPhase phase : rooms.values()) {
			if (phase == RoomPhase.CLEARED) {
				n++;
			}
		}
		return n;
	}
}
