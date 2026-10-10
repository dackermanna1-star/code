package dev.overkill.util;

import net.fabricmc.fabric.api.entity.event.v1.ServerLivingEntityEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.minecraft.tags.DamageTypeTags;
import net.minecraft.world.entity.Entity;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Cancels fall damage for entities the weapons deliberately launched (gauntlet slam, white-hole jumps).
 */
public final class SafeLanding {
	private static final Map<UUID, Long> PROTECTED_UNTIL = new HashMap<>();

	private SafeLanding() {
	}

	public static void init() {
		ServerLivingEntityEvents.ALLOW_DAMAGE.register((entity, source, amount) -> {
			if (!source.is(DamageTypeTags.IS_FALL)) {
				return true;
			}
			Long until = PROTECTED_UNTIL.get(entity.getUUID());
			if (until == null) {
				return true;
			}
			PROTECTED_UNTIL.remove(entity.getUUID());
			return entity.level().getGameTime() > until;
		});
		ServerLifecycleEvents.SERVER_STOPPED.register(server -> PROTECTED_UNTIL.clear());
	}

	public static void protect(Entity entity, int ticks) {
		PROTECTED_UNTIL.put(entity.getUUID(), entity.level().getGameTime() + ticks);
		entity.resetFallDistance();
	}
}
