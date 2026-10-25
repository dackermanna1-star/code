package com.modernapartments.item;

import com.modernapartments.ModConfig;
import com.modernapartments.build.ComplexType;
import com.modernapartments.build.placement.PlacementManager;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.function.Consumer;
import net.minecraft.ChatFormatting;
import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.TooltipFlag;
import net.minecraft.world.item.component.TooltipDisplay;
import net.minecraft.world.level.Level;

/**
 * Blueprint for one complex. Hold it to preview the footprint; right-click to choose the site and
 * right-click again to confirm; sneak + right-click to turn the entrance by 90 degrees.
 */
public class BlueprintItem extends Item {
	private static final int CONFIRM_TICKS = 200;
	private static final Map<UUID, Pending> PENDING = new HashMap<>();

	private record Pending(ComplexType type, BlockPos ground, int turns, long expires) {
	}

	private final ComplexType type;

	public BlueprintItem(Properties properties, ComplexType type) {
		super(properties);
		this.type = type;
	}

	public ComplexType complexType() {
		return type;
	}

	@Override
	public InteractionResult use(Level level, Player player, InteractionHand hand) {
		ItemStack stack = player.getItemInHand(hand);
		if (player.isSecondaryUseActive()) {
			int turns = (BlueprintTargeting.turns(stack) + 1) & 3;
			BlueprintTargeting.setTurns(stack, turns);
			if (!level.isClientSide()) {
				level.playSound(null, player.blockPosition(), SoundEvents.BOOK_PAGE_TURN, SoundSource.PLAYERS, 0.8F, 1.0F);
			}
			return InteractionResult.SUCCESS;
		}
		if (!(level instanceof ServerLevel serverLevel) || !(player instanceof ServerPlayer serverPlayer)) {
			return InteractionResult.SUCCESS;
		}
		BlueprintTargeting.Target target = BlueprintTargeting.target(level, player, type, stack);
		if (target == null) {
			player.displayClientMessage(Component.translatable("message.modernapartments.no_target"), true);
			return InteractionResult.FAIL;
		}
		Component error = PlacementManager.checkFits(serverLevel, target.transform());
		if (error != null) {
			player.displayClientMessage(error, true);
			return InteractionResult.FAIL;
		}
		if (PlacementManager.isBusy()) {
			player.displayClientMessage(Component.translatable("message.modernapartments.busy"), true);
			return InteractionResult.FAIL;
		}
		Pending pending = PENDING.get(player.getUUID());
		long now = level.getGameTime();
		int turns = BlueprintTargeting.turns(stack);
		if (pending != null && pending.type == type && pending.turns == turns && now < pending.expires
			&& pending.ground.distManhattan(target.frontCenter()) <= 3) {
			PENDING.remove(player.getUUID());
			long seed = level.random.nextLong();
			PlacementManager.start(serverLevel, type, seed, target.transform(), serverPlayer);
			level.playSound(null, player.blockPosition(), SoundEvents.UI_CARTOGRAPHY_TABLE_TAKE_RESULT, SoundSource.PLAYERS, 1.0F, 1.0F);
			if (!player.getAbilities().instabuild && ModConfig.get().consumeBlueprintsInSurvival) {
				stack.shrink(1);
			}
			return InteractionResult.SUCCESS;
		}
		PENDING.put(player.getUUID(), new Pending(type, target.frontCenter(), turns, now + CONFIRM_TICKS));
		player.displayClientMessage(Component.translatable("message.modernapartments.confirm_build", type.displayName(),
			type.sizeX(), type.sizeZ(), type.sizeY(), target.front().getName()), false);
		return InteractionResult.SUCCESS;
	}

	@Override
	public void appendHoverText(ItemStack stack, TooltipContext context, TooltipDisplay display, Consumer<Component> tooltip,
			TooltipFlag flag) {
		tooltip.accept(Component.translatable("tooltip.modernapartments.blueprint_" + type.id()).withStyle(ChatFormatting.GRAY));
		tooltip.accept(Component.translatable("tooltip.modernapartments.blueprint_size", type.sizeX(), type.sizeZ(), type.sizeY())
			.withStyle(ChatFormatting.DARK_GRAY));
		tooltip.accept(Component.translatable("tooltip.modernapartments.blueprint_usage").withStyle(ChatFormatting.BLUE));
	}
}
