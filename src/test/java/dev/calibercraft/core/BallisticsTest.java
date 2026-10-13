package dev.calibercraft.core;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class BallisticsTest {
	@Test
	void pelletsAreDeterministicPerSeed() {
		double[] dir = Ballistics.direction(30, -10);
		long seed = Ballistics.shotSeed(1234L, 7);
		assertArrayEquals(Ballistics.pelletDirections(seed, dir, 4, 9), Ballistics.pelletDirections(seed, dir, 4, 9));
		assertNotEquals(Ballistics.pelletDirections(seed, dir, 4, 9)[0],
			Ballistics.pelletDirections(Ballistics.shotSeed(1234L, 8), dir, 4, 9)[0]);
	}

	@Test
	void pelletsStayInsideTheCone() {
		double[] dir = Ballistics.direction(-75, 40);
		double spread = 3.0;
		double[] p = Ballistics.pelletDirections(99L, dir, spread, 500);
		for (int i = 0; i < 500; i++) {
			double dot = p[i * 3] * dir[0] + p[i * 3 + 1] * dir[1] + p[i * 3 + 2] * dir[2];
			double angle = Math.toDegrees(Math.acos(Math.min(1, dot)));
			assertTrue(angle <= spread + 1e-6, "pellet outside cone: " + angle);
			double len = Math.sqrt(p[i * 3] * p[i * 3] + p[i * 3 + 1] * p[i * 3 + 1] + p[i * 3 + 2] * p[i * 3 + 2]);
			assertEquals(1.0, len, 1e-9);
		}
	}

	@Test
	void zeroSpreadIsExact() {
		double[] dir = Ballistics.direction(0, 0);
		double[] p = Ballistics.pelletDirections(5L, dir, 0, 1);
		assertArrayEquals(dir, p, 1e-12);
		assertEquals(0, dir[0], 1e-12);
		assertEquals(1, dir[2], 1e-12, "yaw 0 looks toward +Z like Minecraft");
	}

	@Test
	void falloffInterpolatesToMinimum() {
		assertEquals(1.0, Ballistics.falloff(10, 20, 100, 0.5));
		assertEquals(0.75, Ballistics.falloff(60, 20, 100, 0.5), 1e-9);
		assertEquals(0.5, Ballistics.falloff(500, 20, 100, 0.5));
	}

	@Test
	void armourFormulaMatchesVanillaWithoutPenetration() {
		// Vanilla: diamond armour (20 armour, 8 toughness) vs 10 damage.
		double f = 2.0 + 8 / 4.0;
		double expected = 10 * (1 - Math.max(20 * 0.2, Math.min(20, 20 - 10 / f)) / 25);
		assertEquals(expected, Ballistics.afterArmor(10, 20, 8, 0), 1e-9);
		assertTrue(Ballistics.afterArmor(10, 20, 8, 0.5) > expected, "penetration lets more damage through");
		assertEquals(10, Ballistics.afterArmor(10, 20, 8, 1.0), 1e-9);
	}

	@Test
	void spreadModel() {
		assertEquals(3.0, Ballistics.spread(3, 0.5, 0, 1.5, false, 0), 1e-9);
		assertEquals(0.5, Ballistics.spread(3, 0.5, 1, 1.5, false, 0), 1e-9);
		assertEquals(0.75 + 0.2, Ballistics.spread(3, 0.5, 1, 1.5, true, 0.2), 1e-9);
	}
}
