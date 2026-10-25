package com.modernapartments.block;

import com.modernapartments.block.entity.FixtureBlockEntity;
import com.modernapartments.registry.ModBlockEntities;
import com.mojang.serialization.MapCodec;
import net.minecraft.core.BlockPos;
import net.minecraft.core.component.DataComponents;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.RandomSource;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.ItemUtils;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.alchemy.PotionContents;
import net.minecraft.world.item.alchemy.Potions;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.EntityBlock;
import net.minecraft.world.level.block.HorizontalDirectionalBlock;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.entity.BlockEntityTicker;
import net.minecraft.world.level.block.entity.BlockEntityType;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.phys.BlockHitResult;
import org.jspecify.annotations.Nullable;

/**
 * Appliance, screen or fixture with an on/off state: TVs, sinks, washers, showers, microwaves...
 * Fixtures with visual effects get a lightweight block entity that spawns particles client-side.
 */
public class ToggleFurnitureBlock extends FurnitureBlock implements EntityBlock {
	public static final MapCodec<ToggleFurnitureBlock> CODEC = simpleCodec(p -> new ToggleFurnitureBlock(p, ToggleSettings.screen(0)));

	private final ToggleSettings settings;

	public ToggleFurnitureBlock(Properties properties, ToggleSettings settings) {
		super(properties, settings.wallMounted());
		this.settings = settings;
		this.registerDefaultState(this.defaultBlockState().setValue(ModProperties.ON, false));
	}

	public ToggleSettings settings() {
		return settings;
	}

	@Override
	protected MapCodec<? extends HorizontalDirectionalBlock> codec() {
		return CODEC;
	}

	@Override
	protected void createBlockStateDefinition(StateDefinition.Builder<Block, BlockState> builder) {
		super.createBlockStateDefinition(builder);
		builder.add(ModProperties.ON);
	}

	@Override
	protected String shapeKey(BlockState state) {
		return state.getValue(ModProperties.ON) ? "on" : "off";
	}

	@Override
	protected InteractionResult useItemOn(ItemStack stack, BlockState state, Level level, BlockPos pos, Player player,
			InteractionHand hand, BlockHitResult hit) {
		if (settings.waterSource() && state.getValue(ModProperties.ON)) {
			ItemStack filled = null;
			if (stack.is(Items.GLASS_BOTTLE)) {
				filled = PotionContents.createItemStack(Items.POTION, Potions.WATER);
			} else if (stack.is(Items.BUCKET)) {
				filled = new ItemStack(Items.WATER_BUCKET);
			}
			if (filled != null) {
				if (!level.isClientSide()) {
					player.setItemInHand(hand, ItemUtils.createFilledResult(stack, player, filled));
					level.playSound(null, pos, stack.is(Items.BUCKET) ? SoundEvents.BUCKET_FILL : SoundEvents.BOTTLE_FILL,
						SoundSource.BLOCKS, 1.0F, 1.0F);
				}
				return InteractionResult.SUCCESS;
			}
		}
		return InteractionResult.TRY_WITH_EMPTY_HAND;
	}

	@Override
	protected InteractionResult useWithoutItem(BlockState state, Level level, BlockPos pos, Player player, BlockHitResult hit) {
		if (!level.isClientSide()) {
			boolean on = !state.getValue(ModProperties.ON);
			level.setBlock(pos, state.setValue(ModProperties.ON, on), Block.UPDATE_ALL);
			level.playSound(null, pos, settings.toggleSound(), SoundSource.BLOCKS, 0.5F, on ? 1.2F : 0.9F);
			if (on && settings.autoOffTicks() > 0) {
				level.scheduleTick(pos, this, settings.autoOffTicks());
			}
		}
		return InteractionResult.SUCCESS;
	}

	@Override
	protected void tick(BlockState state, ServerLevel level, BlockPos pos, RandomSource random) {
		if (settings.autoOffTicks() > 0 && state.getValue(ModProperties.ON)) {
			level.setBlock(pos, state.setValue(ModProperties.ON, false), Block.UPDATE_ALL);
			if (settings.doneSound() != null) {
				level.playSound(null, pos, settings.doneSound(), SoundSource.BLOCKS, 0.8F, 1.6F);
			}
		}
	}

	@Override
	public @Nullable BlockEntity newBlockEntity(BlockPos pos, BlockState state) {
		return settings.hasEffects() ? new FixtureBlockEntity(pos, state) : null;
	}

	@Override
	public <T extends BlockEntity> @Nullable BlockEntityTicker<T> getTicker(Level level, BlockState state, BlockEntityType<T> type) {
		if (!level.isClientSide() || !settings.hasEffects() || type != ModBlockEntities.FIXTURE) {
			return null;
		}
		return (l, p, s, be) -> FixtureBlockEntity.clientTick(l, p, s, settings.effect());
	}
}
