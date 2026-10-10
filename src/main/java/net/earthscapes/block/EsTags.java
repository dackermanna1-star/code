package net.earthscapes.block;

import net.earthscapes.Earthscapes;
import net.minecraft.core.registries.Registries;
import net.minecraft.tags.TagKey;
import net.minecraft.world.level.block.Block;

public final class EsTags {
	/** Soils for grasses, flowers and most saplings (dirt-like blocks). */
	public static final TagKey<Block> GRASS_SOIL = block("grass_soil");
	/** Soils for desert plants and palms: sand, gravel pavement, dirt. */
	public static final TagKey<Block> DESERT_SOIL = block("desert_soil");
	/** Anything a bromeliad may perch on besides a sturdy top face. */
	public static final TagKey<Block> EPIPHYTE_SUPPORT = block("epiphyte_support");
	/** Ground that the tree features accept beneath a trunk. */
	public static final TagKey<Block> TREE_SOIL = block("tree_soil");

	private EsTags() {
	}

	private static TagKey<Block> block(String name) {
		return TagKey.create(Registries.BLOCK, Earthscapes.id(name));
	}
}
