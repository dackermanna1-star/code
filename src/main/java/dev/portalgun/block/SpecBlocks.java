package dev.portalgun.block;

import com.mojang.serialization.MapCodec;
import dev.portalgun.content.ContentSpec;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.particles.ColorParticleOption;
import net.minecraft.core.particles.ParticleOptions;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.tags.BlockTags;
import net.minecraft.util.ColorRGBA;
import net.minecraft.util.RandomSource;
import net.minecraft.util.valueproviders.UniformInt;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.InsideBlockEffectApplier;
import net.minecraft.world.item.context.BlockPlaceContext;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.LevelReader;
import net.minecraft.world.level.ScheduledTickAccess;
import net.minecraft.world.level.block.AmethystBlock;
import net.minecraft.world.level.block.AmethystClusterBlock;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.CarpetBlock;
import net.minecraft.world.level.block.ColoredFallingBlock;
import net.minecraft.world.level.block.DoublePlantBlock;
import net.minecraft.world.level.block.DropExperienceBlock;
import net.minecraft.world.level.block.GlowLichenBlock;
import net.minecraft.world.level.block.HalfTransparentBlock;
import net.minecraft.world.level.block.HangingRootsBlock;
import net.minecraft.world.level.block.HoneyBlock;
import net.minecraft.world.level.block.RotatedPillarBlock;
import net.minecraft.world.level.block.SimpleWaterloggedBlock;
import net.minecraft.world.level.block.SlimeBlock;
import net.minecraft.world.level.block.SoundType;
import net.minecraft.world.level.block.TransparentBlock;
import net.minecraft.world.level.block.UntintedParticleLeavesBlock;
import net.minecraft.world.level.block.VegetationBlock;
import net.minecraft.world.level.block.WaterlilyBlock;
import net.minecraft.world.level.block.state.BlockBehaviour;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.minecraft.world.level.block.state.properties.BooleanProperty;
import net.minecraft.world.level.block.state.properties.NoteBlockInstrument;
import net.minecraft.world.level.material.FluidState;
import net.minecraft.world.level.material.Fluids;
import net.minecraft.world.level.material.MapColor;
import net.minecraft.world.level.material.PushReaction;
import net.minecraft.world.phys.shapes.CollisionContext;
import net.minecraft.world.phys.shapes.VoxelShape;
import org.jetbrains.annotations.Nullable;

/** Creates the block instance for a {@link ContentSpec.BlockSpec} according to its kind. */
public final class SpecBlocks {
	/** Kinds whose blocks are small decorations placed by features on any sturdy surface. */
	public static boolean isPlantKind(String kind) {
		return switch (kind) {
			case "plant", "tall_plant", "hanging_plant", "crystal_cluster", "vine", "lily", "carpet" -> true;
			default -> false;
		};
	}

	private SpecBlocks() {
	}

	private static boolean never(BlockState s, BlockGetter g, BlockPos p) {
		return false;
	}

