package com.extremesports.registry;

import com.extremesports.ExtremeSports;
import com.extremesports.sport.EquipmentConfig;
import net.minecraft.core.Registry;
import net.minecraft.core.component.DataComponentType;
import net.minecraft.core.registries.BuiltInRegistries;

public final class ModDataComponents {
	public static final DataComponentType<EquipmentConfig> EQUIPMENT_CONFIG = Registry.register(
		BuiltInRegistries.DATA_COMPONENT_TYPE,
		ExtremeSports.id("equipment_config"),
		DataComponentType.<EquipmentConfig>builder()
			.persistent(EquipmentConfig.CODEC)
			.networkSynchronized(EquipmentConfig.STREAM_CODEC)
			.cacheEncoding()
			.build()
	);

	/** Park builder mode index stored on the builder tool. */
	public static final DataComponentType<Integer> BUILDER_MODE = Registry.register(
		BuiltInRegistries.DATA_COMPONENT_TYPE,
		ExtremeSports.id("builder_mode"),
		DataComponentType.<Integer>builder()
			.persistent(com.mojang.serialization.Codec.INT)
			.networkSynchronized(net.minecraft.network.codec.ByteBufCodecs.VAR_INT)
			.build()
	);

	private ModDataComponents() {
	}

	public static void init() {
	}
}
