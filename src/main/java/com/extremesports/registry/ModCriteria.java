package com.extremesports.registry;

import com.extremesports.ExtremeSports;
import com.extremesports.advancement.SportTrigger;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;

public final class ModCriteria {
	public static final SportTrigger SPORT = Registry.register(BuiltInRegistries.TRIGGER_TYPES, ExtremeSports.id("sport_event"), new SportTrigger());

	private ModCriteria() {
	}

	public static void init() {
	}
}