	public static BlockBehaviour.Properties properties(ContentSpec.BlockSpec spec) {
		String kind = spec.kind == null ? "solid" : spec.kind;
		BlockBehaviour.Properties p = BlockBehaviour.Properties.of();
		MapColor defaultMap = switch (kind) {
			case "soil", "grass" -> MapColor.DIRT;
			case "sand" -> MapColor.SAND;
			case "log", "planks" -> MapColor.WOOD;
			case "leaves", "plant", "tall_plant", "hanging_plant", "vine", "lily", "carpet" -> MapColor.PLANT;
			case "ice" -> MapColor.ICE;
			default -> MapColor.STONE;
		};
		p.mapColor(BlockLookups.mapColor(spec.map, defaultMap));
		p.sound(BlockLookups.sound(spec.sound, SoundType.STONE));
		float hardness = Math.max(0, spec.hardness);
		float resistance = spec.resistance >= 0 ? spec.resistance : hardness * 3.0F;
		if (hardness <= 0) {
			p.instabreak();
		} else {
			p.strength(hardness, resistance);
		}
		int light = Math.max(0, Math.min(15, spec.light));
		if ("glow".equals(kind) && light == 0) {
			light = 15;
		}
		if (light > 0) {
			int l = light;
			if ("vine".equals(kind)) {
				p.lightLevel(GlowLichenBlock.emission(l));
			} else {
				p.lightLevel(s -> l);
			}
		}
		float friction = spec.friction;
		if ("ice".equals(kind) && Math.abs(friction - 0.6F) < 1e-4) {
			friction = 0.98F;
		} else if ("slime".equals(kind) && Math.abs(friction - 0.6F) < 1e-4) {
			friction = 0.8F;
		}
		p.friction(Math.max(0.0F, Math.min(1.2F, friction)));
		float speed = spec.speed;
		float jump = spec.jump;
		if ("sticky".equals(kind)) {
			if (Math.abs(speed - 1.0F) < 1e-4) {
				speed = 0.4F;
			}
			if (Math.abs(jump - 1.0F) < 1e-4) {
				jump = 0.5F;
			}
		}
		if (Math.abs(speed - 1.0F) > 1e-4) {
			p.speedFactor(Math.max(0.05F, Math.min(3.0F, speed)));
		}
		if (Math.abs(jump - 1.0F) > 1e-4) {
			p.jumpFactor(Math.max(0.1F, Math.min(3.0F, jump)));
		}
		if (spec.emissive) {
			p.emissiveRendering((s, g, pos) -> true);
		}
		if (spec.flammable) {
			p.ignitedByLava();
		}
		switch (kind) {
			case "stone", "ore" -> p.instrument(NoteBlockInstrument.BASEDRUM).requiresCorrectToolForDrops();
			case "log", "planks", "mushroom_cap" -> p.instrument(NoteBlockInstrument.BASS);
			case "sand" -> p.instrument(NoteBlockInstrument.SNARE);
			case "glass" -> p.instrument(NoteBlockInstrument.HAT).noOcclusion().isValidSpawn((s, g, pos, t) -> false)
				.isRedstoneConductor(SpecBlocks::never).isSuffocating(SpecBlocks::never).isViewBlocking(SpecBlocks::never);
			case "ice" -> p.noOcclusion().isRedstoneConductor(SpecBlocks::never);
			case "slime", "sticky" -> p.noOcclusion();
			case "leaves" -> p.randomTicks().noOcclusion().isValidSpawn((s, g, pos, t) -> false)
				.isSuffocating(SpecBlocks::never).isViewBlocking(SpecBlocks::never).pushReaction(PushReaction.DESTROY)
				.isRedstoneConductor(SpecBlocks::never);
			case "plant", "tall_plant", "hanging_plant" -> p.noCollision().offsetType(BlockBehaviour.OffsetType.XZ).pushReaction(PushReaction.DESTROY);
			case "vine" -> p.noCollision().replaceable().pushReaction(PushReaction.DESTROY);
			case "crystal_cluster" -> p.forceSolidOn().noOcclusion().pushReaction(PushReaction.DESTROY);
			case "lily" -> p.noOcclusion().pushReaction(PushReaction.DESTROY);
			case "carpet" -> p.pushReaction(PushReaction.DESTROY);
			default -> {
			}
		}
		// A full block drawn in a see-through layer must not cull its neighbours' faces.
		if (!"solid".equals(spec.layer) && !isPlantKind(kind)
			&& !"leaves".equals(kind) && !"glass".equals(kind) && !"ice".equals(kind) && !"slime".equals(kind) && !"sticky".equals(kind)) {
			p.noOcclusion().isRedstoneConductor(SpecBlocks::never).isSuffocating(SpecBlocks::never).isViewBlocking(SpecBlocks::never);
		}
		return p;
	}

	public static Block create(ContentSpec.BlockSpec spec, BlockBehaviour.Properties props) {
		String kind = spec.kind == null ? "solid" : spec.kind;
		SpecBehavior b = SpecBehavior.of(spec);
		return switch (kind) {
			case "sand" -> new SpecFallingBlock(new ColorRGBA(color(spec)), props, b);
			case "log" -> new SpecPillarBlock(props, b);
			case "leaves" -> new SpecLeavesBlock(leafParticle(spec), props, b);
			case "glass" -> new SpecGlassBlock(props, b);
			case "ice" -> new SpecIceBlock(props, b);
			case "crystal_block" -> new SpecCrystalBlock(props, b);
			case "ore" -> new SpecOreBlock(UniformInt.of(Math.max(0, xp(spec, 0)), Math.max(xp(spec, 0), xp(spec, 1))), props, b);
			case "slime" -> new SpecSlimeBlock(props, b);
			case "sticky" -> new SpecStickyBlock(props, b);
			case "plant" -> new SpecPlantBlock(props, b);
			case "tall_plant" -> new SpecTallPlantBlock(props, b);
			case "hanging_plant" -> new SpecHangingPlantBlock(props, b);
			case "crystal_cluster" -> new SpecClusterBlock(props, b);
			case "lily" -> new SpecLilyBlock(props, b);
			case "vine" -> new SpecVineBlock(props, b);
			case "carpet" -> new SpecCarpetBlock(props, b);
			default -> new SpecBlock(props, b);
		};
	}

