package net.abyssaldescent.item;

import java.util.function.Consumer;
import net.abyssaldescent.item.combat.CombatState;
import net.abyssaldescent.item.effect.WeaponEffect;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.TooltipFlag;
import net.minecraft.world.item.component.TooltipDisplay;

/**
 * Melee weapon (sword, dagger, greatsword or axe). Plays exactly like vanilla; its effects trigger from vanilla hits,
 * with the strongest ones requiring a fully charged swing or a critical hit.
 */
public class DungeonWeaponItem extends Item implements GearItem {
	private final GearSpec spec;

	public DungeonWeaponItem(GearSpec spec, Properties properties) {
		super(properties);
		this.spec = spec;
	}

	@Override
	public GearSpec spec() {
		return spec;
	}

	@Override
	public float getAttackDamageBonus(Entity target, float baseDamage, DamageSource source) {
		float bonus = 0.0F;
		if (source.getEntity() instanceof LivingEntity attacker) {
			for (WeaponEffect effect : spec.effects()) {
				bonus += effect.damageBonus(attacker, target, baseDamage);
			}
		}
		return bonus;
	}

	@Override
	public void hurtEnemy(ItemStack stack, LivingEntity target, LivingEntity attacker) {
		super.hurtEnemy(stack, target, attacker);
		if (!(attacker.level() instanceof ServerLevel level)) {
			return;
		}
		float charge = attacker instanceof Player player ? CombatState.lastCharge(player) : 1.0F;
		boolean crit = attacker instanceof Player player && CombatState.lastCrit(player);
		WeaponEffect.HitContext ctx = new WeaponEffect.HitContext(level, attacker, target, stack, charge, crit);
		for (WeaponEffect effect : spec.effects()) {
			effect.onHit(ctx);
		}
		if (target.isDeadOrDying()) {
			for (WeaponEffect effect : spec.effects()) {
				effect.onKill(ctx);
			}
		}
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
