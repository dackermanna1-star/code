package com.extremesports.sport;

import java.util.Map;

/**
 * Effective 0-10 stats for a configured piece of equipment plus the handling multipliers derived from them.
 */
public record EquipmentStats(int speed, int acceleration, int stability, int steering, int tricks) {
	public static EquipmentStats compute(EquipmentKind kind, EquipmentConfig config) {
		int[] stats = new int[5];
		for (int i = 0; i < 5; i++) {
			stats[i] = kind.baseStat(i);
		}
		for (Map.Entry<String, PartCatalog.Slot> entry : PartCatalog.slots(kind.sport()).entrySet()) {
			PartCatalog.Option option = entry.getValue().option(config.part(kind.sport(), entry.getKey()));
			for (int i = 0; i < 5; i++) {
				stats[i] += option.statDelta()[i];
			}
		}
		for (int i = 0; i < 5; i++) {
			stats[i] = Math.max(1, Math.min(10, stats[i]));
		}
		return new EquipmentStats(stats[0], stats[1], stats[2], stats[3], stats[4]);
	}

	public int get(int index) {
		return switch (index) {
			case 0 -> speed;
			case 1 -> acceleration;
			case 2 -> stability;
			case 3 -> steering;
			default -> tricks;
		};
	}

	public float speedMultiplier() {
		return 1.0F + (speed - 5) * 0.04F;
	}

	public float accelMultiplier() {
		return 1.0F + (acceleration - 5) * 0.06F;
	}

	/** Landing tolerance multiplier; also shrinks balance drift. */
	public float stabilityMultiplier() {
		return 1.0F + (stability - 5) * 0.06F;
	}

	public float steeringMultiplier() {
		return 1.0F + (steering - 5) * 0.07F;
	}

	/** Trick animation speed and spin speed multiplier. */
	public float trickMultiplier() {
		return 1.0F + (tricks - 5) * 0.05F;
	}
}
