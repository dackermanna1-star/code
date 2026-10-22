package com.ordnance.registry;

import com.ordnance.Ordnance;
import com.ordnance.fire.AshLayerBlock;
import com.ordnance.fire.BurningFuelBlock;
import com.ordnance.fire.CharredLogBlock;
import com.ordnance.fire.ScorchedEarthBlock;
import java.util.function.Function;
import net.fabricmc.fabric.api.registry.FlammableBlockRegistry;
import net.minecraft.block.AbstractBlock;
import net.minecraft.block.Block;
import net.minecraft.block.MapColor;
import net.minecraft.block.piston.PistonBehavior;
import net.minecraft.registry.Registries;
import net.minecraft.registry.Registry;
import net.minecraft.registry.RegistryKey;
import net.minecraft.registry.RegistryKeys;
import net.minecraft.sound.BlockSoundGroup;

public final class ModBlocks {
	public static final Block SCORCHED_EARTH = register(
		"scorched_earth", ScorchedEarthBlock::new, AbstractBlock.Settings.create().mapColor(MapColor.BLACK).strength(0.5F).sounds(BlockSoundGroup.GRAVEL).ticksRandomly()
	);
	public static final Block CHARRED_LOG = register(
		"charred_log", CharredLogBlock::new, AbstractBlock.Settings.create().mapColor(MapColor.BLACK).strength(1.2F).sounds(BlockSoundGroup.WOOD).burnable()
	);
	public static final Block ASH_LAYER = register(
		"ash_layer",
		AshLayerBlock::new,
		AbstractBlock.Settings.create().mapColor(MapColor.GRAY).replaceable().noCollision().breakInstantly().sounds(BlockSoundGroup.SAND).pistonBehavior(PistonBehavior.DESTROY)
	);
	public static final Block BURNING_FUEL = register(
		"burning_fuel",
		BurningFuelBlock::new,
		AbstractBlock.Settings.create()
			.mapColor(MapColor.BRIGHT_RED)
			.replaceable()
			.noCollision()
			.breakInstantly()
			.luminance(state -> 15)
			.sounds(BlockSoundGroup.WOOL)
			.pistonBehavior(PistonBehavior.DESTROY)
			.dropsNothing()
	);

	private ModBlocks() {
	}

	private static Block register(String name, Function<AbstractBlock.Settings, Block> factory, AbstractBlock.Settings settings) {
		RegistryKey<Block> key = RegistryKey.of(RegistryKeys.BLOCK, Ordnance.id(name));
		return Registry.register(Registries.BLOCK, key, factory.apply(settings.registryKey(key)));
	}

	public static void init() {
		FlammableBlockRegistry.getDefaultInstance().add(CHARRED_LOG, 5, 5);
	}
}
