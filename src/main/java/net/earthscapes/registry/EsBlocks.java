package net.earthscapes.registry;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.function.Function;
import net.earthscapes.Earthscapes;
import net.earthscapes.block.EpiphyteBlock;
import net.earthscapes.block.EsFlowerBlock;
import net.earthscapes.block.EsPlantBlock;
import net.earthscapes.block.EsSaplingBlock;
import net.earthscapes.block.EsTags;
import net.earthscapes.block.EsTallPlantBlock;
import net.earthscapes.block.HangingFruitBlock;
import net.earthscapes.block.LianaBlock;
import net.earthscapes.block.SandLayerBlock;
import net.earthscapes.block.VictoriaLilyPadBlock;
import net.minecraft.core.Direction;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.util.ColorRGBA;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.ColoredFallingBlock;
import net.minecraft.world.level.block.FenceBlock;
import net.minecraft.world.level.block.FenceGateBlock;
import net.minecraft.world.level.block.RotatedPillarBlock;
import net.minecraft.world.level.block.SandBlock;
import net.minecraft.world.level.block.SlabBlock;
import net.minecraft.world.level.block.SoundType;
import net.minecraft.world.level.block.StairBlock;
import net.minecraft.world.level.block.TintedParticleLeavesBlock;
import net.minecraft.world.level.block.grower.TreeGrower;
import net.minecraft.world.level.block.state.BlockBehaviour;
import net.minecraft.world.level.block.state.properties.NoteBlockInstrument;
import net.minecraft.world.level.block.state.properties.WoodType;
import net.minecraft.world.level.levelgen.feature.ConfiguredFeature;
import net.minecraft.world.level.material.MapColor;
import net.minecraft.world.level.material.PushReaction;

public final class EsBlocks {
	/** Every block in registration order; drives item registration and the creative tab. */
	public static final List<Block> ALL = new ArrayList<>();
	public static final List<Block> CUTOUT = new ArrayList<>();
	public static final List<WoodSet> WOOD_SETS = new ArrayList<>();

	// ---------------------------------------------------------------- African savanna
	public static final Block TALL_GOLDEN_GRASS = cutout(register("tall_golden_grass", p -> new EsTallPlantBlock(EsTags.GRASS_SOIL, p), tallPlant(MapColor.COLOR_YELLOW)));
	public static final Block GOLDEN_GRASS = cutout(register("golden_grass", p -> new EsPlantBlock(EsTags.GRASS_SOIL, 13.0, () -> EsBlocks.TALL_GOLDEN_GRASS, p), shortPlant(MapColor.COLOR_YELLOW)));
	public static final Block RED_OAT_GRASS = cutout(register("red_oat_grass", p -> new EsTallPlantBlock(EsTags.GRASS_SOIL, p), tallPlant(MapColor.TERRACOTTA_ORANGE)));
	public static final Block UMBRELLA_THORN_LEAVES = register("umbrella_thorn_leaves", p -> new TintedParticleLeavesBlock(0.01F, p), leaves(MapColor.PLANT));
	public static final Block UMBRELLA_THORN_SAPLING = cutout(register("umbrella_thorn_sapling",
		p -> new EsSaplingBlock(grower("umbrella_thorn"), EsTags.GRASS_SOIL, p), sapling()));
	public static final Block THORNBUSH_LEAVES = register("thornbush_leaves", p -> new TintedParticleLeavesBlock(0.01F, p), leaves(MapColor.COLOR_GREEN));
	public static final WoodSet BAOBAB = wood("baobab", MapColor.TERRACOTTA_PINK, MapColor.TERRACOTTA_LIGHT_GRAY, MapColor.PLANT, EsTags.GRASS_SOIL);
	public static final Block FEVER_TREE_LOG = register("fever_tree_log", RotatedPillarBlock::new, log(MapColor.COLOR_YELLOW, MapColor.COLOR_LIGHT_GREEN));
	public static final Block FEVER_TREE_WOOD = register("fever_tree_wood", RotatedPillarBlock::new, log(MapColor.COLOR_LIGHT_GREEN, MapColor.COLOR_LIGHT_GREEN));
	public static final Block FEVER_TREE_LEAVES = register("fever_tree_leaves", p -> new TintedParticleLeavesBlock(0.01F, p), leaves(MapColor.PLANT));
	public static final Block FEVER_TREE_SAPLING = cutout(register("fever_tree_sapling",
		p -> new EsSaplingBlock(grower("fever_tree"), EsTags.GRASS_SOIL, p), sapling()));
	public static final Block EUPHORBIA = register("euphorbia", RotatedPillarBlock::new,
		BlockBehaviour.Properties.of().mapColor(MapColor.PLANT).strength(0.8F).sound(SoundType.WOOL).pushReaction(PushReaction.DESTROY));
	public static final Block LATERITE = register("laterite", Block::new,
		BlockBehaviour.Properties.of().mapColor(MapColor.TERRACOTTA_RED).strength(0.7F).sound(SoundType.GRAVEL));
	public static final Block TERMITE_MOUND = register("termite_mound", Block::new,
		BlockBehaviour.Properties.of().mapColor(MapColor.TERRACOTTA_ORANGE).instrument(NoteBlockInstrument.BASEDRUM).strength(1.2F, 3.0F).sound(SoundType.PACKED_MUD));
	public static final Block KOPJE_GRANITE = register("kopje_granite", Block::new,
		BlockBehaviour.Properties.of().mapColor(MapColor.TERRACOTTA_WHITE).instrument(NoteBlockInstrument.BASEDRUM).requiresCorrectToolForDrops().strength(1.5F, 6.0F));

