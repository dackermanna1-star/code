package net.abyssaldescent.dungeon.run;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.TreeSet;

/**
 * Permanent, per-player progression. Checkpoints are the floors a player may start an expedition on (always floor 1,
 * plus the first floor of every zone whose boss they have defeated).
 */
public record PlayerProgress(List<Integer> checkpoints, int selectedStart, int deepestFloor, int bossesSlain, int extractions, int defeats,
	int expeditions, Optional<ReturnPoint> returnPoint) {
	public static final PlayerProgress DEFAULT = new PlayerProgress(List.of(1), 1, 0, 0, 0, 0, 0, Optional.empty());

	public static final Codec<PlayerProgress> CODEC = RecordCodecBuilder.create(i -> i.group(
		Codec.INT.listOf().optionalFieldOf("checkpoints", List.of(1)).forGetter(PlayerProgress::checkpoints),
		Codec.INT.optionalFieldOf("selected_start", 1).forGetter(PlayerProgress::selectedStart),
		Codec.INT.optionalFieldOf("deepest_floor", 0).forGetter(PlayerProgress::deepestFloor),
		Codec.INT.optionalFieldOf("bosses_slain", 0).forGetter(PlayerProgress::bossesSlain),
		Codec.INT.optionalFieldOf("extractions", 0).forGetter(PlayerProgress::extractions),
		Codec.INT.optionalFieldOf("defeats", 0).forGetter(PlayerProgress::defeats),
		Codec.INT.optionalFieldOf("expeditions", 0).forGetter(PlayerProgress::expeditions),
		ReturnPoint.CODEC.optionalFieldOf("return_point").forGetter(PlayerProgress::returnPoint)
	).apply(i, PlayerProgress::new));

	public boolean hasCheckpoint(int floor) {
		return floor == 1 || checkpoints.contains(floor);
	}

	/** Checkpoints that can actually be used right now (their zone is implemented and the maxFloor rule allows them). */
	public List<Integer> usableCheckpoints() {
		TreeSet<Integer> set = new TreeSet<>(checkpoints);
		set.add(1);
		set.removeIf(f -> f > RunManager.deepestReachableFloor());
		return new ArrayList<>(set);
	}

	public PlayerProgress withCheckpoint(int floor) {
		if (hasCheckpoint(floor)) {
			return this;
		}
		List<Integer> list = new ArrayList<>(checkpoints);
		list.add(floor);
		return new PlayerProgress(List.copyOf(list), selectedStart, deepestFloor, bossesSlain, extractions, defeats, expeditions, returnPoint);
	}

	public PlayerProgress withSelectedStart(int floor) {
		return new PlayerProgress(checkpoints, floor, deepestFloor, bossesSlain, extractions, defeats, expeditions, returnPoint);
	}

	public PlayerProgress withDeepest(int floor) {
		return floor <= deepestFloor ? this
			: new PlayerProgress(checkpoints, selectedStart, floor, bossesSlain, extractions, defeats, expeditions, returnPoint);
	}

	public PlayerProgress withBossSlain() {
		return new PlayerProgress(checkpoints, selectedStart, deepestFloor, bossesSlain + 1, extractions, defeats, expeditions, returnPoint);
	}

	public PlayerProgress withExtraction() {
		return new PlayerProgress(checkpoints, selectedStart, deepestFloor, bossesSlain, extractions + 1, defeats, expeditions, returnPoint);
	}

	public PlayerProgress withDefeat() {
		return new PlayerProgress(checkpoints, selectedStart, deepestFloor, bossesSlain, extractions, defeats + 1, expeditions, returnPoint);
	}

	public PlayerProgress withExpedition() {
		return new PlayerProgress(checkpoints, selectedStart, deepestFloor, bossesSlain, extractions, defeats, expeditions + 1, returnPoint);
	}

	public PlayerProgress withReturnPoint(Optional<ReturnPoint> point) {
		return new PlayerProgress(checkpoints, selectedStart, deepestFloor, bossesSlain, extractions, defeats, expeditions, point);
	}
}
