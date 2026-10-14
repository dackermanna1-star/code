package net.abyssaldescent.block;

import com.mojang.serialization.MapCodec;
import java.util.List;
import net.abyssaldescent.dungeon.loot.LootDrops;
import net.abyssaldescent.dungeon.loot.LootRoller;
import net.abyssaldescent.registry.ModParticles;
import net.abyssaldescent.registry.ModSounds;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.RandomSource;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.context.BlockPlaceContext;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.BaseEntityBlock;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.HorizontalDirectionalBlock;
import net.minecraft.world.level.block.RenderShape;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.level.block.state.properties.BooleanProperty;
import net.minecraft.world.level.block.state.properties.EnumProperty;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.Vec3;
import net.minecraft.world.phys.shapes.CollisionContext;
import net.minecraft.world.phys.shapes.Shapes;
import net.minecraft.world.phys.shapes.VoxelShape;
import org.jetbrains.annotations.Nullable;

/**
 * Ornate stone coffer holding dungeon loot. Loot is instanced: every party member may open it once and receives their
 * own roll, which bursts out of the lid and can only be picked up by them.
 */
public class ReliquaryBlock extends BaseEntityBlock {
	public static final MapCodec<ReliquaryBlock> CODEC = simpleCodec(ReliquaryBlock::new);
	public static final EnumProperty<Direction> FACING = HorizontalDirectionalBlock.FACING;
	public static final BooleanProperty OPEN = BooleanProperty.create("open");
	private static final VoxelShape SHAPE_X = Shapes.or(Block.box(1, 0, 2, 15, 3, 14), Block.box(2, 3, 3, 14, 10, 13), Block.box(1, 10, 2, 15, 13, 14));
	private static final VoxelShape SHAPE_Z = Shapes.or(Block.box(2, 0, 1, 14, 3, 15), Block.box(3, 3, 2, 13, 10, 14), Block.box(2, 10, 1, 14, 13, 15));

	public ReliquaryBlock(Properties properties) {
		super(properties);
		registerDefaultState(stateDefinition.any().setValue(FACING, Direction.NORTH).setValue(OPEN, false));
	}

	@Override
	protected MapCodec<? extends BaseEntityBlock> codec() {
		return CODEC;
	}

	@Override
	protected void createBlockStateDefinition(StateDefinition.Builder<Block, BlockState> builder) {
		builder.add(FACING, OPEN);
	}

	@Override
	public @Nullable BlockState getStateForPlacement(BlockPlaceContext context) {
		return defaultBlockState().setValue(FACING, context.getHorizontalDirection().getOpposite());
	}

	@Override
	protected VoxelShape getShape(BlockState state, BlockGetter level, BlockPos pos, CollisionContext context) {
		return state.getValue(FACING).getAxis() == Direction.Axis.X ? SHAPE_Z : SHAPE_X;
	}

	@Override
	protected RenderShape getRenderShape(BlockState state) {
		return RenderShape.MODEL;
	}

	@Override
	public @Nullable BlockEntity newBlockEntity(BlockPos pos, BlockState state) {
		return new ReliquaryBlockEntity(pos, state);
	}

	@Override
	protected InteractionResult useWithoutItem(BlockState state, Level level, BlockPos pos, Player player, BlockHitResult hit) {
		if (!(level instanceof ServerLevel serverLevel) || !(player instanceof ServerPlayer serverPlayer)) {
			return InteractionResult.SUCCESS;
		}
		if (!(level.getBlockEntity(pos) instanceof ReliquaryBlockEntity reliquary)) {
			return InteractionResult.CONSUME;
		}
		if (reliquary.hasLooted(player.getUUID())) {
			serverPlayer.displayClientMessage(Component.translatable("message.abyssal_descent.reliquary.claimed"), true);
			return InteractionResult.CONSUME;
		}
		reliquary.markLooted(player.getUUID());
		List<ItemStack> loot = LootRoller.rollReliquary(serverPlayer, reliquary.tier(), reliquary.floor());
		if (!state.getValue(OPEN)) {
			level.setBlock(pos, state.setValue(OPEN, true), Block.UPDATE_ALL);
		}
		level.playSound(null, pos, ModSounds.RELIQUARY_OPEN, SoundSource.BLOCKS, 1.0F, 0.9F + level.random.nextFloat() * 0.15F);
		LootDrops.fountain(serverLevel, Vec3.atCenterOf(pos).add(0, 0.45, 0), loot, serverPlayer);
		return InteractionResult.SUCCESS;
	}

	@Override
	public void animateTick(BlockState state, Level level, BlockPos pos, RandomSource random) {
		if (!state.getValue(OPEN) && random.nextInt(3) == 0) {
			level.addParticle(ModParticles.LOOT_GLINT, pos.getX() + 0.2 + random.nextDouble() * 0.6, pos.getY() + 0.85,
				pos.getZ() + 0.2 + random.nextDouble() * 0.6, 0.0, 0.02, 0.0);
		}
	}
}
