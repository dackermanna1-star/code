package dev.portalgun.registry;

import dev.portalgun.PortalGunMod;
import dev.portalgun.item.PortalGunItem;
import net.fabricmc.fabric.api.itemgroup.v1.FabricItemGroup;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.chat.Component;
import net.minecraft.world.item.CreativeModeTab;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;

public final class ModItemGroups {
	public static final CreativeModeTab MAIN = Registry.register(BuiltInRegistries.CREATIVE_MODE_TAB, PortalGunMod.id("main"),
		FabricItemGroup.builder()
			.title(Component.translatable("itemGroup.portalgun.main"))
			.icon(() -> new ItemStack(ModItems.PORTAL_GUN))
			.displayItems((params, out) -> {
				ItemStack full = new ItemStack(ModItems.PORTAL_GUN);
				PortalGunItem.setCharges(full, PortalGunItem.MAX_CHARGES);
				out.accept(full);
				out.accept(ModItems.PORTAL_FLUID);
				for (Item item : ModItems.SPEC_ITEMS) {
					out.accept(item);
				}
			})
			.build());
	public static final CreativeModeTab BLOCKS = Registry.register(BuiltInRegistries.CREATIVE_MODE_TAB, PortalGunMod.id("blocks"),
		FabricItemGroup.builder()
			.title(Component.translatable("itemGroup.portalgun.blocks"))
			.icon(() -> ModBlocks.ITEMS.isEmpty() ? new ItemStack(ModItems.PORTAL_FLUID) : new ItemStack(ModBlocks.ITEMS.get(0)))
			.displayItems((params, out) -> ModBlocks.ITEMS.forEach(out::accept))
			.build());
	public static final CreativeModeTab CREATURES = Registry.register(BuiltInRegistries.CREATIVE_MODE_TAB, PortalGunMod.id("creatures"),
		FabricItemGroup.builder()
			.title(Component.translatable("itemGroup.portalgun.creatures"))
			.icon(() -> ModCreatures.SPAWN_EGGS.isEmpty() ? new ItemStack(ModItems.PORTAL_GUN) : new ItemStack(ModCreatures.SPAWN_EGGS.get(0)))
			.displayItems((params, out) -> ModCreatures.SPAWN_EGGS.forEach(out::accept))
			.build());

	private ModItemGroups() {
	}

	public static void init() {
	}
}
