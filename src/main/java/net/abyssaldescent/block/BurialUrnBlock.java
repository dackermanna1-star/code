package net.abyssaldescent.block;

import com.mojang.serialization.MapCodec;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.projectile.Projectile;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.shapes.CollisionContext;
import net.minecraft.world.phys.shapes.Shapes;
import net.minecraft.world.phys.shapes.VoxelShape;

/** Fragile funerary urn. Shatters on any hit (including arrows) and may spill coins, arrows or a potion. */
public class BurialUrnBlock extends Block {
	public static final MapCodec<BurialUrnBlock> CODEC = simpleCodec(BurialUrnBlock::new);
	private static final VoxelShape SHAPE = Shapes.or(Block.box(4, 0, 4, 12, 1, 12), Block.box(3, 1, 3, 13, 10, 13), Block.box(5, 10, 5, 11, 13, 11));

	public BurialUrnBlock(Properties properties) {
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
	protected void onProjectileHit(Level level, BlockState state, BlockHitResult hit, Projectile projectile) {
		if (level instanceof ServerLevel serverLevel && projectile.mayInteract(serverLevel, hit.getBlockPos())) {
			level.destroyBlock(hit.getBlockPos(), true, projectile);
		}
	}
}
