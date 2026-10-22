package com.ordnance.weapon;

import com.ordnance.registry.ModItems;
import java.util.function.Supplier;

/**
 * Ammunition families. A weapon loads any {@link AmmoItem} of its category, so new rounds only need a new item
 * with an existing (or new) {@link com.ordnance.explosion.ExplosionProfile}.
 */
public enum AmmoCategory {
	RPG_ROCKET(() -> (AmmoItem)ModItems.PG7V_ROCKET),
	GRENADE_40MM(() -> (AmmoItem)ModItems.GRENADE_40MM_HE),
	MISSILE(() -> (AmmoItem)ModItems.HYPERSONIC_MISSILE);

	private final Supplier<AmmoItem> defaultAmmo;

	AmmoCategory(Supplier<AmmoItem> defaultAmmo) {
		this.defaultAmmo = defaultAmmo;
	}

	/** Round used in creative mode when the inventory holds none. */
	public AmmoItem defaultAmmo() {
		return this.defaultAmmo.get();
	}
}
