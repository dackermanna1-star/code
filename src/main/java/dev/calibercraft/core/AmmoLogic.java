package dev.calibercraft.core;

import java.util.Optional;
import net.minecraft.resources.Identifier;

/** Pure ammunition rules shared by client prediction, server authority and tests. */
public final class AmmoLogic {
	private AmmoLogic() {
	}

	public static boolean canFire(GunState s, ActionType action) {
		return action.usesChamber() ? s.chambered() : s.rounds() > 0;
	}

	/** State after one shot. Self-loading actions immediately chamber the next round. */
	public static GunState fire(GunState s, ActionType action) {
		return switch (action) {
			case DOUBLE_ACTION -> s.withRounds(s.rounds() - 1);
			case SELF_LOADING -> s.rounds() > 0 ? s.withRounds(s.rounds() - 1).withChambered(true) : s.withChambered(false);
			case BOLT, PUMP -> s.withChambered(false);
		};
	}

	/** Whether the action must be cycled (bolt, pump or charging handle) before the weapon can fire. */
	public static boolean needsCycle(GunState s, ActionType action) {
		return action.usesChamber() && !s.chambered() && s.rounds() > 0;
	}

	public static GunState cycle(GunState s) {
		if (s.chambered() || s.rounds() <= 0) {
			return s;
		}
		return s.withRounds(s.rounds() - 1).withChambered(true);
	}

	public static boolean isSwitchingAmmo(GunState s) {
		return s.selectedAmmo().isPresent() && s.loadedAmmo().isPresent() && s.total() > 0
			&& !s.selectedAmmo().equals(s.loadedAmmo());
	}

	public static boolean canReload(GunState s, int capacity, int reserve) {
		if (reserve <= 0) {
			return false;
		}
		return isSwitchingAmmo(s) || s.rounds() < capacity || (!s.chambered() && s.rounds() == 0);
	}

	public static ReloadRunner.Kind chooseReload(ReloadSpec.Type type, ActionType action, GunState s) {
		return switch (type) {
			case SINGLE -> ReloadRunner.Kind.SINGLE;
			case CYLINDER -> ReloadRunner.Kind.TACTICAL;
			case MAGAZINE -> (s.chambered() && !isSwitchingAmmo(s)) ? ReloadRunner.Kind.TACTICAL : ReloadRunner.Kind.EMPTY;
		};
	}

	/** Result of a magazine/cylinder commit: new state, rounds taken from reserve, rounds returned to it. */
	public record Commit(GunState state, int taken, int returned, Optional<Identifier> returnedType) {
	}

	/**
	 * Transfers rounds into the magazine. When switching ammunition types every loaded round (including the
	 * chambered one) is returned first.
	 */
	public static Commit commitMagazine(GunState s, int capacity, int reserve, Optional<Identifier> newType) {
		int returned = 0;
		Optional<Identifier> returnedType = Optional.empty();
		GunState st = s;
		boolean switching = newType.isPresent() && s.loadedAmmo().isPresent() && !newType.equals(s.loadedAmmo()) && s.total() > 0;
		if (switching) {
			returned = s.total();
			returnedType = s.loadedAmmo();
			st = st.withRounds(0).withChambered(false);
		}
		int take = Math.max(0, Math.min(capacity - st.rounds(), reserve));
		st = st.withRounds(st.rounds() + take);
		if (newType.isPresent() && (take > 0 || switching || st.loadedAmmo().isEmpty())) {
			st = st.withLoadedAmmo(newType);
		}
		return new Commit(st, take, returned, returnedType);
	}

	/** Single-round load (shotgun tube). Returns null if the tube is full. */
	public static GunState loadOne(GunState s, int capacity) {
		if (s.rounds() >= capacity) {
			return null;
		}
		return s.withRounds(s.rounds() + 1);
	}
}
