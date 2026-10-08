package dev.portalgun.item;

import java.util.function.Consumer;
import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.TooltipFlag;
import net.minecraft.world.item.component.TooltipDisplay;

/** Bottled portal fluid. Carried in the inventory, it is poured into an empty portal gun automatically. */
public class PortalFluidItem extends Item {
	public PortalFluidItem(Properties properties) {
		super(properties);
	}

	@Override
	public void appendHoverText(ItemStack stack, TooltipContext context, TooltipDisplay display, Consumer<Component> out, TooltipFlag flag) {
		out.accept(Component.translatable("tooltip.portalgun.portal_fluid", PortalGunItem.CHARGES_PER_FLUID).withStyle(ChatFormatting.GRAY));
	}
}
