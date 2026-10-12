package com.mineception.block;

import com.mineception.ModContent;
import com.mineception.dream.LaptopData;
import com.mineception.dream.Theme;
import java.util.function.Consumer;
import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;
import net.minecraft.world.item.BlockItem;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.TooltipFlag;
import net.minecraft.world.item.component.TooltipDisplay;
import net.minecraft.world.level.block.Block;

/** The laptop item. Its tooltip says whether it already holds dreams (and how much has been changed in them). */
public class LaptopItem extends BlockItem {
	public LaptopItem(Block block, Properties properties) {
		super(block, properties);
	}

	@Override
	@SuppressWarnings("deprecation")
	public void appendHoverText(ItemStack stack, TooltipContext context, TooltipDisplay display, Consumer<Component> tooltip, TooltipFlag flag) {
		super.appendHoverText(stack, context, display, tooltip, flag);
		LaptopData data = stack.get(ModContent.LAPTOP_DATA);
		if (data == null) {
			tooltip.accept(Component.translatable("item.mineception.laptop.fresh").withStyle(ChatFormatting.GRAY));
			return;
		}
		int changes = 0;
		for (int depth = 1; depth <= Theme.DEPTHS; depth++) {
			changes += data.editCount(depth);
		}
		tooltip.accept(Component.translatable("item.mineception.laptop.dreams", changes).withStyle(ChatFormatting.GRAY));
		if (flag.isAdvanced()) {
			tooltip.accept(Component.translatable("item.mineception.laptop.seed", Long.toHexString(data.seed()))
				.withStyle(ChatFormatting.DARK_GRAY));
		}
	}
}
