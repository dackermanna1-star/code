package com.godforge.destruction;

import com.godforge.registry.ModBlocks;
import com.godforge.util.Noise;
import net.minecraft.core.BlockPos;
import net.minecraft.tags.BlockTags;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.material.Fluids;

/** Material palettes used to scorch, line and transform terrain. */
public enum Palette {
	/** Leaves the original block. */
	NONE,
	/** Impact-heated rock: basalt, blackstone, magma, obsidian, coarse dirt. */
	SCORCHED,
	/** Hotter than scorched: more magma and obsidian. */
	MOLTEN,
	/** Glassy fused surface left by beams and stars. */
	GLASSED,
	/** Shattered stone with glowing fissures (Godfist). */
	KINETIC,
	/** Blocks bled in from other dimensions (Reality Breaker). */
	DIMENSIONAL,
	/** Apocalyptic wasteland (Planet Cracker / Sunforge). */
	WASTELAND,
	/** Black, crushed matter (Black Hole). */
	COMPRESSED;

	/** Picks a lining block for a position; returns null to leave the block unchanged. */
	public BlockState pick(BlockState original, BlockPos pos, long seed) {
		float r = Noise.hash01(seed, pos.getX(), pos.getY(), pos.getZ());
		switch (this) {
			case NONE:
				return null;
			case SCORCHED:
				if (r < 0.30F) return Blocks.BASALT.defaultBlockState();
				if (r < 0.55F) return Blocks.BLACKSTONE.defaultBlockState();
				if (r < 0.70F) return Blocks.MAGMA_BLOCK.defaultBlockState();
				if (r < 0.80F) return Blocks.OBSIDIAN.defaultBlockState();
				return Blocks.COARSE_DIRT.defaultBlockState();
			case MOLTEN:
				if (r < 0.35F) return Blocks.MAGMA_BLOCK.defaultBlockState();
				if (r < 0.60F) return Blocks.OBSIDIAN.defaultBlockState();
				if (r < 0.80F) return Blocks.BLACKSTONE.defaultBlockState();
				if (r < 0.97F) return Blocks.BASALT.defaultBlockState();
				return Blocks.CRYING_OBSIDIAN.defaultBlockState();
			case GLASSED:
				if (original.is(BlockTags.SAND)) return r < 0.7F ? Blocks.GLASS.defaultBlockState() : Blocks.TINTED_GLASS.defaultBlockState();
				if (r < 0.25F) return Blocks.OBSIDIAN.defaultBlockState();
				if (r < 0.50F) return Blocks.MAGMA_BLOCK.defaultBlockState();
				if (r < 0.65F) return Blocks.TINTED_GLASS.defaultBlockState();
				return Blocks.SMOOTH_BASALT.defaultBlockState();
			case KINETIC:
				if (r < 0.10F) return ModBlocks.KINETIC_FRACTURE.defaultBlockState();
				if (r < 0.40F) return Blocks.COBBLED_DEEPSLATE.defaultBlockState();
				if (r < 0.60F) return Blocks.TUFF.defaultBlockState();
				if (r < 0.80F) return Blocks.GRAVEL.defaultBlockState();
				return Blocks.COBBLESTONE.defaultBlockState();
			case DIMENSIONAL: {
				// low-frequency noise makes contiguous "bleed" patches instead of salt-and-pepper
				float patch = (Noise.noise3(seed, pos.getX() * 0.15, pos.getY() * 0.15, pos.getZ() * 0.15) + 1.0F) * 0.5F;
				if (patch < 0.18F) return Blocks.END_STONE.defaultBlockState();
				if (patch < 0.30F) return Blocks.PURPUR_BLOCK.defaultBlockState();
				if (patch < 0.42F) return Blocks.CRYING_OBSIDIAN.defaultBlockState();
				if (patch < 0.54F) return Blocks.AMETHYST_BLOCK.defaultBlockState();
				if (patch < 0.66F) return Blocks.WARPED_NYLIUM.defaultBlockState();
				if (patch < 0.78F) return Blocks.SCULK.defaultBlockState();
				if (patch < 0.90F) return Blocks.NETHERRACK.defaultBlockState();
				return Blocks.OBSIDIAN.defaultBlockState();
			}
			case WASTELAND:
				if (r < 0.40F) return Blocks.NETHERRACK.defaultBlockState();
				if (r < 0.55F) return Blocks.MAGMA_BLOCK.defaultBlockState();
				if (r < 0.70F) return Blocks.BASALT.defaultBlockState();
				if (r < 0.85F) return Blocks.BLACKSTONE.defaultBlockState();
				if (r < 0.95F) return Blocks.COARSE_DIRT.defaultBlockState();
				return Blocks.SOUL_SOIL.defaultBlockState();
			case COMPRESSED:
				if (r < 0.45F) return Blocks.OBSIDIAN.defaultBlockState();
				if (r < 0.70F) return Blocks.BLACKSTONE.defaultBlockState();
				if (r < 0.90F) return Blocks.DEEPSLATE.defaultBlockState();
				return Blocks.CRYING_OBSIDIAN.defaultBlockState();
			default:
				return null;
		}
	}

