package net.earthscapes.block;

import com.mojang.serialization.MapCodec;
import java.util.function.Supplier;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.tags.TagKey;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.LevelReader;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.BonemealableBlock;
import net.minecraft.world.level.block.DoublePlantBlock;
import net.minecraft.world.level.block.VegetationBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.shapes.CollisionContext;
import net.minecraft.world.phys.shapes.VoxelShape;
import org.jspecify.annotations.Nullable;

/**
 * A short grass-like plant that grows on blocks in a support tag. Bone meal turns it into its
 * tall counterpart when one is configured.
 */
public class EsPlantBlock extends VegetationBlock implements BonemealableBlock {
	public static final MapCodec<EsPlantBlock> CODEC = simpleCodec(p -> new EsPlantBlock(EsTags.GRASS_SOIL, 13.0, null, p));

	private final TagKey<Block> support;
	private final VoxelShape shape;
	@Nullable
	private final Supplier<Block> grown;

	public EsPlantBlock(TagKey<Block> support, double height, @Nullable Supplier<Block> grown, Properties properties) {
		super(properties);
		this.support = support;
		this.shape = Block.column(12.0, 0.0, height);
		this.grown = grown;
	}

	@Override
	protected MapCodec<? extends VegetationBlock> codec() {
		return CODEC;
	}

	@Override
	protected VoxelShape getShape(BlockState state, BlockGetter level, BlockPos pos, CollisionContext context) {
		return this.shape;
	}

	@Override
	protected boolean mayPlaceOn(BlockState state, BlockGetter level, BlockPos pos) {
		return state.is(this.support);
	}

	@Override
	public boolean isValidBonemealTarget(LevelReader level, BlockPos pos, BlockState state) {
		return this.grown != null && this.grown.get().defaultBlockState().canSurvive(level, pos) && level.isEmptyBlock(pos.above());
	}

	@Override
	public boolean isBonemealSuccess(Level level, RandomSource random, BlockPos pos, BlockState state) {
		return true;
	}

	@Override
	public void performBonemeal(ServerLevel level, RandomSource random, BlockPos pos, BlockState state) {
		if (this.grown != null && this.grown.get() instanceof DoublePlantBlock) {
			DoublePlantBlock.placeAt(level, this.grown.get().defaultBlockState(), pos, 2);
		}
	}
}