	// ---------------------------------------------------------------- Sahara
	public static final Block SAHARA_SAND = register("sahara_sand", p -> new SandBlock(new ColorRGBA(0xFFD49A62), p),
		BlockBehaviour.Properties.of().mapColor(MapColor.TERRACOTTA_ORANGE).instrument(NoteBlockInstrument.SNARE).strength(0.5F).sound(SoundType.SAND));
	public static final Block SAHARA_SAND_LAYER = register("sahara_sand_layer", SandLayerBlock::new,
		BlockBehaviour.Properties.of().mapColor(MapColor.TERRACOTTA_ORANGE).replaceable().forceSolidOff().strength(0.3F).sound(SoundType.SAND)
			.isViewBlocking((state, level, pos) -> state.getValue(SandLayerBlock.LAYERS) >= 8).pushReaction(PushReaction.DESTROY));
	public static final Block SAHARA_SANDSTONE = register("sahara_sandstone", Block::new,
		BlockBehaviour.Properties.of().mapColor(MapColor.TERRACOTTA_ORANGE).instrument(NoteBlockInstrument.BASEDRUM).requiresCorrectToolForDrops().strength(0.8F));
	public static final Block HAMADA_STONE = register("hamada_stone", Block::new,
		BlockBehaviour.Properties.of().mapColor(MapColor.TERRACOTTA_BROWN).instrument(NoteBlockInstrument.BASEDRUM).requiresCorrectToolForDrops().strength(1.5F, 6.0F));
	public static final Block DESERT_PAVEMENT = register("desert_pavement", p -> new ColoredFallingBlock(new ColorRGBA(0xFF8A6B4E), p),
		BlockBehaviour.Properties.of().mapColor(MapColor.TERRACOTTA_BROWN).instrument(NoteBlockInstrument.SNARE).strength(0.6F).sound(SoundType.GRAVEL));
	public static final Block SALT_CRUST = register("salt_crust", Block::new,
		BlockBehaviour.Properties.of().mapColor(MapColor.SNOW).instrument(NoteBlockInstrument.BASEDRUM).strength(0.6F).sound(SoundType.CALCITE));
	public static final WoodSet DATE_PALM = wood("date_palm", MapColor.TERRACOTTA_YELLOW, MapColor.TERRACOTTA_BROWN, MapColor.PLANT, EsTags.DESERT_SOIL);
	public static final Block DATES = cutout(register("dates", p -> new HangingFruitBlock(() -> EsItems.DATE, p),
		BlockBehaviour.Properties.of().mapColor(MapColor.COLOR_ORANGE).noCollision().randomTicks().strength(0.2F).sound(SoundType.CROP).pushReaction(PushReaction.DESTROY)));
	public static final Block DRINN_GRASS = cutout(register("drinn_grass", p -> new EsPlantBlock(EsTags.DESERT_SOIL, 12.0, null, p), shortPlant(MapColor.COLOR_YELLOW)));

