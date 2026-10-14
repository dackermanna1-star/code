package net.abyssaldescent.item;

import java.util.function.Consumer;
import net.abyssaldescent.item.combat.ProjectileTraits;
import net.abyssaldescent.item.effect.WeaponEffect;
import net.minecraft.network.chat.Component;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.projectile.Projectile;
import net.minecraft.world.item.BowItem;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.TooltipFlag;
import net.minecraft.world.item.component.TooltipDisplay;
import net.minecraft.world.level.Level;

/** A bow with vanilla draw and release; its traits ride on the arrows it fires. */
public class DungeonBowItem extends BowItem implements GearItem {
	private final GearSpec spec;

	public DungeonBowItem(GearSpec spec, Properties properties) {
		super(properties);
		this.spec = spec;
	}

	@Override
	public GearSpec spec() {
		return spec;
	}

	@Override
	protected Projectile createProjectile(Level level, LivingEntity shooter, ItemStack weapon, ItemStack ammo, boolean crit) {
		Projectile projectile = super.createProjectile(level, shooter, weapon, ammo, crit);
		for (WeaponEffect effect : spec.effects()) {
			effect.onProjectileLaunch(projectile, shooter, weapon);
		}
		ProjectileTraits.tag(projectile, this);
		return projectile;
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
