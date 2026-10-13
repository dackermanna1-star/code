package dev.calibercraft.registry;

import dev.calibercraft.CaliberCraft;
import dev.calibercraft.core.GunState;
import dev.calibercraft.item.AttachmentLoadout;
import java.util.function.UnaryOperator;
import net.minecraft.core.Registry;
import net.minecraft.core.component.DataComponentType;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;

public final class ModComponents {
	/** Ammunition/action state. Changes on every shot, so it must not trigger the re-equip animation. */
	public static final DataComponentType<GunState> GUN_STATE = register("gun_state",
		b -> b.persistent(GunState.CODEC).networkSynchronized(GunState.STREAM_CODEC).ignoreSwapAnimation());
	public static final DataComponentType<AttachmentLoadout> ATTACHMENTS = register("attachments",
		b -> b.persistent(AttachmentLoadout.CODEC).networkSynchronized(AttachmentLoadout.STREAM_CODEC));
	public static final DataComponentType<Identifier> SKIN = register("skin",
		b -> b.persistent(Identifier.CODEC).networkSynchronized(Identifier.STREAM_CODEC));

	private ModComponents() {
	}

	private static <T> DataComponentType<T> register(String name, UnaryOperator<DataComponentType.Builder<T>> op) {
		return Registry.register(BuiltInRegistries.DATA_COMPONENT_TYPE, CaliberCraft.id(name), op.apply(DataComponentType.builder()).build());
	}

	public static void init() {
	}
}