	private static int xp(ContentSpec.BlockSpec spec, int i) {
		return spec.xp != null && spec.xp.length > i ? spec.xp[i] : 0;
	}

	/** Spec color, else the map color, as 0xRRGGBB. */
	public static int color(ContentSpec.BlockSpec spec) {
		int c = BlockLookups.rgb(spec.color);
		if (c >= 0) {
			return c;
		}
		return BlockLookups.mapColor(spec.map, MapColor.STONE).col;
	}

	private static ParticleOptions leafParticle(ContentSpec.BlockSpec spec) {
		ParticleOptions p = BlockLookups.particle(spec.particle);
		return p != null ? p : ColorParticleOption.create(ParticleTypes.TINTED_LEAVES, 0xFF000000 | color(spec));
	}

	// ------------------------------------------------------------------------------------------ block classes

	/** Generic full block: solid, stone, soil, grass, planks, glow, hazard, vent, mushroom_cap. */
	public static class SpecBlock extends Block {
		private static final MapCodec<SpecBlock> CODEC = simpleCodec(p -> new SpecBlock(p, SpecBehavior.NONE));
		protected final SpecBehavior behavior;

		public SpecBlock(BlockBehaviour.Properties properties, SpecBehavior behavior) {
			super(properties);
			this.behavior = behavior;
		}

		@Override
		protected MapCodec<? extends Block> codec() {
			return CODEC;
		}

		@Override
		public void stepOn(Level level, BlockPos pos, BlockState state, Entity entity) {
			this.behavior.stepOn(level, pos, entity);
			super.stepOn(level, pos, state, entity);
		}

		@Override
		public void fallOn(Level level, BlockState state, BlockPos pos, Entity entity, double distance) {
			if (this.behavior.bounce > 0 && !entity.isSuppressingBounce()) {
				entity.causeFallDamage(distance, Math.max(0.0F, 1.0F - this.behavior.bounce * 1.5F), level.damageSources().fall());
			} else {
				super.fallOn(level, state, pos, entity, distance);
			}
		}

		@Override
		public void updateEntityMovementAfterFallOn(BlockGetter level, Entity entity) {
			if (!this.behavior.bounce(level, entity)) {
				super.updateEntityMovementAfterFallOn(level, entity);
			}
		}

		@Override
		public void animateTick(BlockState state, Level level, BlockPos pos, RandomSource random) {
			this.behavior.animateTick(state, level, pos, random);
		}
	}

	public static class SpecFallingBlock extends ColoredFallingBlock {
		private final SpecBehavior behavior;

		public SpecFallingBlock(ColorRGBA color, BlockBehaviour.Properties properties, SpecBehavior behavior) {
			super(color, properties);
			this.behavior = behavior;
		}

		@Override
		public void stepOn(Level level, BlockPos pos, BlockState state, Entity entity) {
			this.behavior.stepOn(level, pos, entity);
			super.stepOn(level, pos, state, entity);
		}

		@Override
		public void animateTick(BlockState state, Level level, BlockPos pos, RandomSource random) {
			super.animateTick(state, level, pos, random);
			this.behavior.animateTick(state, level, pos, random);
		}
	}

	public static class SpecPillarBlock extends RotatedPillarBlock {
		private final SpecBehavior behavior;

		public SpecPillarBlock(BlockBehaviour.Properties properties, SpecBehavior behavior) {
			super(properties);
			this.behavior = behavior;
		}

		@Override
		public void stepOn(Level level, BlockPos pos, BlockState state, Entity entity) {
			this.behavior.stepOn(level, pos, entity);
			super.stepOn(level, pos, state, entity);
		}

