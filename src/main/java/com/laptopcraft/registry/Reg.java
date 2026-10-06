package com.laptopcraft.registry;

import com.laptopcraft.LaptopCraft;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.function.BiFunction;
import java.util.function.Function;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.item.BlockItem;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockBehaviour;

/**
 * Shared registration helpers. Every item registered through here is also collected
 * (in registration order) for the LaptopCraft creative tab.
 */
public final class Reg {
	private static final List<Item> CREATIVE_ITEMS = new ArrayList<>();

	private Reg() {
	}

	public static Identifier id(String path) {
		return Identifier.fromNamespaceAndPath(LaptopCraft.MOD_ID, path);
	}

	public static ResourceKey<Item> itemKey(String name) {
		return ResourceKey.create(Registries.ITEM, id(name));
	}

	public static ResourceKey<Block> blockKey(String name) {
		return ResourceKey.create(Registries.BLOCK, id(name));
	}

	/** Registers a plain item. */
	public static Item item(String name, Item.Properties properties) {
		return item(name, Item::new, properties);
	}

	/** Registers an item built by {@code factory}; the properties already carry the item id. */
	public static <T extends Item> T item(String name, Function<Item.Properties, T> factory, Item.Properties properties) {
		@SuppressWarnings("unchecked")
		T item = (T) Items.registerItem(itemKey(name), factory::apply, properties);
		CREATIVE_ITEMS.add(item);
		return item;
	}

	/** Registers a block without an item. */
	public static <T extends Block> T blockNoItem(String name, Function<BlockBehaviour.Properties, T> factory, BlockBehaviour.Properties properties) {
		@SuppressWarnings("unchecked")
		T block = (T) Blocks.register(blockKey(name), factory::apply, properties);
		return block;
	}

	/** Registers a block plus a standard {@link BlockItem} with the same id. */
	public static <T extends Block> T block(String name, Function<BlockBehaviour.Properties, T> factory, BlockBehaviour.Properties properties) {
		return block(name, factory, properties, new Item.Properties());
	}

	/** Registers a block plus a standard {@link BlockItem} using the given item properties. */
	public static <T extends Block> T block(String name, Function<BlockBehaviour.Properties, T> factory, BlockBehaviour.Properties properties, Item.Properties itemProperties) {
		return block(name, factory, properties, BlockItem::new, itemProperties);
	}

	/** Registers a block plus a custom block item. */
	public static <T extends Block> T block(String name, Function<BlockBehaviour.Properties, T> factory, BlockBehaviour.Properties properties,
			BiFunction<Block, Item.Properties, Item> itemFactory, Item.Properties itemProperties) {
		T block = blockNoItem(name, factory, properties);
		Item item = Items.registerItem(itemKey(name), p -> itemFactory.apply(block, p), itemProperties.useBlockDescriptionPrefix());
		CREATIVE_ITEMS.add(item);
		return block;
	}

	/** All items registered through {@link Reg}, in registration order. */
	public static List<Item> creativeItems() {
		return Collections.unmodifiableList(CREATIVE_ITEMS);
	}
}
