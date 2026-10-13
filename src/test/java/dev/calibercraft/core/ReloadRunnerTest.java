package dev.calibercraft.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class ReloadRunnerTest {
	private static final Timeline TACTICAL = new Timeline(40, 26, -1, List.of(new Cue(6, "mag_out"), new Cue(25, "mag_in")));
	private static final Timeline EMPTY = new Timeline(50, 26, 40, List.of(new Cue(6, "mag_out"), new Cue(25, "mag_in"), new Cue(39, "bolt_release")));

	/** Simulated weapon used by the listener: magazine of 30, reserve of 100. */
	private static final class Gun implements ReloadRunner.Listener {
		GunState state;
		int reserve = 100;
		final int capacity;
		final List<String> events = new ArrayList<>();

		Gun(GunState s, int capacity) {
			this.state = s;
			this.capacity = capacity;
		}

		@Override
		public void cue(String name) {
			events.add(name);
		}

		@Override
		public void commit() {
			events.add("COMMIT");
			AmmoLogic.Commit c = AmmoLogic.commitMagazine(state, capacity, reserve, Optional.empty());
			reserve -= c.taken();
			state = c.state();
		}

		@Override
		public void chamber() {
			events.add("CHAMBER");
			state = AmmoLogic.cycle(state);
		}

		@Override
		public boolean loadRound() {
			if (reserve <= 0 || state.rounds() >= capacity) {
				return false;
			}
			reserve--;
			state = state.withRounds(state.rounds() + 1);
			events.add("ROUND");
			return true;
		}

		@Override
		public boolean wantsMoreRounds() {
			return reserve > 0 && state.rounds() < capacity;
		}

		@Override
		public boolean needsChamber() {
			return !state.chambered();
		}
	}

	private static void run(ReloadRunner r, Gun g, float ticks) {
		for (int i = 0; i < ticks; i++) {
			r.advance(1, g);
		}
	}

	@Test
	void tacticalReloadCommitsAtCommitTickAndKeepsChamber() {
		Gun g = new Gun(GunState.EMPTY.withRounds(7).withChambered(true), 30);
		ReloadRunner r = ReloadRunner.timeline(ReloadRunner.Kind.TACTICAL, TACTICAL, 1.0);
		run(r, g, 25);
		assertEquals(7, g.state.rounds(), "nothing changes before the commit tick");
		run(r, g, 1);
		assertEquals(30, g.state.rounds());
		assertTrue(g.state.chambered());
		assertEquals(77, g.reserve);
		run(r, g, 20);
		assertTrue(r.done());
		assertEquals(List.of("mag_out", "mag_in", "COMMIT"), g.events);
	}

	@Test
	void cancellingBeforeCommitPreservesAmmunition() {
		Gun g = new Gun(GunState.EMPTY.withRounds(3).withChambered(true), 30);
		ReloadRunner r = ReloadRunner.timeline(ReloadRunner.Kind.TACTICAL, TACTICAL, 1.0);
		run(r, g, 20);
		r.cancel();
		run(r, g, 40);
		assertEquals(3, g.state.rounds());
		assertTrue(g.state.chambered());
		assertEquals(100, g.reserve, "no ammunition is lost or duplicated");
	}

	@Test
	void emptyReloadChambersAtChamberTick() {
		Gun g = new Gun(GunState.EMPTY, 30);
		ReloadRunner r = ReloadRunner.timeline(ReloadRunner.Kind.EMPTY, EMPTY, 1.0);
		run(r, g, 30);
		assertEquals(30, g.state.rounds());
		assertFalse(g.state.chambered(), "after commit but before the bolt release the chamber is still empty");
		assertFalse(r.interruptibleByFire());
		run(r, g, 15);
		assertTrue(g.state.chambered());
		assertEquals(29, g.state.rounds());
		assertTrue(r.interruptibleByFire());
		assertEquals(30, g.state.total());
	}

	@Test
	void reloadSpeedScalesTimeline() {
		Gun g = new Gun(GunState.EMPTY.withRounds(1).withChambered(true), 30);
		ReloadRunner r = ReloadRunner.timeline(ReloadRunner.Kind.TACTICAL, TACTICAL, 2.0);
		run(r, g, 13);
		assertEquals(30, g.state.rounds(), "commit at 26 / 2 = 13");
		run(r, g, 7);
		assertTrue(r.done(), "length 40 / 2 = 20");
	}

	@Test
	void fractionalClientTicksFireEachEventOnce() {
		Gun g = new Gun(GunState.EMPTY.withRounds(1).withChambered(true), 30);
		ReloadRunner r = ReloadRunner.timeline(ReloadRunner.Kind.TACTICAL, TACTICAL, 1.0);
		for (int i = 0; i < 400; i++) {
			r.advance(0.137f, g);
		}
		assertTrue(r.done());
		assertEquals(List.of("mag_out", "mag_in", "COMMIT"), g.events);
	}

	private static ReloadSpec.Single shellSpec() {
		return new ReloadSpec.Single(new Timeline(6, -1, -1, List.of()), 10, 6, "shell_insert", new Timeline(6, -1, -1, List.of()),
			new Timeline(14, -1, 10, List.of(new Cue(3, "pump_back"), new Cue(9, "pump_forward"))));
	}

	@Test
	void shellByShellLoadsUntilFullThenPumpsWhenEmpty() {
		Gun g = new Gun(GunState.EMPTY, 6);
		ReloadRunner r = ReloadRunner.single(shellSpec(), 1.0);
		run(r, g, 6 + 6 * 10 + 14);
		assertTrue(r.done());
		assertEquals(5, g.state.rounds(), "six shells loaded, one pumped into the chamber");
		assertTrue(g.state.chambered());
		assertEquals(6, r.roundsLoaded());
		assertEquals(94, g.reserve);
	}

	@Test
	void shellByShellStopRequestFinishesCurrentShell() {
		Gun g = new Gun(GunState.EMPTY.withRounds(1).withChambered(true), 6);
		ReloadRunner r = ReloadRunner.single(shellSpec(), 1.0);
		run(r, g, 6 + 3);
		r.requestStop();
		run(r, g, 30);
		assertTrue(r.done());
		assertEquals(2, g.state.rounds(), "the shell in progress is still loaded");
		assertTrue(g.state.chambered());
	}

	@Test
	void shellByShellStopsWhenReserveRunsOut() {
		Gun g = new Gun(GunState.EMPTY.withChambered(true), 6);
		g.reserve = 2;
		ReloadRunner r = ReloadRunner.single(shellSpec(), 1.0);
		run(r, g, 200);
		assertTrue(r.done());
		assertEquals(2, g.state.rounds());
		assertEquals(0, g.reserve);
	}

	@Test
	void cycleTimelineChambersRound() {
		Gun g = new Gun(GunState.EMPTY.withRounds(4), 5);
		ReloadRunner r = ReloadRunner.timeline(ReloadRunner.Kind.CYCLE,
			new Timeline(18, -1, 13, List.of(new Cue(2, "bolt_up"), new Cue(5, "bolt_back"), new Cue(11, "bolt_forward"), new Cue(15, "bolt_down"))), 1.0);
		run(r, g, 18);
		assertTrue(r.done());
		assertTrue(g.state.chambered());
		assertEquals(3, g.state.rounds());
		assertEquals(List.of("bolt_up", "bolt_back", "bolt_forward", "CHAMBER", "bolt_down"), g.events);
	}

	@Test
	void ticksUntilFireReadySupportsServerCatchUp() {
		Gun g = new Gun(GunState.EMPTY.withRounds(4).withChambered(true), 30);
		ReloadRunner r = ReloadRunner.timeline(ReloadRunner.Kind.TACTICAL, TACTICAL, 1.0);
		run(r, g, 24);
		float until = r.ticksUntilFireReady();
		assertEquals(2f, until, 0.01f);
		r.advance(until, g);
		assertTrue(r.interruptibleByFire());
		assertEquals(30, g.state.rounds(), "fast-forwarding applies the commit exactly once");
		ReloadRunner cycle = ReloadRunner.timeline(ReloadRunner.Kind.CYCLE, new Timeline(18, -1, 13, List.of()), 1.0);
		Gun bolt = new Gun(GunState.EMPTY.withRounds(4), 5);
		run(cycle, bolt, 11);
		cycle.advance(cycle.ticksUntilFireReady(), bolt);
		assertTrue(bolt.state.chambered());
	}
}