		@Override
		public void animateTick(BlockState state, Level level, BlockPos pos, RandomSource random) {
			this.behavior.animateTick(state, level, pos, random);
		}
	}

	public static class SpecLeavesBlock extends UntintedParticleLeavesBlock {
		private final SpecBehavior behavior;

		public SpecLeavesBlock(ParticleOptions particle, BlockBehaviour.Properties properties, SpecBehavior behavior) {
			super(0.015F, particle, properties);
			this.behavior = behavior;
		}

		@Override
		public void animateTick(BlockState state, Level level, BlockPos pos, RandomSource random) {
			super.animateTick(state, level, pos, random);
		}
	}

	public static class SpecGlassBlock extends TransparentBlock {
		private final SpecBehavior behavior;

		public SpecGlassBlock(BlockBehaviour.Properties properties, SpecBehavior behavior) {
			super(properties);
			this.behavior = behavior;
		}

		@Override
		public void stepOn(Level level, BlockPos pos, BlockState state, Entity entity) {
			this.behavior.stepOn(level, pos, entity);
			super.stepOn(level, pos, state, entity);
		}

		@Override
		public void animateTick(BlockState state, Level level, BlockPos pos, RandomSource random) {
			this.behavior.animateTick(state, level, pos, random);
		}
	}

	/** Translucent slippery block that, unlike vanilla ice, never melts into water. */
	public static class SpecIceBlock extends HalfTransparentBlock {
		private final SpecBehavior behavior;

		public SpecIceBlock(BlockBehaviour.Properties properties, SpecBehavior behavior) {
			super(properties);
			this.behavior = behavior;
		}

		@Override
		public void stepOn(Level level, BlockPos pos, BlockState state, Entity entity) {
			this.behavior.stepOn(level, pos, entity);
			super.stepOn(level, pos, state, entity);
		}

		@Override
		public void animateTick(BlockState state, Level level, BlockPos pos, RandomSource random) {
			this.behavior.animateTick(state, level, pos, random);
		}
	}

	/** Chimes like amethyst when hit by projectiles. */
	public static class SpecCrystalBlock extends AmethystBlock {
		private final SpecBehavior behavior;

		public SpecCrystalBlock(BlockBehaviour.Properties properties, SpecBehavior behavior) {
			super(properties);
			this.behavior = behavior;
		}

		@Override
		public void stepOn(Level level, BlockPos pos, BlockState state, Entity entity) {
			this.behavior.stepOn(level, pos, entity);
			super.stepOn(level, pos, state, entity);
		}

		@Override
		public void animateTick(BlockState state, Level level, BlockPos pos, RandomSource random) {
			this.behavior.animateTick(state, level, pos, random);
		}
	}

	public static class SpecOreBlock extends DropExperienceBlock {
		private final SpecBehavior behavior;

		public SpecOreBlock(UniformInt xp, BlockBehaviour.Properties properties, SpecBehavior behavior) {
			super(xp, properties);
			this.behavior = behavior;
		}

		@Override
		public void animateTick(BlockState state, Level level, BlockPos pos, RandomSource random) {
			this.behavior.animateTick(state, level, pos, random);
		}
	}

	public static class SpecSlimeBlock extends SlimeBlock {
		private final SpecBehavior behavior;

		public SpecSlimeBlock(BlockBehaviour.Properties properties, SpecBehavior behavior) {
			super(properties);
			this.behavior = behavior;
		}

		@Override
		public void stepOn(Level level, BlockPos pos, BlockState state, Entity entity) {
			this.behavior.stepOn(level, pos, entity);
			super.stepOn(level, pos, state, entity);
		}

		@Override
		public void updateEntityMovementAfterFallOn(BlockGetter level, Entity entity) {
			if (!this.behavior.bounce(level, entity)) {
				super.updateEntityMovementAfterFallOn(level, entity);
			}
		}

		@Override
		public void animateTick(BlockState state, Level level, BlockPos pos, RandomSource random) {
			this.behavior.animateTick(state, level, pos, random);
		}
	}

	public static class SpecStickyBlock extends HoneyBlock {
		private final SpecBehavior behavior;

		public SpecStickyBlock(BlockBehaviour.Properties properties, SpecBehavior behavior) {
			super(properties);
			this.behavior = behavior;
		}

