package net.abyssaldescent.dungeon.run;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import net.minecraft.core.Holder;
import net.minecraft.core.UUIDUtil;
import net.minecraft.world.effect.MobEffect;

/** One expedition: a party, the slot its floors are generated in, and its progress. */
public final class DungeonRun {
	public static final Codec<DungeonRun> CODEC = RecordCodecBuilder.create(i -> i.group(
		Codec.INT.fieldOf("slot").forGetter(r -> r.slot),
		Codec.INT.fieldOf("start_floor").forGetter(r -> r.startFloor),
		UUIDUtil.CODEC.listOf().fieldOf("members").forGetter(r -> List.copyOf(r.members)),
		UUIDUtil.CODEC.listOf().fieldOf("active").forGetter(r -> List.copyOf(r.active)),
		Codec.unboundedMap(UUIDUtil.STRING_CODEC, ReturnPoint.CODEC).optionalFieldOf("returns", Map.of()).forGetter(r -> Map.copyOf(r.returns)),
		FloorState.CODEC.fieldOf("floor_state").forGetter(r -> r.floorState),
		Codec.LONG.optionalFieldOf("started", 0L).forGetter(r -> r.startedAt),
		Codec.unboundedMap(UUIDUtil.STRING_CODEC, MobEffect.CODEC.listOf()).optionalFieldOf("curses", Map.of()).forGetter(DungeonRun::encodeCurses)
	).apply(i, DungeonRun::new));

	public final int slot;
	public final int startFloor;
	/** Everyone who set out. */
	public final List<UUID> members = new ArrayList<>();
	/** Members still in the dungeon (not defeated or extracted). */
	public final Set<UUID> active = new LinkedHashSet<>();
	public final Map<UUID, ReturnPoint> returns = new HashMap<>();
	public FloorState floorState;
	public final long startedAt;
	/**
	 * Curses each member accepted at a Cursed Idol. They last until that member leaves the expedition, so they are put
	 * back if anything (milk, a totem) clears them.
	 */
	public final Map<UUID, Set<Holder<MobEffect>>> curses = new HashMap<>();

	public DungeonRun(int slot, int startFloor, List<UUID> members, long startedAt) {
		this.slot = slot;
		this.startFloor = startFloor;
		this.members.addAll(members);
		this.active.addAll(members);
		this.floorState = new FloorState(startFloor);
		this.startedAt = startedAt;
	}

	private DungeonRun(int slot, int startFloor, List<UUID> members, List<UUID> active, Map<UUID, ReturnPoint> returns, FloorState floorState,
		long startedAt, Map<UUID, List<Holder<MobEffect>>> curses) {
		this.slot = slot;
		this.startFloor = startFloor;
		this.members.addAll(members);
		this.active.addAll(active);
		this.returns.putAll(returns);
		this.floorState = floorState;
		this.startedAt = startedAt;
		curses.forEach((player, list) -> this.curses.put(player, new LinkedHashSet<>(list)));
	}

	private Map<UUID, List<Holder<MobEffect>>> encodeCurses() {
		Map<UUID, List<Holder<MobEffect>>> map = new HashMap<>();
		curses.forEach((player, set) -> map.put(player, List.copyOf(set)));
		return map;
	}

	public int floor() {
		return floorState.floor;
	}

	/** Run ids double as the unsecured-loot tag value. */
	public long id() {
		return slot;
	}
}