	// ---------------------------------------------------------------- Amazon rainforest
	public static final WoodSet KAPOK = wood("kapok", MapColor.TERRACOTTA_WHITE, MapColor.COLOR_LIGHT_GRAY, MapColor.PLANT, EsTags.GRASS_SOIL);
	public static final Block RAINFOREST_LEAVES = register("rainforest_leaves", p -> new TintedParticleLeavesBlock(0.01F, p), leaves(MapColor.PLANT));
	public static final Block CECROPIA_LOG = register("cecropia_log", RotatedPillarBlock::new, log(MapColor.QUARTZ, MapColor.COLOR_LIGHT_GRAY));
	public static final Block CECROPIA_LEAVES = register("cecropia_leaves", p -> new TintedParticleLeavesBlock(0.01F, p), leaves(MapColor.COLOR_LIGHT_GREEN));
	public static final Block ACAI_PALM_LOG = register("acai_palm_log", RotatedPillarBlock::new, log(MapColor.COLOR_GRAY, MapColor.COLOR_GRAY));
	public static final Block ACAI_PALM_LEAVES = register("acai_palm_leaves", p -> new TintedParticleLeavesBlock(0.01F, p), leaves(MapColor.PLANT));
	public static final Block BURITI_PALM_LEAVES = register("buriti_palm_leaves", p -> new TintedParticleLeavesBlock(0.01F, p), leaves(MapColor.PLANT));
	public static final Block HELICONIA = cutout(register("heliconia", p -> new EsTallPlantBlock(EsTags.GRASS_SOIL, p), tallPlant(MapColor.COLOR_RED)));
	public static final Block GIANT_TARO = cutout(register("giant_taro", p -> new EsTallPlantBlock(EsTags.GRASS_SOIL, p), tallPlant(MapColor.PLANT)));
	public static final Block BROMELIAD = cutout(register("bromeliad", EpiphyteBlock::new, shortPlant(MapColor.COLOR_RED).offsetType(BlockBehaviour.OffsetType.NONE)));
	public static final Block LIANA = cutout(register("liana", LianaBlock::new,
		BlockBehaviour.Properties.of().mapColor(MapColor.PLANT).noCollision().strength(0.2F).sound(SoundType.VINE).ignitedByLava().pushReaction(PushReaction.DESTROY)));
	public static final Block VICTORIA_LILY_PAD = cutout(register("victoria_lily_pad", VictoriaLilyPadBlock::new,
		BlockBehaviour.Properties.of().mapColor(MapColor.PLANT).instabreak().sound(SoundType.LILY_PAD).noOcclusion().pushReaction(PushReaction.DESTROY)));

	// ---------------------------------------------------------------- Mongolian steppe
	public static final Block FEATHER_GRASS = cutout(register("feather_grass", p -> new EsTallPlantBlock(EsTags.GRASS_SOIL, p), tallPlant(MapColor.QUARTZ)));
	public static final Block TALL_STEPPE_GRASS = cutout(register("tall_steppe_grass", p -> new EsTallPlantBlock(EsTags.GRASS_SOIL, p), tallPlant(MapColor.TERRACOTTA_RED)));
	public static final Block STEPPE_GRASS = cutout(register("steppe_grass", p -> new EsPlantBlock(EsTags.GRASS_SOIL, 11.0, () -> EsBlocks.TALL_STEPPE_GRASS, p), shortPlant(MapColor.TERRACOTTA_YELLOW)));
	public static final Block EDELWEISS = cutout(register("edelweiss", p -> new EsFlowerBlock(EsTags.GRASS_SOIL, MobEffects.SLOW_FALLING, 6.0F, p), flower(MapColor.SNOW)));
	public static final Block PASQUE_FLOWER = cutout(register("pasque_flower", p -> new EsFlowerBlock(EsTags.GRASS_SOIL, MobEffects.NIGHT_VISION, 5.0F, p), flower(MapColor.COLOR_PURPLE)));
	public static final WoodSet LARCH = wood("larch", MapColor.TERRACOTTA_RED, MapColor.TERRACOTTA_BROWN, MapColor.COLOR_LIGHT_GREEN, EsTags.GRASS_SOIL);

	private EsBlocks() {
	}

	public static void init() {
		Earthscapes.LOGGER.debug("Registered {} blocks", ALL.size());
	}

	// ---------------------------------------------------------------- helpers

	public record WoodSet(String name, Block log, Block wood, Block strippedLog, Block strippedWood, Block planks, Block stairs, Block slab,
		Block fence, Block fenceGate, Block leaves, Block sapling) {
	}

