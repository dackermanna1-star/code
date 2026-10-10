package dev.overkill.registry;

import dev.overkill.OverkillArsenal;
import dev.overkill.effect.ElectrifiedEffect;
import dev.overkill.effect.SearingEffect;
import dev.overkill.effect.SunmarkedEffect;
import net.minecraft.core.Holder;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.effect.MobEffect;

public final class ModEffects {
	/** Burning damage over time that keeps eating at anything caught in a blast. */
	public static final Holder<MobEffect> SEARING = register("searing", new SearingEffect());
	/** Slowness + periodic shocks from the Stormcaller Gauntlet. */
	public static final Holder<MobEffect> ELECTRIFIED = register("electrified", new ElectrifiedEffect());
	/** Applied by the Sunline Rifle trace; marked targets take bonus damage when the line detonates. */
	public static final Holder<MobEffect> SUNMARKED = register("sunmarked", new SunmarkedEffect());

	private ModEffects() {
	}

	private static Holder<MobEffect> register(String name, MobEffect effect) {
		return Registry.registerForHolder(BuiltInRegistries.MOB_EFFECT, OverkillArsenal.id(name), effect);
	}

	public static void init() {
	}
}
