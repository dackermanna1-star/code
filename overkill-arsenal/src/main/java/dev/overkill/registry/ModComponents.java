package dev.overkill.registry;

import com.mojang.serialization.Codec;
import dev.overkill.OverkillArsenal;
import net.minecraft.core.Registry;
import net.minecraft.core.component.DataComponentType;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.codec.ByteBufCodecs;

public final class ModComponents {
	/** Stormcaller Gauntlet: stored lightning charge, 0..10. */
	public static final DataComponentType<Integer> STORM_CHARGE = register("storm_charge",
		DataComponentType.<Integer>builder().persistent(Codec.intRange(0, 10)).networkSynchronized(ByteBufCodecs.VAR_INT).build());

	/** Stormcaller Gauntlet: game time of the last punch that landed (charge decays after a while). */
	public static final DataComponentType<Long> STORM_LAST_HIT = register("storm_last_hit",
		DataComponentType.<Long>builder().persistent(Codec.LONG).build());

	/** Riftfang Scythe: ticks until the Void Harvest ultimate is ready again (recharges while carried). */
	public static final DataComponentType<Integer> ULTIMATE_RECHARGE = register("ultimate_recharge",
		DataComponentType.<Integer>builder().persistent(Codec.intRange(0, 72000)).networkSynchronized(ByteBufCodecs.VAR_INT).build());

	private ModComponents() {
	}

	private static <T> DataComponentType<T> register(String name, DataComponentType<T> type) {
		return Registry.register(BuiltInRegistries.DATA_COMPONENT_TYPE, OverkillArsenal.id(name), type);
	}

	public static void init() {
	}
}
