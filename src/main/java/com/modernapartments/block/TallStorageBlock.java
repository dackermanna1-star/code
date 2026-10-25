package com.modernapartments.block;

import com.modernapartments.block.entity.StorageBlockEntity;
import com.mojang.serialization.MapCodec;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.RandomSource;
import net.minecraft.world.Containers;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.EntityBlock;
import net.minecraft.world.level.block.HorizontalDirectionalBlock;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.DoubleBlockHalf;
import net.minecraft.world.phys.BlockHitResult;
import org.jspecify.annotations.Nullable;

/** Tall furniture with an inventory stored in the lower half (fridge, wardrobe, lockers, parcel lockers). */
public class TallStorageBlock extends TallFurnitureBlock implements EntityBlock, StorageHolder {
	public static final MapCodec<TallStorageBlock> CODEC = simpleCodec(p -> new TallStorageBlock(p, 6, StorageSound.WOOD));

	private final int rows;
	private final StorageSound sound;

	public TallStorageBlock(Properties properties, int rows, StorageSound sound) {
		super(properties);
		this.rows = rows;
		this.sound = sound;
	}

	@Override
	protected MapCodec<? extends HorizontalDirectionalBlock> codec() {
		return CODEC;
	}

	@Override
	public int storageRows() {
		return rows;
	}

	@Override
	public StorageSound storageSound() {
		return sound;
	}

	@Override
	protected InteractionResult useWithoutItem(BlockState state, Level level, BlockPos pos, Player player, BlockHitResult hit) {
		if (!level.isClientSide() && level.getBlockEntity(lowerPos(state, pos)) instanceof StorageBlockEntity storage) {
			player.openMenu(storage);
		}
		return InteractionResult.SUCCESS;
	}

	@Override
	protected void tick(BlockState state, ServerLevel level, BlockPos pos, RandomSource random) {
		if (level.getBlockEntity(pos) instanceof StorageBlockEntity storage) {
			storage.recheckOpen();
		}
	}

	@Override
	protected void affectNeighborsAfterRemoval(BlockState state, ServerLevel level, BlockPos pos, boolean moved) {
		Containers.updateNeighboursAfterDestroy(state, level, pos);
	}

	@Override
	public @Nullable BlockEntity newBlockEntity(BlockPos pos, BlockState state) {
		return state.getValue(HALF) == DoubleBlockHalf.LOWER ? new StorageBlockEntity(pos, state) : null;
	}
}
