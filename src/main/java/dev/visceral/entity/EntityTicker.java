package dev.visceral.entity;

import dev.visceral.combat.MobCombat;
import dev.visceral.combat.PlayerCombat;
import dev.visceral.physics.BalanceSystem;
import dev.visceral.registry.VisceralRegistry;
import dev.visceral.wound.WoundSystem;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.Mob;

/** Per-tick dispatch from the LivingEntity mixin. */
public final class EntityTicker {
	private EntityTicker() {
	}

	public static void tick(LivingEntity e) {
		CombatState cs = VisceralEntity.get(e);
		if (e.level().isClientSide()) {
			if (cs != null) BalanceSystem.tickShared(e, cs);
			return;
		}
		if (cs == null) {
			if (!e.hasAttached(VisceralRegistry.WOUNDS)) return;
			cs = VisceralEntity.getOrCreate(e);
		}
		BalanceSystem.tickShared(e, cs);
		BalanceSystem.tickServer(e, cs);
		if (e instanceof ServerPlayer player) PlayerCombat.tick(player, cs);
		else if (e instanceof Mob mob) MobCombat.tick(mob, cs);
		WoundSystem.tick(e, cs);
	}
}
