package com.jjkshowdown.registry;

import com.jjkshowdown.JjkShowdown;
import com.jjkshowdown.block.DomainBlock;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.SoundType;
import net.minecraft.world.level.block.state.BlockBehaviour;
import net.minecraft.world.level.material.MapColor;
import net.minecraft.world.level.material.PushReaction;

import java.util.function.Function;

public final class ModBlocks {
	public static final Block UNLIMITED_VOID_BARRIER = reg("unlimited_void_barrier", DomainBlock::new,
			domain().mapColor(MapColor.COLOR_BLACK).lightLevel(s -> 11).sound(SoundType.AMETHYST).emissiveRendering((s, l, p) -> true));
	public static final Block VOID_FLOOR = reg("void_floor", DomainBlock::new,
			domain().mapColor(MapColor.COLOR_BLACK).lightLevel(s -> 7).sound(SoundType.GLASS).emissiveRendering((s, l, p) -> true));
	public static final Block SHRINE_PILLAR = reg("shrine_pillar", DomainBlock::new,
			domain().mapColor(MapColor.CRIMSON_STEM).sound(SoundType.NETHER_WOOD).lightLevel(s -> 2));
	public static final Block SHRINE_ROOF = reg("shrine_roof", DomainBlock::new,
			domain().mapColor(MapColor.COLOR_BLACK).sound(SoundType.DEEPSLATE_TILES));
	public static final Block SHRINE_BONE = reg("shrine_bone", DomainBlock::new,
			domain().mapColor(MapColor.SAND).sound(SoundType.BONE_BLOCK).lightLevel(s -> 3));
	public static final Block CURSED_BLOOD = reg("cursed_blood", DomainBlock::new,
			domain().mapColor(MapColor.COLOR_RED).sound(SoundType.HONEY_BLOCK).speedFactor(0.55f).jumpFactor(0.8f).lightLevel(s -> 4).emissiveRendering((s, l, p) -> true));

	private ModBlocks() {
	}

	private static BlockBehaviour.Properties domain() {
		return BlockBehaviour.Properties.of()
				.strength(-1.0f, 3600000.0f)
				.noLootTable()
				.pushReaction(PushReaction.BLOCK)
				.isValidSpawn((s, l, p, t) -> false);
	}

	private static Block reg(String name, Function<BlockBehaviour.Properties, Block> factory, BlockBehaviour.Properties props) {
		ResourceKey<Block> key = ResourceKey.create(Registries.BLOCK, JjkShowdown.id(name));
		return Registry.register(BuiltInRegistries.BLOCK, key, factory.apply(props.setId(key)));
	}

	public static boolean isDomainBlock(Block b) {
		return b instanceof DomainBlock;
	}

	public static void init() {
	}
}
