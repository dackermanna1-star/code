package dev.overkill.effect;

import dev.overkill.OverkillArsenal;
import dev.overkill.registry.ModDamageTypes;
import dev.overkill.registry.ModParticles;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.effect.MobEffect;
import net.minecraft.world.effect.MobEffectCategory;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraft.world.entity.ai.attributes.Attributes;

/** Crackling static: slows the target and zaps it every 15 ticks, making it twitch. */
public class ElectrifiedEffect extends MobEffect {
	public ElectrifiedEffect() {
		super(MobEffectCategory.HARMFUL, 0x7FE7FF, ModParticles.STATIC_SPARK);
		this.addAttributeModifier(Attributes.MOVEMENT_SPEED, OverkillArsenal.id("electrified_slow"), -0.35, AttributeModifier.Operation.ADD_MULTIPLIED_TOTAL);
	}

	@Override
	public boolean shouldApplyEffectTickThisTick(int duration, int amplifier) {
		return duration % 15 == 0;
	}

	@Override
	public boolean applyEffectTick(ServerLevel level, LivingEntity entity, int amplifier) {
		entity.hurtServer(level, ModDamageTypes.source(level, ModDamageTypes.ELECTRIFIED, null, null), 1.0F + amplifier * 0.5F);
		var random = entity.getRandom();
		entity.push((random.nextDouble() - 0.5) * 0.15, 0.05, (random.nextDouble() - 0.5) * 0.15);
		return true;
	}
}
