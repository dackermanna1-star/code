package com.modernapartments.item;

import com.modernapartments.build.placement.PlacedBuilding;
import com.modernapartments.build.placement.PlacementManager;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.function.Consumer;
import net.minecraft.ChatFormatting;
import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.TooltipFlag;
import net.minecraft.world.item.component.TooltipDisplay;
import net.minecraft.world.item.context.UseOnContext;

/** Use twice on a building placed with a blueprint to remove it (restoring the land when possible). */
public class DemolitionPermitItem extends Item {
	private static final Map<UUID, UUID> CONFIRM = new HashMap<>();

	public DemolitionPermitItem(Properties properties) {
		super(properties);
	}

	@Override
	public InteractionResult useOn(UseOnContext context) {
		if (!(context.getLevel() instanceof ServerLevel level) || context.getPlayer() == null) {
			return InteractionResult.SUCCESS;
		}
		BlockPos pos = context.getClickedPos();
		PlacedBuilding building = PlacementManager.findAt(level, pos);
		if (building == null) {
			context.getPlayer().displayClientMessage(Component.translatable("message.modernapartments.no_building_here"), true);
			return InteractionResult.FAIL;
		}
		UUID player = context.getPlayer().getUUID();
		if (building.id().equals(CONFIRM.get(player))) {
			CONFIRM.remove(player);
			PlacementManager.demolish(level, building);
			context.getPlayer().displayClientMessage(Component.translatable("message.modernapartments.demolishing",
				building.complexType().displayName()), false);
			return InteractionResult.SUCCESS;
		}
		CONFIRM.put(player, building.id());
		context.getPlayer().displayClientMessage(Component.translatable("message.modernapartments.confirm_demolish",
			building.complexType().displayName()), false);
		return InteractionResult.SUCCESS;
	}

	@Override
	public void appendHoverText(ItemStack stack, TooltipContext context, TooltipDisplay display, Consumer<Component> tooltip,
			TooltipFlag flag) {
		tooltip.accept(Component.translatable("tooltip.modernapartments.demolition_permit").withStyle(ChatFormatting.GRAY));
	}
}
