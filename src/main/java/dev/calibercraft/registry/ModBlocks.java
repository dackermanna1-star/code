package dev.calibercraft.registry;

import dev.calibercraft.CaliberCraft;
import dev.calibercraft.block.GunsmithBenchBlock;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.SoundType;
import net.minecraft.world.level.block.state.BlockBehaviour;
import net.minecraft.world.level.block.state.properties.NoteBlockInstrument;
import net.minecraft.world.level.material.MapColor;

public final class ModBlocks {
	public static final Block GUNSMITH_BENCH = register("gunsmith_bench", BlockBehaviour.Properties.of()
		.mapColor(MapColor.WOOD).instrument(NoteBlockInstrument.BASS).strength(2.5F).sound(SoundType.WOOD));

	private ModBlocks() {
	}

	private static Block register(String name, BlockBehaviour.Properties props) {
		ResourceKey<Block> key = ResourceKey.create(Registries.BLOCK, CaliberCraft.id(name));
		return Registry.register(BuiltInRegistries.BLOCK, key, new GunsmithBenchBlock(props.setId(key)));
	}

	public static void init() {
	}
}
