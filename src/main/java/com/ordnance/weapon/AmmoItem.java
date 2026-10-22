package com.ordnance.weapon;

import com.ordnance.explosion.ExplosionProfile;
import java.util.function.Consumer;
import net.minecraft.component.type.TooltipDisplayComponent;
import net.minecraft.item.Item;
import net.minecraft.item.ItemStack;
import net.minecraft.item.tooltip.TooltipType;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;

/** A round for a magazine weapon. */
public class AmmoItem extends Item implements ExplosiveItem {
	private final AmmoCategory category;
	private final ExplosionProfile profile;

	public AmmoItem(Settings settings, AmmoCategory category, ExplosionProfile profile) {
		super(settings);
		this.category = category;
		this.profile = profile;
	}

	public AmmoCategory category() {
		return this.category;
	}

	@Override
	public ExplosionProfile profile() {
		return this.profile;
	}

	@Override
	public void appendTooltip(ItemStack stack, TooltipContext context, TooltipDisplayComponent displayComponent, Consumer<Text> textConsumer, TooltipType type) {
		textConsumer.accept(Text.translatable(this.getTranslationKey() + ".desc").formatted(Formatting.GRAY));
	}
}
