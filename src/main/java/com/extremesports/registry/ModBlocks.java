package com.extremesports.registry;

import com.extremesports.ExtremeSports;
import com.extremesports.block.GateBlock;
import com.extremesports.block.InclinedRailBlock;
import com.extremesports.block.ObstacleBlock;
import com.extremesports.block.ParkBlock;
import com.extremesports.block.RailBlock;
import com.extremesports.block.RampBlock;
import com.extremesports.block.RampProfile;
import com.extremesports.block.WorkshopBlock;
import com.extremesports.sport.SurfaceType;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Function;
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
	public static final List<Block> ALL = new ArrayList<>();
	public static final List<RampBlock> RAMPS = new ArrayList<>();

	public static final RampBlock QUARTER_PIPE = ramp("quarter_pipe", RampProfile.QUARTER_PIPE, SurfaceType.WOOD, true, wood());
	public static final RampBlock BOWL_WALL = ramp("bowl_wall", RampProfile.QUARTER_PIPE, SurfaceType.SMOOTH, true, concrete());
	public static final RampBlock STEEP_RAMP = ramp("steep_ramp", RampProfile.STEEP, SurfaceType.WOOD, false, wood());
	public static final RampBlock RAMP = ramp("ramp", RampProfile.RAMP, SurfaceType.WOOD, false, wood());
	public static final RampBlock SLOPE = ramp("slope", RampProfile.SLOPE, SurfaceType.SMOOTH, false, concrete());
	public static final RampBlock LAUNCH_RAMP = ramp("launch_ramp", RampProfile.KICKER, SurfaceType.WOOD, false, wood());
	public static final RampBlock DIRT_LIP = ramp("dirt_lip", RampProfile.DIRT_LIP, SurfaceType.PACKED_DIRT, false, dirt());
	public static final RampBlock DIRT_RAMP = ramp("dirt_ramp", RampProfile.RAMP, SurfaceType.PACKED_DIRT, false, dirt());

	public static final RailBlock GRIND_RAIL = register("grind_rail", RailBlock::new, metal());
	public static final InclinedRailBlock GRIND_RAIL_INCLINE = register("grind_rail_incline", InclinedRailBlock::new, metal());
	public static final ObstacleBlock GRIND_BOX = register("grind_box",
		p -> new ObstacleBlock(0.5, true, false, SurfaceType.WOOD, p), wood());
	public static final ObstacleBlock LEDGE = register("ledge",
		p -> new ObstacleBlock(0.75, true, false, SurfaceType.SMOOTH, p), concrete());
	public static final ObstacleBlock MANUAL_PAD = register("manual_pad",
		p -> new ObstacleBlock(0.25, false, true, SurfaceType.SMOOTH, p), concrete());

	public static final ParkBlock PARK_CONCRETE = register("park_concrete", p -> new ParkBlock(SurfaceType.SMOOTH, p), concrete());
	public static final ParkBlock RAMP_DECK = register("ramp_deck", p -> new ParkBlock(SurfaceType.WOOD, p), wood());
	public static final ParkBlock PACKED_DIRT = register("packed_dirt", p -> new ParkBlock(SurfaceType.PACKED_DIRT, p), dirt());

	public static final WorkshopBlock SKATE_WORKSHOP = register("skate_workshop", WorkshopBlock::new, wood().strength(2.0F));
	public static final GateBlock START_GATE = register("start_gate", p -> new GateBlock(GateBlock.Type.START, p), gate(MapColor.COLOR_GREEN));
	public static final GateBlock CHECKPOINT_GATE = register("checkpoint_gate", p -> new GateBlock(GateBlock.Type.CHECKPOINT, p), gate(MapColor.COLOR_ORANGE));
	public static final GateBlock FINISH_GATE = register("finish_gate", p -> new GateBlock(GateBlock.Type.FINISH, p), gate(MapColor.SNOW));

	private static BlockBehaviour.Properties wood() {
		return BlockBehaviour.Properties.of().mapColor(MapColor.WOOD).strength(1.5F, 3.0F).sound(SoundType.WOOD).noOcclusion();
	}

	private static BlockBehaviour.Properties concrete() {
		return BlockBehaviour.Properties.of().mapColor(MapColor.STONE).strength(1.8F, 6.0F).sound(SoundType.STONE).noOcclusion();
	}

	private static BlockBehaviour.Properties dirt() {
		return BlockBehaviour.Properties.of().mapColor(MapColor.DIRT).strength(0.8F).sound(SoundType.ROOTED_DIRT).noOcclusion();
	}

	private static BlockBehaviour.Properties metal() {
		return BlockBehaviour.Properties.of().mapColor(MapColor.METAL).strength(2.0F, 6.0F).sound(SoundType.METAL).noOcclusion();
	}

	private static BlockBehaviour.Properties gate(MapColor color) {
		return BlockBehaviour.Properties.of().mapColor(color).strength(0.5F).sound(SoundType.WOOD).noOcclusion().noCollision()
			.pushReaction(PushReaction.DESTROY);
	}

	private static RampBlock ramp(String name, RampProfile profile, SurfaceType surface, boolean coping, BlockBehaviour.Properties properties) {
		RampBlock block = register(name, p -> RampBlock.create(profile, surface, coping, p), properties);
		RAMPS.add(block);
		return block;
	}

	private static <T extends Block> T register(String name, Function<BlockBehaviour.Properties, T> factory, BlockBehaviour.Properties properties) {
		ResourceKey<Block> key = ResourceKey.create(Registries.BLOCK, ExtremeSports.id(name));
		T block = factory.apply(properties.setId(key));
		Registry.register(BuiltInRegistries.BLOCK, key, block);
		ALL.add(block);
		return block;
	}

	private ModBlocks() {
	}

	public static void init() {
	}
}
