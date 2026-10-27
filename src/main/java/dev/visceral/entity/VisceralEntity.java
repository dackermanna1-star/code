package dev.visceral.entity;

import dev.visceral.state.PhysState;
import net.minecraft.world.entity.Entity;
import org.jspecify.annotations.Nullable;

/** Duck interface mixed into {@link net.minecraft.world.entity.LivingEntity}. */
public interface VisceralEntity {
	@Nullable CombatState visceral$combatOrNull();

	CombatState visceral$combat();

	/** Client-side animation/physics object (opaque to common code). */
	@Nullable Object visceral$clientData();

	void visceral$setClientData(@Nullable Object data);

	static @Nullable CombatState get(Entity entity) {
		return entity instanceof VisceralEntity v ? v.visceral$combatOrNull() : null;
	}

	static CombatState getOrCreate(Entity entity) {
		return ((VisceralEntity) entity).visceral$combat();
	}

	static PhysState state(Entity entity) {
		CombatState s = get(entity);
		return s == null ? PhysState.STANDING : s.state;
	}
}
