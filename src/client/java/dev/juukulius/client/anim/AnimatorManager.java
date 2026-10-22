package dev.juukulius.client.anim;

import it.unimi.dsi.fastutil.ints.Int2ObjectMap;
import it.unimi.dsi.fastutil.ints.Int2ObjectOpenHashMap;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.player.AbstractClientPlayer;
import net.minecraft.world.entity.Entity;
import org.jspecify.annotations.Nullable;

/** Owns one {@link PlayerAnimator} per visible player and drops them when the player is gone. */
public final class AnimatorManager {
	private static final Int2ObjectMap<PlayerAnimator> ANIMATORS = new Int2ObjectOpenHashMap<>();

	private AnimatorManager() {
	}

	public static PlayerAnimator get(int entityId) {
		PlayerAnimator animator = ANIMATORS.get(entityId);
		if (animator == null) {
			animator = new PlayerAnimator(entityId);
			ANIMATORS.put(entityId, animator);
		}

		animator.lastTouchedTick = (int) ClientClock.ticks();
		return animator;
	}

	public static @Nullable PlayerAnimator peek(int entityId) {
		return ANIMATORS.get(entityId);
	}

	public static void tick(ClientLevel level) {
		int now = (int) ClientClock.ticks();
		ANIMATORS.int2ObjectEntrySet().removeIf(entry -> {
			Entity entity = level.getEntity(entry.getIntKey());
			if (entity instanceof AbstractClientPlayer player) {
				entry.getValue().tick(player);
				return false;
			}

			return now - entry.getValue().lastTouchedTick > 100;
		});
	}

	public static void clear() {
		ANIMATORS.clear();
	}
}
