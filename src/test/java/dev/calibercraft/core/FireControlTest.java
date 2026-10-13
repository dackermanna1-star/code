package dev.calibercraft.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class FireControlTest {
	private static final double INTERVAL = 60e9 / 600; // 600 rpm = 100 ms

	@Test
	void sustainedRateNeverExceedsRpm() {
		FireRateLimiter l = new FireRateLimiter();
		long t = 0;
		int accepted = 0;
		// A cheating client tries to fire every 10 ms for 10 seconds.
		for (int i = 0; i < 1000; i++) {
			if (l.tryAcquire(t, INTERVAL, 3)) {
				accepted++;
			}
			t += 10_000_000L;
		}
		assertTrue(accepted <= 100 + 3, "at most 10 s * 10 shots/s + burst allowance, got " + accepted);
		assertTrue(accepted >= 99);
	}

	@Test
	void jitteredButLegalTrafficIsAccepted() {
		FireRateLimiter l = new FireRateLimiter();
		long t = 0;
		for (int i = 0; i < 200; i++) {
			// Packets arrive in pairs (network bunching) but average exactly the cyclic rate.
			t += (i % 2 == 0) ? 190_000_000L : 10_000_000L;
			assertTrue(l.tryAcquire(t, INTERVAL, 3), "shot " + i);
		}
	}

	@Test
	void triggerGateEnforcesFireModes() {
		TriggerGate g = new TriggerGate();
		assertTrue(g.accept(FireMode.SEMI, 1, 3));
		assertFalse(g.accept(FireMode.SEMI, 1, 3), "second semi-auto shot needs a new trigger pull");
		assertTrue(g.accept(FireMode.SEMI, 2, 3));
		int burst = 0;
		for (int i = 0; i < 10; i++) {
			if (g.accept(FireMode.BURST, 3, 3)) {
				burst++;
			}
		}
		assertEquals(3, burst);
		for (int i = 0; i < 50; i++) {
			assertTrue(g.accept(FireMode.AUTO, 4, 3));
		}
	}

	@Test
	void heatAccumulatesLocksAndDecaysLazily() {
		GunState s = GunState.EMPTY;
		long t = 0;
		// LMG at 720 rpm (0.6 shots per tick): about 91 continuous shots overheat it.
		int shots = 0;
		double clock = 0;
		while (!s.overheated() && shots < 1000) {
			s = HeatModel.afterShot(s, t, 0.011, 0.012);
			shots++;
			clock += 1 / 0.6;
			t = (long) clock;
		}
		assertTrue(shots > 80 && shots < 100, "overheats near the end of a 100-round box, took " + shots);
		assertTrue(s.overheated());
		assertTrue(HeatModel.locked(s, t, 0.012));
		assertFalse(HeatModel.locked(s, t + 200, 0.012), "cools down without any ticking");
		assertEquals(0f, HeatModel.current(s, t + 1000, 0.012));
	}
}
