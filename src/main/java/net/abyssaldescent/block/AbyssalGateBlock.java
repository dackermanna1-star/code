package net.abyssaldescent.block;

import com.mojang.serialization.MapCodec;
import net.abyssaldescent.dungeon.run.RunManager;
import net.abyssaldescent.registry.ModParticles;
import net.minecraft.core.BlockPos;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.util.RandomSource;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.shapes.CollisionContext;
import net.minecraft.world.phys.shapes.Shapes;
import net.minecraft.world.phys.shapes.VoxelShape;

/**
 * The way in. Using the gate begins a short attunement; every player standing near the gate when it completes joins the
 * expedition. Sneak-use cycles the starting floor among checkpoints the whole party has unlocked.
 */
public class AbyssalGateBlock extends Block {
	public static final MapCodec<AbyssalGateBlock> CODEC = simpleCodec(AbyssalGateBlock::new);
	private static final VoxelShape SHAPE = Shapes.or(Block.box(0, 0, 0, 16, 4, 16), Block.box(2, 4, 2, 14, 12, 14), Block.box(1, 12, 1, 15, 15, 15));

	public AbyssalGateBlock(Properties properties) {
		super(properties);
	}

	@Override
	protected MapCodec<? extends Block> codec() {
		return CODEC;
	}

	@Override
	protected VoxelShape getShape(BlockState state, BlockGetter level, BlockPos pos, CollisionContext context) {
		return SHAPE;
	}

	@Override
	protected InteractionResult useWithoutItem(BlockState state, Level level, BlockPos pos, Player player, BlockHitResult hit) {
		if (level instanceof ServerLevel serverLevel && player instanceof ServerPlayer serverPlayer) {
			RunManager manager = RunManager.get(serverLevel.getServer());
			if (player.isShiftKeyDown()) {
				manager.cycleStartFloor(serverPlayer);
			} else {
				manager.beginAttunement(serverLevel, pos, serverPlayer);
			}
		}
		return InteractionResult.SUCCESS;
	}

	@Override
	public void animateTick(BlockState state, Level level, BlockPos pos, RandomSource random) {
		double t = (level.getGameTime() % 80) / 80.0 * Math.PI * 2;
		for (int i = 0; i < 2; i++) {
			double a = t + i * Math.PI;
			level.addParticle(ModParticles.RIFT_MOTE, pos.getX() + 0.5 + Math.cos(a) * 0.45, pos.getY() + 1.0, pos.getZ() + 0.5 + Math.sin(a) * 0.45, 0.0,
				0.03, 0.0);
		}
		if (random.nextInt(4) == 0) {
			level.addParticle(ParticleTypes.PORTAL, pos.getX() + 0.5, pos.getY() + 1.2, pos.getZ() + 0.5, (random.nextDouble() - 0.5) * 2,
				-random.nextDouble(), (random.nextDouble() - 0.5) * 2);
		}
	}
}
