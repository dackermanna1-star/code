package net.earthscapes.registry;

import java.util.ArrayList;
import java.util.List;
import net.earthscapes.Earthscapes;
import net.earthscapes.item.VictoriaLilyPadItem;
import net.fabricmc.fabric.api.itemgroup.v1.FabricItemGroup;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.food.FoodProperties;
import net.minecraft.world.item.CreativeModeTab;
import net.minecraft.world.item.DoubleHighBlockItem;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.DoublePlantBlock;

public final class EsItems {
	public static final List<Item> ALL = new ArrayList<>();

	public static final Item DATE = register("date",
		new Item.Properties().food(new FoodProperties.Builder().nutrition(3).saturationModifier(0.5F).build()));

	public static final ResourceKey<CreativeModeTab> TAB_KEY = ResourceKey.create(Registries.CREATIVE_MODE_TAB, Earthscapes.id("earthscapes"));

	private EsItems() {
	}

	public static void init() {
		for (Block block : EsBlocks.ALL) {
			if (block == EsBlocks.DATES) {
				continue; // obtained by picking, the bunch itself is not an item
			}
			Item item;
			if (block == EsBlocks.VICTORIA_LILY_PAD) {
				item = Items.registerBlock(block, VictoriaLilyPadItem::new);
			} else if (block instanceof DoublePlantBlock) {
				item = Items.registerBlock(block, DoubleHighBlockItem::new);
			} else {
				item = Items.registerBlock(block);
			}
			ALL.add(item);
		}
		ALL.add(DATE);

		Registry.register(BuiltInRegistries.CREATIVE_MODE_TAB, TAB_KEY, FabricItemGroup.builder()
			.title(Component.translatable("itemGroup.earthscapes"))
			.icon(() -> new ItemStack(EsBlocks.UMBRELLA_THORN_SAPLING))
			.displayItems((parameters, output) -> ALL.forEach(output::accept))
			.build());
	}

	private static Item register(String name, Item.Properties properties) {
		ResourceKey<Item> key = ResourceKey.create(Registries.ITEM, Earthscapes.id(name));
		return Items.registerItem(key, Item::new, properties);
	}
}
