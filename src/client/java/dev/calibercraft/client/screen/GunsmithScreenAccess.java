package dev.calibercraft.client.screen;

import dev.calibercraft.core.StatModifier;
import java.util.List;
import net.minecraft.network.chat.Component;

/** Shared, non-screen helpers (modifier descriptions used by tooltips and the gunsmith screen). */
public final class GunsmithScreenAccess {
	private GunsmithScreenAccess() {
	}

	public static List<Component> describe(List<StatModifier> mods) {
		return GunsmithScreen.describe(mods);
	}
}
