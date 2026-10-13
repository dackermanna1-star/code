package dev.calibercraft.registry;

import dev.calibercraft.CaliberCraft;
import dev.calibercraft.config.ServerConfig;
import dev.calibercraft.data.CaliberData;
import dev.calibercraft.data.CaliberDataHolder;
import dev.calibercraft.item.AmmoItem;
import dev.calibercraft.item.AttachmentItem;
import dev.calibercraft.item.FirearmItem;
import dev.calibercraft.item.WeaponStacks;
import net.fabricmc.fabric.api.itemgroup.v1.FabricItemGroup;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.chat.Component;
import net.minecraft.world.item.CreativeModeTab;
import net.minecraft.world.item.ItemStack;

/** One creative tab with every weapon (loaded, default attachments), ammunition, attachment and the bench. */
public final class ModCreativeTab {
	public static final CreativeModeTab TAB = Registry.register(BuiltInRegistries.CREATIVE_MODE_TAB, CaliberCraft.id("arsenal"),
		FabricItemGroup.builder()
			.title(Component.literal(ServerConfig.get().displayName))
			.icon(() -> new ItemStack(ModItems.WEAPONS.get(4)))
			.displayItems((params, out) -> {
				// Creative contents are built on the client, which holds the synced definitions.
				CaliberData data = CaliberDataHolder.client().weapons().isEmpty() ? CaliberDataHolder.server() : CaliberDataHolder.client();
				for (FirearmItem w : ModItems.WEAPONS) {
					out.accept(WeaponStacks.create(w, data, true));
				}
				for (AmmoItem a : ModItems.AMMO) {
					out.accept(a);
				}
				for (AttachmentItem a : ModItems.ATTACHMENTS) {
					out.accept(a);
				}
				out.accept(ModItems.GUN_PARTS);
				out.accept(ModItems.PRECISION_PARTS);
				out.accept(ModItems.PRISMATIC_FINISH_KIT);
				out.accept(ModItems.GUNSMITH_BENCH);
			})
			.build());

	private ModCreativeTab() {
	}

	public static void init() {
	}
}
