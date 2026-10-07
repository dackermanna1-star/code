package dev.visceral.effect;

import dev.visceral.VisceralConfig;
import dev.visceral.registry.VisceralDamageTypes;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.effect.MobEffect;
import net.minecraft.world.effect.MobEffectCategory;
import net.minecraft.world.entity.LivingEntity;

/**
 * Damage over time from open wounds. Higher amplifiers (several deep wounds) pulse faster.
 * The visuals (drips, trails, pools) are produced client-side from the synced wound list.
 */
public class BleedingEffect extends MobEffect {
	public BleedingEffect(MobEffectCategory category, int color) {
		super(category, color);
	}

	@Override
	public boolean applyEffectTick(ServerLevel level, LivingEntity entity, int amplifier) {
		VisceralConfig config = VisceralConfig.get();
		if (!config.bleedingDamage || config.bleedDamagePerPulse <= 0.0F) {
			return true;
		}
		float damage = config.bleedDamagePerPulse;
		if (!config.bleedingCanKill) {
			float health = entity.getHealth();
			if (health <= 1.0F) {
				return true;
			}
			damage = Math.min(damage, health - 1.0F);
		}
		entity.hurtServer(level, entity.damageSources().source(VisceralDamageTypes.BLEEDING), damage);
		return true;
	}

	@Override
	public boolean shouldApplyEffectTickThisTick(int duration, int amplifier) {
		int interval = Math.max(10, 40 - amplifier * 10);
		return duration % interval == 0;
	}
}