	/**
	 * Surface transformation used for heat/fire weapons: returns the replacement for a surface block,
	 * {@code AIR} to burn it away, or null to leave it.
	 */
	public static BlockState scorchSurface(BlockState state, BlockPos pos, long seed, boolean wasteland) {
		if (state.isAir()) {
			return null;
		}
		float r = Noise.hash01(seed, pos.getX(), pos.getY(), pos.getZ());
		if (state.getFluidState().is(Fluids.WATER) && state.getFluidState().isSource()) {
			return Blocks.AIR.defaultBlockState(); // boiled away
		}
		if (state.is(Blocks.SNOW) || state.is(BlockTags.ICE) || state.is(Blocks.SNOW_BLOCK) || state.is(Blocks.POWDER_SNOW)) {
			return Blocks.AIR.defaultBlockState();
		}
		if (state.is(BlockTags.LEAVES) || state.is(BlockTags.REPLACEABLE_BY_TREES) || state.is(BlockTags.FLOWERS) || state.is(BlockTags.REPLACEABLE)) {
			return Blocks.AIR.defaultBlockState();
		}
		if (state.is(BlockTags.LOGS)) {
			return r < 0.5F ? Blocks.AIR.defaultBlockState() : Blocks.BASALT.defaultBlockState();
		}
		if (state.is(BlockTags.DIRT) || state.is(Blocks.GRASS_BLOCK) || state.is(Blocks.DIRT_PATH) || state.is(Blocks.FARMLAND)) {
			if (wasteland) {
				return WASTELAND.pick(state, pos, seed);
			}
			return r < 0.6F ? Blocks.COARSE_DIRT.defaultBlockState() : Blocks.NETHERRACK.defaultBlockState();
		}
		if (state.is(BlockTags.SAND)) {
			return r < 0.6F ? Blocks.GLASS.defaultBlockState() : (wasteland ? Blocks.SOUL_SAND.defaultBlockState() : Blocks.SANDSTONE.defaultBlockState());
		}
		if (state.is(BlockTags.BASE_STONE_OVERWORLD) || state.is(Blocks.COBBLESTONE) || state.is(Blocks.GRAVEL)) {
			if (wasteland) {
				return WASTELAND.pick(state, pos, seed);
			}
			return r < 0.15F ? Blocks.MAGMA_BLOCK.defaultBlockState() : (r < 0.55F ? Blocks.BLACKSTONE.defaultBlockState() : Blocks.BASALT.defaultBlockState());
		}
		return null;
	}

	/** Dimension-bleed transformation applied around rifts. */
	public static BlockState bleed(BlockState state, BlockPos pos, long seed) {
		if (state.isAir() || !state.isSolid()) {
			return state.is(BlockTags.REPLACEABLE) || state.is(BlockTags.FLOWERS) ? Blocks.AIR.defaultBlockState() : null;
		}
		if (state.is(BlockTags.DIRT) || state.is(BlockTags.BASE_STONE_OVERWORLD) || state.is(BlockTags.SAND) || state.is(Blocks.GRASS_BLOCK)
			|| state.is(Blocks.GRAVEL) || state.is(BlockTags.TERRACOTTA) || state.is(BlockTags.LEAVES) || state.is(BlockTags.LOGS)) {
			return DIMENSIONAL.pick(state, pos, seed);
		}
		return null;
	}
}
