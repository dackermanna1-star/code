package com.chaosunleashed.registry;

import com.chaosunleashed.ChaosUnleashed;
import net.minecraft.block.Block;
import net.minecraft.item.Item;
import net.minecraft.registry.RegistryKeys;
import net.minecraft.registry.tag.TagKey;

public final class ModTags {
	/** Blocks events never destroy or convert. */
	public static final TagKey<Block> EVENT_IMMUNE = block("event_immune");
	/** Blocks Blood Moon zombies can break through. */
	public static final TagKey<Block> ZOMBIE_BREAKABLE = block("zombie_breakable");
	/** Loose blocks that float away during a Gravity Flip / get pulled into a Black Hole first. */
	public static final TagKey<Block> LOOSE_BLOCKS = block("loose_blocks");
	/** Blocks a Herd Stampede tramples or smashes through. */
	public static final TagKey<Block> STAMPEDE_TRAMPLES = block("stampede_tramples");

	public static final TagKey<Item> ALIEN_ALLOY_REPAIR = item("alien_alloy_repair");
	public static final TagKey<Item> KAIJU_SCALE_REPAIR = item("kaiju_scale_repair");

	private ModTags() {
	}

	private static TagKey<Block> block(String name) {
		return TagKey.of(RegistryKeys.BLOCK, ChaosUnleashed.id(name));
	}

	private static TagKey<Item> item(String name) {
		return TagKey.of(RegistryKeys.ITEM, ChaosUnleashed.id(name));
	}

	public static void init() {
	}
}
