package dev.calibercraft.core;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class WeaponStatsTest {
	private static final StatBlock BASE = new StatBlock(Map.of(Stat.DAMAGE, 6.0, Stat.MAGAZINE, 30.0, Stat.RECOIL_VERTICAL, 2.0,
		Stat.ADS_TIME, 6.0));

	@Test
	void addsThenMultiplies() {
		WeaponStats s = WeaponStats.compute(BASE, List.of(StatModifier.mul(Stat.DAMAGE, 1.5), StatModifier.add(Stat.DAMAGE, 2)));
		assertEquals((6 + 2) * 1.5, s.get(Stat.DAMAGE), 1e-9);
	}

	@Test
	void multipliersStackMultiplicatively() {
		WeaponStats s = WeaponStats.compute(BASE, List.of(StatModifier.mul(Stat.RECOIL_VERTICAL, 0.8), StatModifier.mul(Stat.RECOIL_VERTICAL, 0.9)));
		assertEquals(2.0 * 0.8 * 0.9, s.get(Stat.RECOIL_VERTICAL), 1e-9);
	}

	@Test
	void integerStatsRoundAndEverythingClamps() {
		WeaponStats s = WeaponStats.compute(BASE, List.of(StatModifier.mul(Stat.MAGAZINE, 1.5), StatModifier.add(Stat.ADS_TIME, -100),
			StatModifier.mul(Stat.PELLETS, 0)));
		assertEquals(45, s.i(Stat.MAGAZINE));
		assertEquals(Stat.ADS_TIME.min, s.get(Stat.ADS_TIME), "cannot go below the minimum");
		assertEquals(1, s.i(Stat.PELLETS), "slug conversion: 0 pellets clamps to 1");
	}

	@Test
	void missingStatsUseDefaultsAndNaNIsSafe() {
		WeaponStats s = WeaponStats.compute(StatBlock.EMPTY, List.of(StatModifier.mul(Stat.ZOOM, Double.NaN)));
		assertEquals(Stat.RPM.defaultValue, s.get(Stat.RPM));
		assertEquals(Stat.ZOOM.defaultValue, s.get(Stat.ZOOM));
	}

	@Test
	void configOverridesReplaceBaseValues() {
		StatBlock b = BASE.with(Map.of(Stat.DAMAGE, 9.0));
		assertEquals(9.0, b.get(Stat.DAMAGE));
		assertEquals(30, b.get(Stat.MAGAZINE));
	}
}
