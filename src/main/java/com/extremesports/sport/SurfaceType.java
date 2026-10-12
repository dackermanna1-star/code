package com.extremesports.sport;

import com.extremesports.block.ParkSurface;
import com.extremesports.registry.ModTags;
import net.minecraft.tags.BlockTags;
import net.minecraft.world.level.block.SoundType;
import net.minecraft.world.level.block.state.BlockState;

/**
 * How a ground material affects rolling. Rough multipliers are scaled per equipment by
 * {@link HandlingProfile#roughHandling()}, so BMX tyres shrug off dirt while skateboard wheels bog down.
 */
public enum SurfaceType {
	//         rolling grip  rough  bumpiness sound
	SMOOTH(1.00F, 1.00F, false, 0.00F, RollSound.CONCRETE),
	STONE(1.25F, 1.00F, false, 0.15F, RollSound.CONCRETE),
	ROUGH_STONE(1.9F, 0.95F, true, 0.45F, RollSound.ROUGH),
	WOOD(1.08F, 1.00F, false, 0.05F, RollSound.WOOD),
	METAL(0.92F, 0.90F, false, 0.05F, RollSound.CONCRETE),
	GLASS(0.90F, 0.85F, false, 0.00F, RollSound.CONCRETE),
	PACKED_DIRT(2.4F, 1.00F, true, 0.30F, RollSound.ROUGH),
	GRASS(4.2F, 0.90F, true, 0.60F, RollSound.ROUGH),
	GRAVEL(5.0F, 0.80F, true, 0.90F, RollSound.ROUGH),
	SAND(8.5F, 0.70F, true, 0.40F, RollSound.ROUGH),
	SNOW(4.0F, 0.55F, true, 0.25F, RollSound.ROUGH),
	ICE(0.35F, 0.12F, false, 0.00F, RollSound.CONCRETE),
	SOFT(3.2F, 0.90F, true, 0.10F, RollSound.ROUGH),
	STICKY(7.0F, 1.00F, true, 0.20F, RollSound.ROUGH);

	public final float rolling;
	public final float grip;
	public final boolean rough;
	public final float bumpiness;
	public final RollSound rollSound;

	SurfaceType(float rolling, float grip, boolean rough, float bumpiness, RollSound rollSound) {
		this.rolling = rolling;
		this.grip = grip;
		this.rough = rough;
		this.bumpiness = bumpiness;
		this.rollSound = rollSound;
	}

	/** Rolling resistance multiplier after applying the equipment's off-road ability. */
	public float rollingFor(HandlingProfile handling) {
		if (!rough) {
			return rolling;
		}
		return 1.0F + (rolling - 1.0F) * handling.roughHandling();
	}

	public enum RollSound {
		CONCRETE,
		WOOD,
		ROUGH
	}

	public static SurfaceType classify(BlockState state) {
		if (state.isAir()) {
			return SMOOTH;
		}
		if (state.getBlock() instanceof ParkSurface parkSurface) {
			return parkSurface.surfaceType(state);
		}
		if (state.is(BlockTags.ICE)) {
			return ICE;
		}
		if (state.is(ModTags.SMOOTH_SURFACES)) {
			return SMOOTH;
		}
		if (state.is(ModTags.ROUGH_SURFACES)) {
			return ROUGH_STONE;
		}
		if (state.is(BlockTags.SAND)) {
			return SAND;
		}
		if (state.is(BlockTags.SNOW)) {
			return SNOW;
		}
		SoundType sound = state.getSoundType();
		if (sound == SoundType.GRASS || sound == SoundType.ROOTED_DIRT || sound == SoundType.MOSS || sound == SoundType.AZALEA) {
			return GRASS;
		}
		if (sound == SoundType.GRAVEL) {
			return GRAVEL;
		}
		if (sound == SoundType.SAND || sound == SoundType.SUSPICIOUS_SAND) {
			return SAND;
		}
		if (sound == SoundType.SNOW || sound == SoundType.POWDER_SNOW) {
			return SNOW;
		}
		if (sound == SoundType.WOOD || sound == SoundType.NETHER_WOOD || sound == SoundType.BAMBOO_WOOD || sound == SoundType.CHERRY_WOOD) {
			return WOOD;
		}
		if (sound == SoundType.METAL || sound == SoundType.COPPER || sound == SoundType.NETHERITE_BLOCK || sound == SoundType.ANVIL || sound == SoundType.CHAIN) {
			return METAL;
		}
		if (sound == SoundType.GLASS) {
			return GLASS;
		}
		if (sound == SoundType.WOOL || sound == SoundType.MOSS_CARPET) {
			return SOFT;
		}
		if (sound == SoundType.MUD || sound == SoundType.SOUL_SAND || sound == SoundType.SOUL_SOIL || sound == SoundType.HONEY_BLOCK || sound == SoundType.SLIME_BLOCK) {
			return STICKY;
		}
		if (sound == SoundType.PACKED_MUD || sound == SoundType.MUD_BRICKS) {
			return PACKED_DIRT;
		}
		return STONE;
	}
}
