package com.blademode.block;

import java.util.Locale;
import net.minecraft.util.StringRepresentable;
import net.minecraft.world.level.block.SoundType;

/** Sound family of a cut block; stored in its block state because sounds cannot depend on block entities. */
public enum CutSound implements StringRepresentable {
	STONE(SoundType.STONE),
	DEEPSLATE(SoundType.DEEPSLATE),
	WOOD(SoundType.WOOD),
	CHERRY_WOOD(SoundType.CHERRY_WOOD),
	BAMBOO_WOOD(SoundType.BAMBOO_WOOD),
	NETHER_WOOD(SoundType.NETHER_WOOD),
	STEM(SoundType.STEM),
	GRASS(SoundType.GRASS),
	GRAVEL(SoundType.GRAVEL),
	SAND(SoundType.SAND),
	SNOW(SoundType.SNOW),
	METAL(SoundType.METAL),
	COPPER(SoundType.COPPER),
	GLASS(SoundType.GLASS),
	WOOL(SoundType.WOOL),
	ROOTED_DIRT(SoundType.ROOTED_DIRT),
	MUD(SoundType.MUD),
	NETHERRACK(SoundType.NETHERRACK),
	NETHER_BRICKS(SoundType.NETHER_BRICKS),
	BASALT(SoundType.BASALT),
	TUFF(SoundType.TUFF),
	CALCITE(SoundType.CALCITE),
	AMETHYST(SoundType.AMETHYST),
	MOSS(SoundType.MOSS),
	AZALEA_LEAVES(SoundType.AZALEA_LEAVES),
	CHERRY_LEAVES(SoundType.CHERRY_LEAVES),
	SCULK(SoundType.SCULK),
	MUD_BRICKS(SoundType.MUD_BRICKS),
	NETHERITE_BLOCK(SoundType.NETHERITE_BLOCK),
	BONE_BLOCK(SoundType.BONE_BLOCK),
	CORAL_BLOCK(SoundType.CORAL_BLOCK),
	ANCIENT_DEBRIS(SoundType.ANCIENT_DEBRIS),
	POLISHED_DEEPSLATE(SoundType.POLISHED_DEEPSLATE),
	DEEPSLATE_BRICKS(SoundType.DEEPSLATE_BRICKS),
	DEEPSLATE_TILES(SoundType.DEEPSLATE_TILES);

	public final SoundType sound;
	private final String name;

	CutSound(SoundType sound) {
		this.sound = sound;
		this.name = this.name().toLowerCase(Locale.ROOT);
	}

	public static CutSound of(SoundType type) {
		for (CutSound s : values()) {
			if (s.sound == type) {
				return s;
			}
		}
		return STONE;
	}

	@Override
	public String getSerializedName() {
		return this.name;
	}
}
