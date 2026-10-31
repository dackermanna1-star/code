package com.jjkshowdown.registry;

import com.jjkshowdown.JjkShowdown;
import com.jjkshowdown.effect.InformationOverloadEffect;
import net.minecraft.core.Holder;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.effect.MobEffect;

public final class ModEffects {
	public static final Holder<MobEffect> INFORMATION_OVERLOAD = Registry.registerForHolder(BuiltInRegistries.MOB_EFFECT,
			JjkShowdown.id("information_overload"), new InformationOverloadEffect());

	private ModEffects() {
	}

	public static void init() {
	}
}
