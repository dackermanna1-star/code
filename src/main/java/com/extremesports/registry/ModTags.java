package com.extremesports.registry;

import com.extremesports.ExtremeSports;
import net.minecraft.core.registries.Registries;
import net.minecraft.tags.TagKey;
import net.minecraft.world.level.block.Block;

public final class ModTags {
	/** Vanilla rail-like blocks you can grind along their top (fences, walls, bars, panes, chains). */
	public static final TagKey<Block> GRIND_RAILS = TagKey.create(Registries.BLOCK, ExtremeSports.id("grind_rails"));
	/** Blocks whose exposed top edges grind with metallic sparks. */
	public static final TagKey<Block> METAL_LEDGES = TagKey.create(Registries.BLOCK, ExtremeSports.id("metal_ledges"));
	/** Blocks that roll like a smooth skatepark surface. */
	public static final TagKey<Block> SMOOTH_SURFACES = TagKey.create(Registries.BLOCK, ExtremeSports.id("smooth_surfaces"));
	/** Bumpy stone surfaces. */
	public static final TagKey<Block> ROUGH_SURFACES = TagKey.create(Registries.BLOCK, ExtremeSports.id("rough_surfaces"));

	private ModTags() {
	}
}
