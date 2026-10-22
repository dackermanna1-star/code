package com.ordnance;

import net.minecraft.entity.Entity;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.item.ItemStack;

/**
 * Hooks from common code into client-only effects. The dedicated server keeps the no-op implementation; the
 * client entrypoint installs the real one. Calls happen on the logical client only.
 */
public final class ClientBridge {
	private static Effects effects = new Effects() {
	};

	private ClientBridge() {
	}

	public static Effects get() {
		return effects;
	}

	public static void install(Effects implementation) {
		effects = implementation;
	}

	public interface Effects {
		/** Per-tick visuals for Ordnance projectiles and debris (trails, exhaust, smoke emission). */
		default void entityTick(Entity entity) {
		}

		/** The local player fired a weapon: predicted recoil, muzzle flash. */
		default void weaponFired(PlayerEntity shooter, ItemStack weapon) {
		}
	}
}
