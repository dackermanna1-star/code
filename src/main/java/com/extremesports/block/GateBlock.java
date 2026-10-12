package com.extremesports.block;

import com.extremesports.server.CourseRegistry;
import net.minecraft.ChatFormatting;
import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.level.block.state.properties.BooleanProperty;
import net.minecraft.world.level.block.state.properties.IntegerProperty;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.shapes.CollisionContext;
import net.minecraft.world.phys.shapes.Shapes;
import net.minecraft.world.phys.shapes.VoxelShape;

/**
 * Race course markers. Start gates begin a timed run (time trial or downhill), checkpoints must be passed in
 * order, finish gates stop the clock. Riders pass straight through them.
 */
public class GateBlock extends Block {
	public enum Type {
		START,
		CHECKPOINT,
		FINISH
	}

	public static final IntegerProperty COURSE = IntegerProperty.create("course", 0, 15);
	public static final IntegerProperty ORDER = IntegerProperty.create("order", 0, 15);
	/** Start gates only: false = time trial (all checkpoints required), true = downhill (missed gates add time). */
	public static final BooleanProperty DOWNHILL = BooleanProperty.create("downhill");
	private static final VoxelShape SHAPE = Block.box(6, 0, 6, 10, 16, 10);

	private final Type type;

	public GateBlock(Type type, Properties properties) {
		super(properties);
		this.type = type;
		registerDefaultState(stateDefinition.any().setValue(COURSE, 0).setValue(ORDER, 0).setValue(DOWNHILL, false));
	}

	public Type type() {
		return type;
	}

	@Override
	protected void createBlockStateDefinition(StateDefinition.Builder<Block, BlockState> builder) {
		builder.add(COURSE, ORDER, DOWNHILL);
	}

	@Override
	protected VoxelShape getShape(BlockState state, BlockGetter level, BlockPos pos, CollisionContext context) {
		return SHAPE;
	}

	@Override
	protected VoxelShape getCollisionShape(BlockState state, BlockGetter level, BlockPos pos, CollisionContext context) {
		return Shapes.empty();
	}

	@Override
	protected void onPlace(BlockState state, Level level, BlockPos pos, BlockState oldState, boolean movedByPiston) {
		super.onPlace(state, level, pos, oldState, movedByPiston);
		if (level instanceof ServerLevel serverLevel) {
			CourseRegistry.get(serverLevel).add(pos, type, state.getValue(COURSE), state.getValue(ORDER));
		}
	}

	@Override
	protected void affectNeighborsAfterRemoval(BlockState state, ServerLevel level, BlockPos pos, boolean movedByPiston) {
		super.affectNeighborsAfterRemoval(state, level, pos, movedByPiston);
		if (!level.getBlockState(pos).is(this)) {
			CourseRegistry.get(level).remove(pos);
		}
	}

	/**
	 * Right-click cycles the checkpoint number; sneak + right-click cycles the course id.
	 * Start gates toggle between time trial and downhill with a plain right-click instead.
	 */
	@Override
	protected InteractionResult useWithoutItem(BlockState state, Level level, BlockPos pos, Player player, BlockHitResult hit) {
		if (!player.mayBuild()) {
			return InteractionResult.PASS;
		}
		if (level instanceof ServerLevel serverLevel) {
			BlockState next;
			if (player.isSecondaryUseActive()) {
				next = state.setValue(COURSE, (state.getValue(COURSE) + 1) % 16);
			} else if (type == Type.CHECKPOINT) {
				next = state.setValue(ORDER, (state.getValue(ORDER) + 1) % 16);
			} else if (type == Type.START) {
				next = state.setValue(DOWNHILL, !state.getValue(DOWNHILL));
			} else {
				next = state;
			}
			level.setBlock(pos, next, Block.UPDATE_ALL);
			CourseRegistry.get(serverLevel).add(pos, type, next.getValue(COURSE), next.getValue(ORDER));
			player.displayClientMessage(describe(next), true);
		}
		return InteractionResult.SUCCESS;
	}

	public Component describe(BlockState state) {
		Component course = Component.translatable("message.extremesports.course", state.getValue(COURSE) + 1);
		return switch (type) {
			case START -> Component.translatable(state.getValue(DOWNHILL) ? "message.extremesports.gate_start_downhill" : "message.extremesports.gate_start_trial", course)
				.withStyle(ChatFormatting.GREEN);
			case CHECKPOINT -> Component.translatable("message.extremesports.gate_checkpoint", state.getValue(ORDER) + 1, course)
				.withStyle(ChatFormatting.GOLD);
			case FINISH -> Component.translatable("message.extremesports.gate_finish", course).withStyle(ChatFormatting.AQUA);
		};
	}
}
