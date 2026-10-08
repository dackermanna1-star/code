package dev.portalgun.registry;

import java.util.ArrayList;
import java.util.List;
import net.minecraft.world.item.Item;
import net.minecraft.world.level.block.Block;

/** Registers the dimension blocks described in the content spec (filled in by the worldgen module). */
public final class ModBlocks {
	public static final List<Block> BLOCKS = new ArrayList<>();
	public static final List<Item> ITEMS = new ArrayList<>();

	private ModBlocks() {
	}

	public static void init() {
	}
}
