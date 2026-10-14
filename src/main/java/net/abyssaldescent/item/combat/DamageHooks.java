package net.abyssaldescent.item.combat;

import net.abyssaldescent.item.armor.ArmorSets;
import net.abyssaldescent.item.relic.RelicKind;
import net.abyssaldescent.item.relic.Relics;
import net.abyssaldescent.registry.ModDamageTypes;
import net.abyssaldescent.registry.ModEffects;
import net.minecraft.core.Holder;
import net.minecraft.tags.EntityTypeTags;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.effect.MobEffect;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;

/** Central place for damage modifiers from potions, curses, relics and set bonuses (called from a mixin). */
public final class DamageHooks {
	private DamageHooks() {
	}

	public static float modify(LivingEntity victim, DamageSource source, float amount) {
		if (amount <= 0 || victim.level().isClientSide()) {
			return amount;
		}
		Entity attacker = source.getEntity();
		if (attacker instanceof Player player && player != victim) {
			if (Relics.isActive(player, RelicKind.CRACKED_PHYLACTERY) && player.getHealth() < player.getMaxHealth() * 0.3F) {
				amount *= 1.15F;
			}
			if (Relics.isActive(player, RelicKind.BLOOD_SIGIL) && victim.hasEffect(ModEffects.BLEEDING)) {
				amount *= 1.10F;
			}
			if (source.getDirectEntity() == player && ArmorSets.consumeVeil(player)) {
				amount *= 1.4F;
			}
		}
		MobEffectInstance warding = victim.getEffect(ModEffects.WARDING);
		if (warding != null) {
			amount *= Math.max(0.4F, 1.0F - 0.15F * (warding.getAmplifier() + 1));
		}
		if (victim.hasEffect(ModEffects.CURSE_FRAGILITY)) {
			amount *= 1.2F;
		}
		if (source.is(ModDamageTypes.SOUL_MAGIC) && victim.hasEffect(ModEffects.SOULWARD)) {
			amount *= 0.6F;
		}
		if (victim instanceof Player player) {
			if (attacker != null && attacker.getType().is(EntityTypeTags.UNDEAD) && Relics.isActive(player, RelicKind.HOLLOW_CROWN)) {
				amount *= 0.85F;
			}
			ArmorSets.onPlayerHurt(player);
		}
		return amount;
	}

	static boolean has(LivingEntity entity, Holder<MobEffect> effect) {
		return entity.hasEffect(effect);
	}
}
