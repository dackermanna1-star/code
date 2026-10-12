package com.extremesports.item;

import com.extremesports.registry.ModDataComponents;
import com.extremesports.server.ParkBuilder;
import java.util.function.Consumer;
import net.minecraft.ChatFormatting;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.TooltipFlag;
import net.minecraft.world.item.component.TooltipDisplay;
import net.minecraft.world.item.context.UseOnContext;
import net.minecraft.world.level.Level;

/**
 * Creative tool: use on the ground to build a complete skatepark section; sneak-use in the air to change prefab.
 */
public class ParkBuilderItem extends Item {
	public ParkBuilderItem(Properties properties) {
		super(properties);
	}

	public static ParkBuilder.Prefab prefab(ItemStack stack) {
		Integer mode = stack.get(ModDataComponents.BUILDER_MODE);
		return ParkBuilder.Prefab.byIndex(mode == null ? 0 : mode);
	}

	@Override
	public InteractionResult use(Level level, Player player, InteractionHand hand) {
		ItemStack stack = player.getItemInHand(hand);
		if (!player.isSecondaryUseActive()) {
			if (!level.isClientSide()) {
				player.displayClientMessage(Component.translatable("message.extremesports.builder_hint", prefabName(prefab(stack))), true);
			}
			return InteractionResult.PASS;
		}
		if (!level.isClientSide()) {
			ParkBuilder.Prefab next = ParkBuilder.Prefab.byIndex(prefab(stack).ordinal() + 1);
			stack.set(ModDataComponents.BUILDER_MODE, next.ordinal());
			player.displayClientMessage(Component.translatable("message.extremesports.builder_mode", prefabName(next)), true);
		}
		return InteractionResult.SUCCESS;
	}

	@Override
	public InteractionResult useOn(UseOnContext context) {
		Player player = context.getPlayer();
		if (player == null) {
			return InteractionResult.PASS;
		}
		if (player.isSecondaryUseActive()) {
			return use(context.getLevel(), player, context.getHand());
		}
		if (!player.isCreative()) {
			if (!context.getLevel().isClientSide()) {
				player.displayClientMessage(Component.translatable("message.extremesports.builder_creative"), true);
			}
			return InteractionResult.FAIL;
		}
		if (context.getLevel() instanceof ServerLevel serverLevel) {
			Direction facing = player.getDirection();
			BlockPos origin = context.getClickedPos().above().relative(facing, 2);
			ParkBuilder.Prefab prefab = prefab(context.getItemInHand());
			ParkBuilder.build(serverLevel, origin, facing, prefab);
			player.displayClientMessage(Component.translatable("message.extremesports.builder_built", prefabName(prefab)), true);
		}
		return InteractionResult.SUCCESS;
	}

	public static Component prefabName(ParkBuilder.Prefab prefab) {
		return Component.translatable("prefab.extremesports." + prefab.id);
	}

	@Override
	public void appendHoverText(ItemStack stack, TooltipContext context, TooltipDisplay display, Consumer<Component> tooltip, TooltipFlag flag) {
		tooltip.accept(Component.translatable("tooltip.extremesports.builder_mode", prefabName(prefab(stack))).withStyle(ChatFormatting.GOLD));
		tooltip.accept(Component.translatable("tooltip.extremesports.builder_use").withStyle(ChatFormatting.GRAY));
		tooltip.accept(Component.translatable("tooltip.extremesports.builder_cycle").withStyle(ChatFormatting.GRAY));
	}
}
