package com.modernapartments.block;

import com.mojang.serialization.MapCodec;
import java.util.Optional;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.crafting.CampfireCookingRecipe;
import net.minecraft.world.item.crafting.RecipeHolder;
import net.minecraft.world.item.crafting.RecipeType;
import net.minecraft.world.item.crafting.SingleRecipeInput;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.HorizontalDirectionalBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.BlockHitResult;

/** Gas grill: switch it on, then use raw food on it to grill one item instantly. */
public class GrillBlock extends ToggleFurnitureBlock {
	public static final MapCodec<GrillBlock> CODEC = simpleCodec(GrillBlock::new);

	public GrillBlock(Properties properties) {
		super(properties, ToggleSettings.heat(0, ToggleSettings.Effect.GRILL, false));
	}

	@Override
	protected MapCodec<? extends HorizontalDirectionalBlock> codec() {
		return CODEC;
	}

	@Override
	protected InteractionResult useItemOn(ItemStack stack, BlockState state, Level level, BlockPos pos, Player player,
			InteractionHand hand, BlockHitResult hit) {
		if (stack.isEmpty() || !state.getValue(ModProperties.ON)) {
			return InteractionResult.TRY_WITH_EMPTY_HAND;
		}
		if (!(level instanceof ServerLevel serverLevel)) {
			return InteractionResult.SUCCESS;
		}
		SingleRecipeInput input = new SingleRecipeInput(stack);
		Optional<RecipeHolder<CampfireCookingRecipe>> recipe = serverLevel.recipeAccess().getRecipeFor(RecipeType.CAMPFIRE_COOKING, input, level);
		if (recipe.isEmpty()) {
			return InteractionResult.TRY_WITH_EMPTY_HAND;
		}
		ItemStack cooked = recipe.get().value().assemble(input, level.registryAccess());
		stack.consume(1, player);
		if (!player.getInventory().add(cooked)) {
			player.drop(cooked, false);
		}
		level.playSound(null, pos, SoundEvents.CAMPFIRE_CRACKLE, SoundSource.BLOCKS, 1.0F, 1.0F);
		return InteractionResult.SUCCESS;
	}
}
