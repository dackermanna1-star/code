package dev.calibercraft.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Optional;
import net.minecraft.resources.Identifier;
import org.junit.jupiter.api.Test;

class AmmoLogicTest {
	private static final Optional<Identifier> FMJ = Optional.of(Identifier.fromNamespaceAndPath("calibercraft", "556"));
	private static final Optional<Identifier> AP = Optional.of(Identifier.fromNamespaceAndPath("calibercraft", "556_ap"));

	@Test
	void selfLoadingFeedsFromMagazineUntilEmpty() {
		GunState s = GunState.EMPTY.withRounds(2).withChambered(true);
		s = AmmoLogic.fire(s, ActionType.SELF_LOADING);
		assertEquals(1, s.rounds());
		assertTrue(s.chambered());
		s = AmmoLogic.fire(s, ActionType.SELF_LOADING);
		s = AmmoLogic.fire(s, ActionType.SELF_LOADING);
		assertEquals(0, s.total());
		assertFalse(AmmoLogic.canFire(s, ActionType.SELF_LOADING));
	}

	@Test
	void manualActionsRequireCycling() {
		GunState s = GunState.EMPTY.withRounds(3).withChambered(true);
		s = AmmoLogic.fire(s, ActionType.BOLT);
		assertFalse(AmmoLogic.canFire(s, ActionType.BOLT));
		assertTrue(AmmoLogic.needsCycle(s, ActionType.BOLT));
		s = AmmoLogic.cycle(s);
		assertTrue(AmmoLogic.canFire(s, ActionType.BOLT));
		assertEquals(2, s.rounds());
	}

	@Test
	void revolverFiresStraightFromCylinder() {
		GunState s = GunState.EMPTY.withRounds(6);
		assertTrue(AmmoLogic.canFire(s, ActionType.DOUBLE_ACTION));
		s = AmmoLogic.fire(s, ActionType.DOUBLE_ACTION);
		assertEquals(5, s.rounds());
		assertFalse(AmmoLogic.needsCycle(s, ActionType.DOUBLE_ACTION));
	}

	@Test
	void commitTopsUpFromLimitedReserve() {
		GunState s = GunState.EMPTY.withRounds(10).withChambered(true).withLoadedAmmo(FMJ);
		AmmoLogic.Commit c = AmmoLogic.commitMagazine(s, 30, 5, FMJ);
		assertEquals(15, c.state().rounds());
		assertEquals(5, c.taken());
		assertEquals(0, c.returned());
	}

	@Test
	void switchingAmmoReturnsEveryLoadedRound() {
		GunState s = GunState.EMPTY.withRounds(12).withChambered(true).withLoadedAmmo(FMJ).withSelectedAmmo(AP);
		assertTrue(AmmoLogic.isSwitchingAmmo(s));
		assertEquals(ReloadRunner.Kind.EMPTY, AmmoLogic.chooseReload(ReloadSpec.Type.MAGAZINE, ActionType.SELF_LOADING, s));
		AmmoLogic.Commit c = AmmoLogic.commitMagazine(s, 30, 100, AP);
		assertEquals(13, c.returned());
		assertEquals(FMJ, c.returnedType());
		assertEquals(30, c.state().rounds());
		assertFalse(c.state().chambered());
		assertEquals(AP, c.state().loadedAmmo());
	}

	@Test
	void reloadAvailability() {
		GunState full = GunState.EMPTY.withRounds(30).withChambered(true).withLoadedAmmo(FMJ);
		assertFalse(AmmoLogic.canReload(full, 30, 100), "full magazine");
		assertFalse(AmmoLogic.canReload(GunState.EMPTY, 30, 0), "no reserve");
		assertTrue(AmmoLogic.canReload(GunState.EMPTY, 30, 1));
		assertEquals(ReloadRunner.Kind.TACTICAL, AmmoLogic.chooseReload(ReloadSpec.Type.MAGAZINE, ActionType.SELF_LOADING, full.withRounds(3)));
		assertEquals(ReloadRunner.Kind.SINGLE, AmmoLogic.chooseReload(ReloadSpec.Type.SINGLE, ActionType.PUMP, GunState.EMPTY));
	}

	@Test
	void singleLoadRespectsCapacity() {
		assertNull(AmmoLogic.loadOne(GunState.EMPTY.withRounds(6), 6));
		assertEquals(4, AmmoLogic.loadOne(GunState.EMPTY.withRounds(3), 6).rounds());
	}
}
