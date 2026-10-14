package net.abyssaldescent.registry;

import com.mojang.serialization.Codec;
import net.abyssaldescent.AbyssalDescent;
import net.minecraft.core.Registry;
import net.minecraft.core.component.DataComponentType;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.codec.ByteBufCodecs;

public final class ModComponents {
	/**
	 * Marks loot found during an expedition (value = run id). Unsecured items are destroyed on defeat and become normal
	 * items when the player extracts.
	 */
	public static final DataComponentType<Long> UNSECURED = Registry.register(BuiltInRegistries.DATA_COMPONENT_TYPE, AbyssalDescent.id("unsecured"),
		DataComponentType.<Long>builder().persistent(Codec.LONG).networkSynchronized(ByteBufCodecs.VAR_LONG).build());

	private ModComponents() {
	}

	public static void init() {
	}
}
