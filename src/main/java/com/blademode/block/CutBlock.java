package com.blademode.block;

import com.mojang.serialization.MapCodec;
import java.util.List;
import net.minecraft.core.BlockPos;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.LevelReader;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.EntityBlock;
import net.minecraft.world.level.block.RenderShape;
import net.minecraft.world.level.block.SoundType;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.level.block.state.properties.EnumProperty;
import net.minecraft.world.level.block.state.properties.IntegerProperty;
import net.minecraft.world.level.pathfinder.PathComputationType;
import net.minecraft.world.level.storage.loot.LootParams;
import net.minecraft.world.level.storage.loot.parameters.LootContextParams;
import net.minecraft.world.phys.shapes.CollisionContext;
import net.minecraft.world.phys.shapes.Shapes;
import net.minecraft.world.phys.shapes.VoxelShape;
import org.jspecify.annotations.Nullable;

/**
 * The part of a block that stayed in the world after the rest of it was cut away. Rendering,
 * shape, hardness and drops all come from the original block stored in the block entity.
 */
public class CutBlock extends Block implements EntityBlock {
	public static final MapCodec<CutBlock> CODEC = simpleCodec(CutBlock::new);
	public static final EnumProperty<CutSound> SOUND = EnumProperty.create("sound", CutSound.class);
	public static final IntegerProperty LIGHT = IntegerProperty.create("light", 0, 15);

	public CutBlock(Properties properties) {
		super(properties);
		this.registerDefaultState(this.stateDefinition.any().setValue(SOUND, CutSound.STONE).setValue(LIGHT, 0));
	}

	@Override
	protected MapCodec<? extends CutBlock> codec() {
		return CODEC;
	}

	@Override
	protected void createBlockStateDefinition(StateDefinition.Builder<Block, BlockState> builder) {
		builder.add(SOUND, LIGHT);
	}

	public static BlockState stateFor(Block cutBlock, BlockState original) {
		return cutBlock.defaultBlockState()
			.setValue(SOUND, CutSound.of(original.getSoundType()))
			.setValue(LIGHT, Math.min(15, original.getLightEmission()));
	}

	@Override
	public @Nullable BlockEntity newBlockEntity(BlockPos pos, BlockState state) {
		return new CutBlockEntity(pos, state);
	}

	private static @Nullable CutBlockEntity be(BlockGetter level, BlockPos pos) {
		return level.getBlockEntity(pos) instanceof CutBlockEntity cut ? cut : null;
	}

	@Override
	protected RenderShape getRenderShape(BlockState state) {
		return RenderShape.INVISIBLE;
	}

	@Override
	protected VoxelShape getShape(BlockState state, BlockGetter level, BlockPos pos, CollisionContext context) {
		CutBlockEntity be = be(level, pos);
		return be != null ? be.getVoxelShape() : Shapes.block();
	}

	@Override
	protected VoxelShape getCollisionShape(BlockState state, BlockGetter level, BlockPos pos, CollisionContext context) {
		CutBlockEntity be = be(level, pos);
		return be != null ? be.getVoxelShape() : Shapes.block();
	}

	@Override
	protected VoxelShape getOcclusionShape(BlockState state) {
		return Shapes.empty();
	}

	@Override
	protected boolean propagatesSkylightDown(BlockState state) {
		return true;
	}

	@Override
	protected int getLightBlock(BlockState state) {
		return 0;
	}

	@Override
	protected boolean isPathfindable(BlockState state, PathComputationType type) {
		return false;
	}

	@Override
	protected SoundType getSoundType(BlockState state) {
		return state.getValue(SOUND).sound;
	}

	@Override
	protected float getDestroyProgress(BlockState state, Player player, BlockGetter level, BlockPos pos) {
		CutBlockEntity be = be(level, pos);
		if (be == null) {
			return super.getDestroyProgress(state, player, level, pos);
		}
		// Less material means it breaks a bit faster.
		double fraction = Math.max(0.25, be.getPartShape().fraction());
		return (float) (be.getOriginal().getDestroyProgress(player, level, pos) / fraction);
	}

	@Override
	protected List<ItemStack> getDrops(BlockState state, LootParams.Builder builder) {
		BlockEntity blockEntity = builder.getOptionalParameter(LootContextParams.BLOCK_ENTITY);
		if (!(blockEntity instanceof CutBlockEntity be)) {
			return List.of();
		}
		// Expected drops are proportional to how much of the block is left, so cutting can't duplicate items.
		double fraction = be.getPartShape().fraction();
		if (builder.getLevel().getRandom().nextDouble() >= fraction) {
			return List.of();
		}
		builder.withParameter(LootContextParams.BLOCK_STATE, be.getOriginal());
		return be.getOriginal().getDrops(builder);
	}

	@Override
	protected void spawnDestroyParticles(Level level, Player player, BlockPos pos, BlockState state) {
		// Break particles should look like the original material.
		CutBlockEntity be = be(level, pos);
		level.levelEvent(player, 2001, pos, Block.getId(be != null ? be.getOriginal() : state));
	}

	@Override
	protected ItemStack getCloneItemStack(LevelReader level, BlockPos pos, BlockState state, boolean includeData) {
		CutBlockEntity be = be(level, pos);
		return be != null ? new ItemStack(be.getOriginal().getBlock()) : ItemStack.EMPTY;
	}
}
