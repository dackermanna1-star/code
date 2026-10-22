package com.ordnance.registry;

import com.ordnance.Ordnance;
import net.minecraft.block.Block;
import net.minecraft.registry.RegistryKeys;
import net.minecraft.registry.tag.TagKey;

public final class ModTags {
	/** Blocks Ordnance explosions never destroy (on top of unbreakable blocks). */
	public static final TagKey<Block> EXPLOSION_PROOF = TagKey.of(RegistryKeys.BLOCK, Ordnance.id("explosion_proof"));
	/** Blocks shattered by fragments and blast pressure. */
	public static final TagKey<Block> SHATTERABLE = TagKey.of(RegistryKeys.BLOCK, Ordnance.id("shatterable"));
	/** Surface blocks that turn into scorched earth. */
	public static final TagKey<Block> SCORCHABLE = TagKey.of(RegistryKeys.BLOCK, Ordnance.id("scorchable"));
	/** Vegetation burned away by heat. */
	public static final TagKey<Block> BURNS_AWAY = TagKey.of(RegistryKeys.BLOCK, Ordnance.id("burns_away"));

	private ModTags() {
	}
}
