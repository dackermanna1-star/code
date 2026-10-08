package dev.portalgun.registry;

import dev.portalgun.PortalGunMod;
import java.util.function.UnaryOperator;
import net.minecraft.core.Registry;
import net.minecraft.core.component.DataComponentType;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.resources.Identifier;
import net.minecraft.util.ExtraCodecs;

public final class ModComponents {
	/** Which dimension the portal gun is dialed to. */
	public static final DataComponentType<Identifier> DESTINATION = register("destination",
		b -> b.persistent(Identifier.CODEC).networkSynchronized(Identifier.STREAM_CODEC));
	/** Remaining portal fluid charges in a portal gun. */
	public static final DataComponentType<Integer> CHARGES = register("charges",
		b -> b.persistent(ExtraCodecs.NON_NEGATIVE_INT).networkSynchronized(ByteBufCodecs.VAR_INT));

	private ModComponents() {
	}

	private static <T> DataComponentType<T> register(String name, UnaryOperator<DataComponentType.Builder<T>> op) {
		return Registry.register(BuiltInRegistries.DATA_COMPONENT_TYPE, PortalGunMod.id(name), op.apply(DataComponentType.builder()).build());
	}

	public static void init() {
	}
}
