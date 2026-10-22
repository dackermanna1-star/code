package com.ordnance.weapon;

import com.ordnance.explosion.ExplosionProfile;

/** An item that carries a warhead (grenades, rockets, launcher rounds, missiles). */
public interface ExplosiveItem {
	ExplosionProfile profile();
}
