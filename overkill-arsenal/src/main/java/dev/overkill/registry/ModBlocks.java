package dev.overkill.registry;

import dev.overkill.OverkillArsenal;
import dev.overkill.block.AshLayerBlock;
import dev.overkill.block.MoltenRockBlock;
import dev.overkill.block.ScorchedStoneBlock;
import dev.overkill.block.SmolderingAshBlock;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.item.BlockItem;
import net.minecraft.world.item.Item;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.SoundType;
import net.minecraft.world.level.block.state.BlockBehaviour;
import net.minecraft.world.level.material.MapColor;
import net.minecraft.world.level.material.PushReaction;

import java.util.function.Function;

/** Aftermath blocks the weapons leave behind. */
public final class ModBlocks {
	public static final Block SCORCHED_STONE = register("scorched_stone", ScorchedStoneBlock::new, BlockBehaviour.Properties.of()
		.mapColor(MapColor.COLOR_BLACK)
		.strength(1.5F, 6.0F)
		.requiresCorrectToolForDrops()
		.sound(SoundType.BASALT)
		.lightLevel(state -> state.getValue(ScorchedStoneBlock.HOT) ? 3 : 0));

	public static final Block MOLTEN_ROCK = register("molten_rock", MoltenRockBlock::new, BlockBehaviour.Properties.of()
		.mapColor(MapColor.FIRE)
		.strength(1.2F, 6.0F)
		.requiresCorrectToolForDrops()
		.sound(SoundType.NETHERRACK)
		.lightLevel(state -> 12)
		.randomTicks()
		.emissiveRendering((state, level, pos) -> true)
		.hasPostProcess((state, level, pos) -> true)
		.isValidSpawn((state, level, pos, type) -> type.fireImmune()));

	public static final Block SMOLDERING_ASH = register("smoldering_ash", SmolderingAshBlock::new, BlockBehaviour.Properties.of()
		.mapColor(MapColor.COLOR_GRAY)
		.strength(0.1F)
		.sound(SoundType.SAND)
		.noOcclusion()
		.replaceable()
		.randomTicks()
		.lightLevel(state -> 4)
		.pushReaction(PushReaction.DESTROY));

	public static final Block ASH_LAYER = register("ash_layer", AshLayerBlock::new, BlockBehaviour.Properties.of()
		.mapColor(MapColor.COLOR_LIGHT_GRAY)
		.strength(0.1F)
		.sound(SoundType.SAND)
		.noOcclusion()
		.replaceable()
		.pushReaction(PushReaction.DESTROY));

	private ModBlocks() {
	}

	private static Block register(String name, Function<BlockBehaviour.Properties, Block> factory, BlockBehaviour.Properties properties) {
		ResourceKey<Block> key = ResourceKey.create(Registries.BLOCK, OverkillArsenal.id(name));
		Block block = Registry.register(BuiltInRegistries.BLOCK, key, factory.apply(properties.setId(key)));
		ResourceKey<Item> itemKey = ResourceKey.create(Registries.ITEM, OverkillArsenal.id(name));
		Registry.register(BuiltInRegistries.ITEM, itemKey, new BlockItem(block, new Item.Properties().setId(itemKey).useBlockDescriptionPrefix()));
		return block;
	}

	public static void init() {
	}
}