		@Override
		public void stepOn(Level level, BlockPos pos, BlockState state, Entity entity) {
			this.behavior.stepOn(level, pos, entity);
			super.stepOn(level, pos, state, entity);
		}

		@Override
		public void animateTick(BlockState state, Level level, BlockPos pos, RandomSource random) {
			this.behavior.animateTick(state, level, pos, random);
		}
	}

	/** Small cross plant that grows on any block with a sturdy top (or dirt), waterloggable. */
	public static class SpecPlantBlock extends VegetationBlock implements SimpleWaterloggedBlock {
		private static final MapCodec<SpecPlantBlock> CODEC = simpleCodec(p -> new SpecPlantBlock(p, SpecBehavior.NONE));
		public static final BooleanProperty WATERLOGGED = BlockStateProperties.WATERLOGGED;
		private static final VoxelShape SHAPE = Block.column(12.0, 0.0, 13.0);
		private final SpecBehavior behavior;

		public SpecPlantBlock(BlockBehaviour.Properties properties, SpecBehavior behavior) {
			super(properties);
			this.behavior = behavior;
			this.registerDefaultState(this.stateDefinition.any().setValue(WATERLOGGED, false));
		}

		@Override
		protected MapCodec<? extends VegetationBlock> codec() {
			return CODEC;
		}

		@Override
		protected void createBlockStateDefinition(StateDefinition.Builder<Block, BlockState> builder) {
			builder.add(WATERLOGGED);
		}

		@Override
		protected boolean mayPlaceOn(BlockState state, BlockGetter level, BlockPos pos) {
			return supportsPlant(state, level, pos);
		}

		@Override
		protected VoxelShape getShape(BlockState state, BlockGetter level, BlockPos pos, CollisionContext ctx) {
			return SHAPE;
		}

		@Override
		public @Nullable BlockState getStateForPlacement(BlockPlaceContext ctx) {
			BlockState s = super.getStateForPlacement(ctx);
			return s == null ? null : s.setValue(WATERLOGGED, ctx.getLevel().getFluidState(ctx.getClickedPos()).getType() == Fluids.WATER);
		}

		@Override
		protected FluidState getFluidState(BlockState state) {
			return state.getValue(WATERLOGGED) ? Fluids.WATER.getSource(false) : super.getFluidState(state);
		}

		@Override
		protected BlockState updateShape(BlockState state, LevelReader level, ScheduledTickAccess ticks, BlockPos pos, Direction dir,
			BlockPos neighborPos, BlockState neighbor, RandomSource random) {
			if (state.getValue(WATERLOGGED)) {
				ticks.scheduleTick(pos, Fluids.WATER, Fluids.WATER.getTickDelay(level));
			}
			return super.updateShape(state, level, ticks, pos, dir, neighborPos, neighbor, random);
		}

		@Override
		protected void entityInside(BlockState state, Level level, BlockPos pos, Entity entity, InsideBlockEffectApplier applier, boolean bl) {
			this.behavior.inside(level, entity);
			super.entityInside(state, level, pos, entity, applier, bl);
		}

		@Override
		public void animateTick(BlockState state, Level level, BlockPos pos, RandomSource random) {
			this.behavior.animateTick(state, level, pos, random);
		}
	}

	/** Shared ground test for spec plants: any sturdy top face, or vanilla dirt/farmland. */
	public static boolean supportsPlant(BlockState below, BlockGetter level, BlockPos belowPos) {
		return below.isFaceSturdy(level, belowPos, Direction.UP) || below.is(BlockTags.DIRT) || below.is(Blocks.FARMLAND);
	}

	public static class SpecTallPlantBlock extends DoublePlantBlock {
		private final SpecBehavior behavior;

		public SpecTallPlantBlock(BlockBehaviour.Properties properties, SpecBehavior behavior) {
			super(properties);
			this.behavior = behavior;
		}

		@Override
		protected boolean mayPlaceOn(BlockState state, BlockGetter level, BlockPos pos) {
			return supportsPlant(state, level, pos);
		}

		@Override
		protected void entityInside(BlockState state, Level level, BlockPos pos, Entity entity, InsideBlockEffectApplier applier, boolean bl) {
			this.behavior.inside(level, entity);
			super.entityInside(state, level, pos, entity, applier, bl);
		}