	private static WoodSet wood(String name, MapColor plankColor, MapColor barkColor, MapColor leafColor, net.minecraft.tags.TagKey<Block> soil) {
		Block log = register(name + "_log", RotatedPillarBlock::new, log(plankColor, barkColor));
		Block wood = register(name + "_wood", RotatedPillarBlock::new, log(barkColor, barkColor));
		Block strippedLog = register("stripped_" + name + "_log", RotatedPillarBlock::new, log(plankColor, plankColor));
		Block strippedWood = register("stripped_" + name + "_wood", RotatedPillarBlock::new, log(plankColor, plankColor));
		Block planks = register(name + "_planks", Block::new, BlockBehaviour.Properties.of().mapColor(plankColor).instrument(NoteBlockInstrument.BASS)
			.strength(2.0F, 3.0F).sound(SoundType.WOOD).ignitedByLava());
		Block stairs = register(name + "_stairs", p -> new StairBlock(planks.defaultBlockState(), p), BlockBehaviour.Properties.ofFullCopy(planks));
		Block slab = register(name + "_slab", SlabBlock::new, BlockBehaviour.Properties.ofFullCopy(planks));
		Block fence = register(name + "_fence", FenceBlock::new, BlockBehaviour.Properties.of().mapColor(plankColor).forceSolidOn()
			.instrument(NoteBlockInstrument.BASS).strength(2.0F, 3.0F).sound(SoundType.WOOD).ignitedByLava());
		Block fenceGate = register(name + "_fence_gate", p -> new FenceGateBlock(WoodType.ACACIA, p), BlockBehaviour.Properties.of().mapColor(plankColor)
			.forceSolidOn().instrument(NoteBlockInstrument.BASS).strength(2.0F, 3.0F).ignitedByLava());
		Block leaves = register(name + "_leaves", p -> new TintedParticleLeavesBlock(0.01F, p), leaves(leafColor));
		Block sapling = cutout(register(name + "_sapling", p -> new EsSaplingBlock(grower(name), soil, p), sapling()));
		WoodSet set = new WoodSet(name, log, wood, strippedLog, strippedWood, planks, stairs, slab, fence, fenceGate, leaves, sapling);
		WOOD_SETS.add(set);
		return set;
	}

	private static TreeGrower grower(String name) {
		ResourceKey<ConfiguredFeature<?, ?>> key = ResourceKey.create(Registries.CONFIGURED_FEATURE, Earthscapes.id("tree/" + name));
		return new TreeGrower(Earthscapes.MOD_ID + ":" + name, Optional.empty(), Optional.of(key), Optional.empty());
	}

	private static Block register(String name, Function<BlockBehaviour.Properties, Block> factory, BlockBehaviour.Properties properties) {
		ResourceKey<Block> key = ResourceKey.create(Registries.BLOCK, Earthscapes.id(name));
		Block block = factory.apply(properties.setId(key));
		Registry.register(BuiltInRegistries.BLOCK, key, block);
		ALL.add(block);
		return block;
	}

	private static Block cutout(Block block) {
		CUTOUT.add(block);
		return block;
	}

	private static BlockBehaviour.Properties log(MapColor top, MapColor side) {
		return BlockBehaviour.Properties.of()
			.mapColor(state -> state.getValue(RotatedPillarBlock.AXIS) == Direction.Axis.Y ? top : side)
			.instrument(NoteBlockInstrument.BASS)
			.strength(2.0F)
			.sound(SoundType.WOOD)
			.ignitedByLava();
	}

	private static BlockBehaviour.Properties leaves(MapColor color) {
		return Blocks.leavesProperties(SoundType.GRASS).mapColor(color);
	}

	private static BlockBehaviour.Properties sapling() {
		return BlockBehaviour.Properties.of().mapColor(MapColor.PLANT).noCollision().randomTicks().instabreak().sound(SoundType.GRASS).pushReaction(PushReaction.DESTROY);
	}

	private static BlockBehaviour.Properties shortPlant(MapColor color) {
		return BlockBehaviour.Properties.of().mapColor(color).replaceable().noCollision().instabreak().sound(SoundType.GRASS)
			.offsetType(BlockBehaviour.OffsetType.XYZ).ignitedByLava().pushReaction(PushReaction.DESTROY);
	}

	private static BlockBehaviour.Properties tallPlant(MapColor color) {
		return BlockBehaviour.Properties.of().mapColor(color).replaceable().noCollision().instabreak().sound(SoundType.GRASS)
			.offsetType(BlockBehaviour.OffsetType.XZ).ignitedByLava().pushReaction(PushReaction.DESTROY);
	}

	private static BlockBehaviour.Properties flower(MapColor color) {
		return BlockBehaviour.Properties.of().mapColor(color).noCollision().instabreak().sound(SoundType.GRASS)
			.offsetType(BlockBehaviour.OffsetType.XZ).pushReaction(PushReaction.DESTROY);
	}
}
