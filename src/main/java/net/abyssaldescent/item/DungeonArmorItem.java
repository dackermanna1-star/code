package net.abyssaldescent.item;

import java.util.function.Consumer;
import net.minecraft.network.chat.Component;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.TooltipFlag;
import net.minecraft.world.item.component.TooltipDisplay;

/** Armour piece that belongs to a set; bonuses are applied by {@link net.abyssaldescent.item.armor.ArmorSets}. */
public class DungeonArmorItem extends Item implements GearItem {
	private final GearSpec spec;

	public DungeonArmorItem(GearSpec spec, Properties properties) {
		super(properties);
		this.spec = spec;
	}

	@Override
	public GearSpec spec() {
		return spec;
	}

	@Override
	public Component getName(ItemStack stack) {
		return GearTooltips.styledName(super.getName(stack), spec);
	}

	@Override
	@SuppressWarnings("deprecation")
	public void appendHoverText(ItemStack stack, TooltipContext context, TooltipDisplay display, Consumer<Component> out, TooltipFlag flag) {
		GearTooltips.append(stack, spec, out);
	}
}
