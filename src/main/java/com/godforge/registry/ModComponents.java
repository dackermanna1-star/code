package com.godforge.registry;

import com.godforge.Godforge;
import com.godforge.weapon.WeaponSettings;
import net.minecraft.core.GlobalPos;
import net.minecraft.core.Registry;
import net.minecraft.core.component.DataComponentType;
import net.minecraft.core.registries.BuiltInRegistries;

public final class ModComponents {
	/** Player-tuned weapon parameters (mode, power, width, range, colour ...). */
	public static final DataComponentType<WeaponSettings> SETTINGS = Registry.register(
		BuiltInRegistries.DATA_COMPONENT_TYPE,
		Godforge.id("settings"),
		DataComponentType.<WeaponSettings>builder()
			.persistent(WeaponSettings.CODEC)
			.networkSynchronized(WeaponSettings.STREAM_CODEC)
			.ignoreSwapAnimation()
			.build()
	);

	/** A designated strike location (Asteroid Gun, Planet Cracker, Sunforge). */
	public static final DataComponentType<GlobalPos> TARGET = Registry.register(
		BuiltInRegistries.DATA_COMPONENT_TYPE,
		Godforge.id("target"),
		DataComponentType.<GlobalPos>builder()
			.persistent(GlobalPos.CODEC)
			.networkSynchronized(GlobalPos.STREAM_CODEC)
			.ignoreSwapAnimation()
			.build()
	);

	private ModComponents() {
	}

	public static void init() {
	}
}
