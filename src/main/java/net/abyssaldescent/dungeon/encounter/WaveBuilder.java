package net.abyssaldescent.dungeon.encounter;

import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import net.abyssaldescent.config.AdConfig;
import net.abyssaldescent.dungeon.zone.Zone;
import net.abyssaldescent.entity.EliteAffix;
import net.minecraft.util.RandomSource;
import org.jetbrains.annotations.Nullable;

/**
 * Turns a threat budget into a wave. Waves always open with a frontline, then alternate roles so ranged enemies are
 * protected; deeper floors unlock tougher archetypes and more elites rather than simply inflating numbers.
 */
public final class WaveBuilder {
	public record Spawn(EnemyKind kind, @Nullable EliteAffix affix) {
	}

	private WaveBuilder() {
	}

	public static int waveCount(int floor, boolean eliteRoom, boolean trial) {
		int local = Zone.forFloor(floor).localFloor(floor);
		int base = floor <= 1 ? 1 : local <= 2 ? 2 : 2 + (local >= 4 ? 1 : 0);
		if (eliteRoom || trial) {
			base = Math.max(2, base);
		}
		return Math.min(3, base + (Zone.forFloor(floor).ordinal() >= 2 ? 1 : 0));
	}

	public static double eliteChance(int floor) {
		AdConfig.Difficulty d = AdConfig.get().difficulty;
		return Math.min(0.6, d.eliteChanceBase + d.eliteChancePerFloor * (floor - 1));
	}

	public static List<Spawn> build(int floor, int partySize, int wave, boolean eliteRoom, boolean trial, RandomSource random) {
		AdConfig.Difficulty d = AdConfig.get().difficulty;
		double budget = (4.5 + floor * 1.5) * (1.0 + Math.max(0, partySize - 1) * d.partyBudgetScaling) * d.budgetMultiplier;
		if (wave > 0) {
			budget *= 0.85;
		}
		if (trial) {
			budget *= 1.25;
		}
		List<EnemyKind> pool = new ArrayList<>();
		for (EnemyKind kind : EnemyKind.values()) {
			if (kind.availableOn(floor)) {
				pool.add(kind);
			}
		}
		List<Spawn> spawns = new ArrayList<>();
		if (pool.isEmpty()) {
			return spawns;
		}
		Map<EnemyKind, Integer> counts = new EnumMap<>(EnemyKind.class);
		boolean forceElite = eliteRoom && wave == 0 || trial && wave == 0;
		EnemyKind.Role[] rhythm = {EnemyKind.Role.FRONTLINE, EnemyKind.Role.BACKLINE, EnemyKind.Role.SKIRMISHER, EnemyKind.Role.FRONTLINE,
			EnemyKind.Role.HEAVY, EnemyKind.Role.BACKLINE};
		int step = 0;
		int guard = 0;
		while (guard++ < 40) {
			EnemyKind.Role wanted = rhythm[step % rhythm.length];
			step++;
			EnemyKind kind = pick(pool, wanted, counts, budget, random);
			if (kind == null) {
				kind = pick(pool, null, counts, budget, random);
			}
			if (kind == null) {
				break;
			}
			EliteAffix affix = null;
			double cost = kind.cost();
			if (forceElite || random.nextDouble() < eliteChance(floor)) {
				double eliteCost = cost * 2.5;
				if (forceElite || eliteCost <= budget) {
					affix = EliteAffix.values()[random.nextInt(EliteAffix.values().length)];
					cost = eliteCost;
					forceElite = false;
				}
			}
			budget -= cost;
			counts.merge(kind, 1, Integer::sum);
			spawns.add(new Spawn(kind, affix));
			if (budget < 2) {
				break;
			}
		}
		return spawns;
	}

	@Nullable
	private static EnemyKind pick(List<EnemyKind> pool, @Nullable EnemyKind.Role role, Map<EnemyKind, Integer> counts, double budget,
		RandomSource random) {
		int total = 0;
		List<EnemyKind> options = new ArrayList<>();
		for (EnemyKind kind : pool) {
			if (role != null && kind.role() != role || kind.cost() > budget) {
				continue;
			}
			// Diminishing returns stop a wave from being five copies of the same enemy.
			int existing = counts.getOrDefault(kind, 0);
			if (kind.role() == EnemyKind.Role.HEAVY && existing >= 1 || existing >= 4) {
				continue;
			}
			options.add(kind);
			total += Math.max(1, kind.weight() - existing * 2);
		}
		if (options.isEmpty()) {
			return null;
		}
		int roll = random.nextInt(total);
		for (EnemyKind kind : options) {
			roll -= Math.max(1, kind.weight() - counts.getOrDefault(kind, 0) * 2);
			if (roll < 0) {
				return kind;
			}
		}
		return options.get(options.size() - 1);
	}
}
