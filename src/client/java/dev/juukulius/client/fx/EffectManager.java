package dev.juukulius.client.fx;

import java.util.ArrayList;
import java.util.List;
import net.minecraft.client.multiplayer.ClientLevel;

/** Keeps the active {@link WorldEffect}s, ticks and renders them. */
public final class EffectManager {
	private static final int MAX_EFFECTS = 256;
	private static final List<WorldEffect> EFFECTS = new ArrayList<>();

	private EffectManager() {
	}

	public static void add(WorldEffect effect) {
		if (EFFECTS.size() >= MAX_EFFECTS) {
			EFFECTS.removeFirst();
		}

		EFFECTS.add(effect);
	}

	public static void tick(ClientLevel level) {
		EFFECTS.removeIf(effect -> !effect.tick(level));
	}

	public static void render(FxContext context) {
		for (WorldEffect effect : EFFECTS) {
			effect.render(context);
		}
	}

	public static void clear() {
		EFFECTS.clear();
	}

	public static int count() {
		return EFFECTS.size();
	}
}
