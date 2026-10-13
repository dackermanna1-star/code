package dev.calibercraft.combat;

import dev.calibercraft.registry.ModTags;
import net.minecraft.tags.BlockTags;
import net.minecraft.world.level.block.SoundType;
import net.minecraft.world.level.block.state.BlockState;

/**
 * Impact material classification, used for particles/sounds (client) and ricochets (server).
 * Derived from the block's {@link SoundType} so modded blocks are classified sensibly without tags.
 */
public enum SurfaceType {
	STONE, DIRT, WOOD, METAL, GLASS, WATER, FLESH, SOFT, SAND;

	public static SurfaceType of(BlockState state) {
		if (state.is(ModTags.SHATTERABLE)) {
			return GLASS;
		}
		if (state.is(BlockTags.LEAVES) || state.is(BlockTags.WOOL) || state.is(BlockTags.SNOW)) {
			return SOFT;
		}
		if (state.is(BlockTags.LOGS) || state.is(BlockTags.PLANKS)) {
			return WOOD;
		}
		SoundType s = state.getSoundType();
		if (s == SoundType.METAL || s == SoundType.ANVIL || s == SoundType.CHAIN || s == SoundType.COPPER || s == SoundType.NETHERITE_BLOCK
			|| s == SoundType.LANTERN || s == SoundType.HEAVY_CORE || s == SoundType.COPPER_BULB || s == SoundType.COPPER_GRATE) {
			return METAL;
		}
		if (s == SoundType.WOOD || s == SoundType.BAMBOO_WOOD || s == SoundType.CHERRY_WOOD || s == SoundType.NETHER_WOOD
			|| s == SoundType.LADDER || s == SoundType.SCAFFOLDING) {
			return WOOD;
		}
		if (s == SoundType.GLASS || s == SoundType.AMETHYST || s == SoundType.AMETHYST_CLUSTER) {
			return GLASS;
		}
		if (s == SoundType.SAND || s == SoundType.SUSPICIOUS_SAND || s == SoundType.SUSPICIOUS_GRAVEL || s == SoundType.GRAVEL) {
			return SAND;
		}
		if (s == SoundType.GRASS || s == SoundType.ROOTED_DIRT || s == SoundType.MUD || s == SoundType.PACKED_MUD || s == SoundType.MOSS
			|| s == SoundType.MOSS_CARPET || s == SoundType.SOUL_SOIL || s == SoundType.SOUL_SAND || s == SoundType.WART_BLOCK) {
			return DIRT;
		}
		if (s == SoundType.WOOL || s == SoundType.SNOW || s == SoundType.POWDER_SNOW || s == SoundType.SLIME_BLOCK
			|| s == SoundType.HONEY_BLOCK || s == SoundType.AZALEA_LEAVES || s == SoundType.CHERRY_LEAVES) {
			return SOFT;
		}
		return STONE;
	}

	public boolean hard() {
		return this == STONE || this == METAL;
	}
}