		@Override
		public void animateTick(BlockState state, Level level, BlockPos pos, RandomSource random) {
			this.behavior.animateTick(state, level, pos, random);
		}
	}

	/** Hangs under any block with a sturdy bottom face, or below another block of itself (chains). */
	public static class SpecHangingPlantBlock extends HangingRootsBlock {
		private static final VoxelShape SHAPE = Block.column(12.0, 2.0, 16.0);
		private final SpecBehavior behavior;

		public SpecHangingPlantBlock(BlockBehaviour.Properties properties, SpecBehavior behavior) {
			super(properties);
			this.behavior = behavior;
		}

		@Override
		protected boolean canSurvive(BlockState state, LevelReader level, BlockPos pos) {
			BlockPos up = pos.above();
			BlockState above = level.getBlockState(up);
			return above.is(this) || above.isFaceSturdy(level, up, Direction.DOWN);
		}

		@Override
		protected VoxelShape getShape(BlockState state, BlockGetter level, BlockPos pos, CollisionContext ctx) {
			return SHAPE;
		}

		@Override
		protected void entityInside(BlockState state, Level level, BlockPos pos, Entity entity, InsideBlockEffectApplier applier, boolean bl) {
			this.behavior.inside(level, entity);
			super.entityInside(state, level, pos, entity, applier, bl);
		}

		@Override
		public void animateTick(BlockState state, Level level, BlockPos pos, RandomSource random) {
			this.behavior.animateTick(state, level, pos, random);
		}
	}

	/** Directional crystal cluster on any sturdy face (amethyst cluster style). */
	public static class SpecClusterBlock extends AmethystClusterBlock {
		private final SpecBehavior behavior;

		public SpecClusterBlock(BlockBehaviour.Properties properties, SpecBehavior behavior) {
			super(7.0F, 10.0F, properties);
			this.behavior = behavior;
		}

		@Override
		protected void entityInside(BlockState state, Level level, BlockPos pos, Entity entity, InsideBlockEffectApplier applier, boolean bl) {
			this.behavior.inside(level, entity);
			super.entityInside(state, level, pos, entity, applier, bl);
		}

		@Override
		public void animateTick(BlockState state, Level level, BlockPos pos, RandomSource random) {
			this.behavior.animateTick(state, level, pos, random);
		}
	}

	public static class SpecLilyBlock extends WaterlilyBlock {
		private final SpecBehavior behavior;

		public SpecLilyBlock(BlockBehaviour.Properties properties, SpecBehavior behavior) {
			super(properties);
			this.behavior = behavior;
		}

		@Override
		public void animateTick(BlockState state, Level level, BlockPos pos, RandomSource random) {
			this.behavior.animateTick(state, level, pos, random);
		}
	}

	/** Glow-lichen style growth on any face; may hurt like thorns when damage is set. */
	public static class SpecVineBlock extends GlowLichenBlock {
		private final SpecBehavior behavior;

		public SpecVineBlock(BlockBehaviour.Properties properties, SpecBehavior behavior) {
			super(properties);
			this.behavior = behavior;
		}

		@Override
		protected void entityInside(BlockState state, Level level, BlockPos pos, Entity entity, InsideBlockEffectApplier applier, boolean bl) {
			this.behavior.inside(level, entity);
			super.entityInside(state, level, pos, entity, applier, bl);
		}

		@Override
		public void animateTick(BlockState state, Level level, BlockPos pos, RandomSource random) {
			this.behavior.animateTick(state, level, pos, random);
		}
	}

	public static class SpecCarpetBlock extends CarpetBlock {
		private final SpecBehavior behavior;

		public SpecCarpetBlock(BlockBehaviour.Properties properties, SpecBehavior behavior) {
			super(properties);
			this.behavior = behavior;
		}

		@Override
		public void stepOn(Level level, BlockPos pos, BlockState state, Entity entity) {
			this.behavior.stepOn(level, pos, entity);
			super.stepOn(level, pos, state, entity);
		}

		@Override
		public void animateTick(BlockState state, Level level, BlockPos pos, RandomSource random) {
			this.behavior.animateTick(state, level, pos, random);
		}
	}

	@SuppressWarnings("unused")
	private static void unusedServerLevel(ServerLevel level) {
	}
}
