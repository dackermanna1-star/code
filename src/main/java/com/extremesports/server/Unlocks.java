package com.extremesports.server;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.function.Predicate;

/**
 * Cosmetic and part unlocks earned through play. Basic equipment and most parts are always available;
 * these reward skill and variety rather than grinding.
 */
public final class Unlocks {
	public record Unlock(String id, String requirementKey, Object requirementArg, Predicate<PlayerSportData> condition) {
	}

	private static final Map<String, Unlock> ALL = new LinkedHashMap<>();

	private static void add(String id, String requirementKey, Object arg, Predicate<PlayerSportData> condition) {
		ALL.put(id, new Unlock(id, requirementKey, arg, condition));
	}

	private static boolean anyGold(PlayerSportData data) {
		return data.medals.values().stream().anyMatch(medal -> medal >= 3);
	}

	static {
		add("graphic_flames", "unlock.extremesports.req.perfect", 5, d -> d.perfectLandings >= 5);
		add("graphic_lightning", "unlock.extremesports.req.combo", 2500, d -> d.bestCombo >= 2500);
		add("graphic_waves", "unlock.extremesports.req.grind", 10, d -> d.longestGrind >= 10.0F);
		add("graphic_camo", "unlock.extremesports.req.tricks", 100, d -> d.tricksLanded >= 100);
		add("graphic_skull", "unlock.extremesports.req.bails", 25, d -> d.bails >= 25);
		add("graphic_sunset", "unlock.extremesports.req.distance", 2000, d -> d.distance >= 2000.0);
		add("graphic_galaxy", "unlock.extremesports.req.combo", 20000, d -> d.bestCombo >= 20000);
		add("graphic_circuit", "unlock.extremesports.req.medal_silver", "score_attack", d -> d.medal("score_attack") >= 2);
		add("graphic_gold", "unlock.extremesports.req.any_gold", 0, Unlocks::anyGold);
		add("graphic_diamond", "unlock.extremesports.req.triple_gold", 0,
			d -> d.medal("score_attack") >= 3 && d.medal("best_trick") >= 3 && d.medal("grind") >= 3);
		add("sticker_crown", "unlock.extremesports.req.any_gold", 0, Unlocks::anyGold);
		add("sticker_diamond", "unlock.extremesports.req.variety", 25, d -> d.landedTricks.size() >= 25);
		add("effect_sparks", "unlock.extremesports.req.grinds", 10, d -> d.grindsLanded >= 10);
		add("effect_flames", "unlock.extremesports.req.combo", 10000, d -> d.bestCombo >= 10000);
		add("effect_rainbow", "unlock.extremesports.req.medal_gold", "best_trick", d -> d.medal("best_trick") >= 3);
		add("effect_hearts", "unlock.extremesports.req.perfect", 50, d -> d.perfectLandings >= 50);
		add("effect_notes", "unlock.extremesports.req.distance", 5000, d -> d.distance >= 5000.0);
		add("effect_snow", "unlock.extremesports.req.spin", 540, d -> d.biggestSpin >= 540);
		add("effect_ender", "unlock.extremesports.req.spin", 720, d -> d.biggestSpin >= 720);
		add("bearings_ceramic", "unlock.extremesports.req.distance", 1000, d -> d.distance >= 1000.0);
		add("bearings_swiss", "unlock.extremesports.req.medal_gold", "score_attack", d -> d.medal("score_attack") >= 3);
	}

	private Unlocks() {
	}

	public static Map<String, Unlock> all() {
		return ALL;
	}

	public static boolean isUnlocked(PlayerSportData data, String id, boolean creative) {
		if (id == null || creative) {
			return true;
		}
		Unlock unlock = ALL.get(id);
		return unlock == null || data.unlocked.contains(id) || unlock.condition().test(data);
	}

	/** Records newly met unlocks in the data and returns their ids. */
	public static java.util.List<String> refresh(PlayerSportData data) {
		java.util.List<String> fresh = new java.util.ArrayList<>();
		for (Unlock unlock : ALL.values()) {
			if (!data.unlocked.contains(unlock.id()) && unlock.condition().test(data)) {
				data.unlocked.add(unlock.id());
				fresh.add(unlock.id());
			}
		}
		return fresh;
	}
}
