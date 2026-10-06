package com.laptopcraft.registry;

import com.laptopcraft.block.LaptopData;
import com.mojang.serialization.Codec;
import java.util.function.UnaryOperator;
import net.fabricmc.fabric.api.item.v1.ComponentTooltipAppenderRegistry;
import net.minecraft.core.Registry;
import net.minecraft.core.component.DataComponentType;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.codec.ByteBufCodecs;

/**
 * Item data components. The laptop item carries its block entity's OS data and owner name, so a laptop
 * that is broken and placed again keeps all files, settings and app state (loot table: copy_components).
 */
public final class ModDataComponents {
	/** The laptop's CubeOS data (settings, files, app state). */
	public static final DataComponentType<LaptopData> OS_DATA = register("os_data", b -> b
			.persistent(LaptopData.CODEC)
			.networkSynchronized(LaptopData.STREAM_CODEC));

	/** Name of the player the laptop is registered to. */
	public static final DataComponentType<String> OWNER_NAME = register("owner_name", b -> b
			.persistent(Codec.string(0, 64))
			.networkSynchronized(ByteBufCodecs.stringUtf8(64)));

	private ModDataComponents() {
	}

	private static <T> DataComponentType<T> register(String name, UnaryOperator<DataComponentType.Builder<T>> builder) {
		return Registry.register(BuiltInRegistries.DATA_COMPONENT_TYPE, Reg.id(name), builder.apply(DataComponentType.builder()).build());
	}

	public static void init() {
		// The laptop summary ("Registered to Steve", "3 files"...) renders at the end of the tooltip.
		ComponentTooltipAppenderRegistry.addLast(OS_DATA);
	}
}
