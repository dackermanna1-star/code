package net.abyssaldescent.registry;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Function;
import net.abyssaldescent.AbyssalDescent;
import net.abyssaldescent.block.AbyssalGateBlock;
import net.abyssaldescent.block.AltarOfTrialsBlock;
import net.abyssaldescent.block.BurialUrnBlock;
import net.abyssaldescent.block.CrumblingWallBlock;
import net.abyssaldescent.block.CursedIdolBlock;
import net.abyssaldescent.block.DartTrapBlock;
import net.abyssaldescent.block.DescentRiftBlock;
import net.abyssaldescent.block.ReliquaryBlock;
import net.abyssaldescent.block.RuneStoneBlock;
import net.abyssaldescent.block.RunicSealBlock;
import net.abyssaldescent.block.SoulBrazierBlock;
import net.abyssaldescent.block.SpikeTrapBlock;
import net.abyssaldescent.block.WaystoneBlock;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.SoundType;
import net.minecraft.world.level.block.state.BlockBehaviour;
import net.minecraft.world.level.material.MapColor;
import net.minecraft.world.level.material.PushReaction;

public final class ModBlocks {
	/** Blocks that get a block item (creative tab + /give). */
	public static final List<Block> WITH_ITEMS = new ArrayList<>();

	public static final Block ABYSSAL_GATE = register("abyssal_gate", AbyssalGateBlock::new, BlockBehaviour.Properties.of()
		.mapColor(MapColor.COLOR_BLACK).strength(6.0F, 1200.0F).requiresCorrectToolForDrops().lightLevel(s -> 11).sound(SoundType.DEEPSLATE_BRICKS)
		.noOcclusion());
	public static final Block DESCENT_RIFT = register("descent_rift", DescentRiftBlock::new, unbreakable()
		.mapColor(MapColor.COLOR_PURPLE).lightLevel(s -> 12).sound(SoundType.AMETHYST));
	public static final Block WAYSTONE = register("waystone", WaystoneBlock::new, unbreakable()
		.mapColor(MapColor.COLOR_LIGHT_BLUE).lightLevel(s -> 13).sound(SoundType.DEEPSLATE_TILES).noOcclusion());
	public static final Block RUNIC_SEAL = register("runic_seal", RunicSealBlock::new, unbreakable()
		.mapColor(MapColor.COLOR_LIGHT_BLUE).lightLevel(s -> 9).sound(SoundType.AMETHYST).noOcclusion()
		.isSuffocating((s, l, p) -> false).isViewBlocking((s, l, p) -> false));
	public static final Block SPIKE_TRAP = register("spike_trap", SpikeTrapBlock::new, unbreakable()
		.mapColor(MapColor.STONE).sound(SoundType.METAL).noOcclusion().noCollision());
	public static final Block DART_TRAP = register("dart_trap", DartTrapBlock::new, unbreakable()
		.mapColor(MapColor.STONE).sound(SoundType.STONE));
	public static final Block CRUMBLING_STONE_BRICKS = register("crumbling_stone_bricks", CrumblingWallBlock::new, BlockBehaviour.Properties.of()
		.mapColor(MapColor.STONE).strength(1.0F, 0.0F).sound(SoundType.STONE).noLootTable());
	public static final Block RELIQUARY = register("reliquary", ReliquaryBlock::new, unbreakable()
		.mapColor(MapColor.GOLD).lightLevel(s -> s.getValue(ReliquaryBlock.OPEN) ? 4 : 7).sound(SoundType.DEEPSLATE_BRICKS).noOcclusion());
	public static final Block BURIAL_URN = register("burial_urn", BurialUrnBlock::new, BlockBehaviour.Properties.of()
		.mapColor(MapColor.TERRACOTTA_BROWN).instabreak().sound(SoundType.DECORATED_POT).noOcclusion().pushReaction(PushReaction.DESTROY));
	public static final Block ALTAR_OF_TRIALS = register("altar_of_trials", AltarOfTrialsBlock::new, unbreakable()
		.mapColor(MapColor.COLOR_RED).lightLevel(s -> s.getValue(AltarOfTrialsBlock.USED) ? 2 : 9).sound(SoundType.DEEPSLATE_BRICKS).noOcclusion());
	public static final Block CURSED_IDOL = register("cursed_idol", CursedIdolBlock::new, unbreakable()
		.mapColor(MapColor.COLOR_PURPLE).lightLevel(s -> s.getValue(CursedIdolBlock.USED) ? 1 : 8).sound(SoundType.DEEPSLATE).noOcclusion());
	public static final Block SOUL_BRAZIER = register("soul_brazier", SoulBrazierBlock::new, BlockBehaviour.Properties.of()
		.mapColor(MapColor.METAL).strength(3.0F, 6.0F).lightLevel(s -> 15).sound(SoundType.CHAIN).noOcclusion());
	public static final Block RUNE_STONE = register("rune_stone", RuneStoneBlock::new, BlockBehaviour.Properties.of()
		.mapColor(MapColor.TERRACOTTA_CYAN).strength(2.0F, 6.0F).lightLevel(s -> 6).sound(SoundType.TUFF));

	private ModBlocks() {
	}

	private static BlockBehaviour.Properties unbreakable() {
		return BlockBehaviour.Properties.of().strength(-1.0F, 3_600_000.0F).noLootTable().pushReaction(PushReaction.BLOCK);
	}

	private static Block register(String name, Function<BlockBehaviour.Properties, Block> factory, BlockBehaviour.Properties properties) {
		ResourceKey<Block> key = ResourceKey.create(Registries.BLOCK, AbyssalDescent.id(name));
		Block block = factory.apply(properties.setId(key));
		WITH_ITEMS.add(block);
		return Registry.register(BuiltInRegistries.BLOCK, key, block);
	}

	public static void init() {
	}
}
