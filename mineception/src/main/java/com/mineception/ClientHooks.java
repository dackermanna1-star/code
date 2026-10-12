package com.mineception;

import java.util.function.Consumer;
import net.minecraft.core.BlockPos;

/** Hooks common code calls into the client through; the client entrypoint replaces the no-op defaults. */
public final class ClientHooks {
	/** Opens the laptop screen for the laptop at a position (called on the client when a player uses a laptop). */
	public static Consumer<BlockPos> openLaptop = pos -> {
	};

	private ClientHooks() {
	}
}
