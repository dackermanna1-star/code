package com.extremesports.trick;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Deterministic combo scoring shared by the client (prediction) and the server (authority).
 * Variety is rewarded: the multiplier counts distinct tricks only, and repeated tricks decay both
 * inside a combo and across recent combos, so farming one trick stops paying quickly.
 */
public final class ComboScorer {
	private static final float[] REPEAT_DECAY = {1.0F, 0.7F, 0.45F, 0.25F, 0.1F};
	private static final int HISTORY_SIZE = 40;
	private static final int MAX_MULTIPLIER = 15;

	public record Result(int basePoints, int multiplier, int total, int bestEntryPoints) {
	}

	/** Rolling memory of recently scored trick keys, one per player. */
	public static final class History {
		private final Deque<String> keys = new ArrayDeque<>();

		int count(String key) {
			int count = 0;
			for (String existing : keys) {
				if (existing.equals(key)) {
					count++;
				}
			}
			return count;
		}

		void push(String key) {
			keys.addLast(key);
			while (keys.size() > HISTORY_SIZE) {
				keys.removeFirst();
			}
		}

		public void clear() {
			keys.clear();
		}
	}

	private ComboScorer() {
	}

	/** Keys used for variety tracking for one entry. */
	public static List<String> keys(ComboEntry entry) {
		List<String> keys = new ArrayList<>(entry.tricks());
		if (entry.kind() == ComboEntry.Kind.AIR && entry.spin() >= 180) {
			keys.add("spin:" + entry.spin());
		}
		return keys;
	}

	/** Raw points for one entry before decay and multiplier. */
	public static float rawPoints(ComboEntry entry, String key, int multiple) {
		if (key.startsWith("spin:")) {
			return Tricks.spinPoints(entry.spin()) * entry.quality().multiplier;
		}
		TrickDef def = Tricks.byId(key);
		if (def == null) {
			return 0;
		}
		float points;
		switch (def.category()) {
			case OLLIE -> points = entry.ticks() >= 6 ? def.points() : 0;
			case GRAB -> points = def.points() + def.perUnit() * Math.min(Math.max(0, entry.holdTicks() - 4), 60);
			case GRIND -> {
				float distance = Math.max(0.0F, entry.distance());
				points = def.points() + def.perUnit() * Math.min(distance, 12.0F) + def.perUnit() * 0.4F * Math.max(0.0F, distance - 12.0F);
			}
			case MANUAL -> points = def.points() + def.perUnit() * Math.min(entry.ticks(), 100) + def.perUnit() * 0.3F * Math.max(0, entry.ticks() - 100);
			default -> {
				points = def.points() * (multiple <= 1 ? 1.0F : multiple == 2 ? 1.9F : 2.8F);
				if (entry.fakie() || entry.nollie()) {
					points *= 1.1F;
				}
			}
		}
		if (entry.kind() == ComboEntry.Kind.AIR) {
			points *= entry.quality().multiplier;
		}
		return points;
	}

	/**
	 * Scores a combo. When {@code commit} is true the history is updated (server on accept, client on bank).
	 */
	public static Result score(List<ComboEntry> entries, History history, float presetMultiplier, boolean commit) {
		Map<String, Integer> occurrences = new HashMap<>();
		Set<String> distinct = new LinkedHashSet<>();
		float base = 0.0F;
		float best = 0.0F;
		List<String> committed = new ArrayList<>();
		for (ComboEntry entry : entries) {
			float entryPoints = 0.0F;
			List<String> keys = keys(entry);
			for (int i = 0; i < keys.size(); i++) {
				String key = keys.get(i);
				int multiple = i < entry.multiples().size() ? entry.multiples().get(i) : 1;
				float raw = rawPoints(entry, key, multiple);
				if (raw <= 0.0F) {
					continue;
				}
				int seen = occurrences.getOrDefault(key, 0);
				float decay = REPEAT_DECAY[Math.min(seen, REPEAT_DECAY.length - 1)];
				float historyDecay = Math.max(0.4F, 1.0F - 0.08F * history.count(key));
				entryPoints += raw * decay * historyDecay;
				occurrences.put(key, seen + 1);
				distinct.add(key);
				committed.add(key);
			}
			base += entryPoints;
			best = Math.max(best, entryPoints);
		}
		int multiplier = Math.max(1, Math.min(MAX_MULTIPLIER, distinct.size()));
		int total = Math.round(base * multiplier * presetMultiplier);
		if (commit) {
			committed.forEach(history::push);
		}
		return new Result(Math.round(base), multiplier, total, Math.round(best * presetMultiplier));
	}
}
