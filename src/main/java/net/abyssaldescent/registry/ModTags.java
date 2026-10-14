package net.abyssaldescent.registry;

import net.abyssaldescent.AbyssalDescent;
import net.minecraft.core.registries.Registries;
import net.minecraft.tags.TagKey;
import net.minecraft.world.item.Item;
import net.minecraft.world.level.block.Block;

public final class ModTags {
	/** Blocks survival players may break inside the dungeon (false walls, urns, cobwebs). */
	public static final TagKey<Block> DUNGEON_BREAKABLE = TagKey.create(Registries.BLOCK, AbyssalDescent.id("dungeon_breakable"));
	/** Blocks that can be used while holding a block item inside the dungeon. */
	public static final TagKey<Block> DUNGEON_INTERACTABLE = TagKey.create(Registries.BLOCK, AbyssalDescent.id("dungeon_interactable"));
	/** Items that are blocked inside the dungeon (teleporting food, buckets, fire starters...). */
	public static final TagKey<Item> DUNGEON_BANNED = TagKey.create(Registries.ITEM, AbyssalDescent.id("dungeon_banned"));
	/** Relic items (active from hotbar/offhand). */
	public static final TagKey<Item> RELICS = TagKey.create(Registries.ITEM, AbyssalDescent.id("relics"));

	private ModTags() {
	}
}
