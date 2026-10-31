package com.jjkshowdown.effect;

import com.jjkshowdown.JjkShowdown;
import com.jjkshowdown.registry.ModParticles;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.effect.MobEffect;
import net.minecraft.world.effect.MobEffectCategory;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraft.world.entity.ai.attributes.Attributes;

/**
 * Unlimited Void's sure-hit: an infinite stream of information floods the brain. The victim cannot move, attack or
 * act. Mob AI is suspended and player input is locked by mixins; attribute modifiers stop movement server-side.
 */
public class InformationOverloadEffect extends MobEffect {
	public InformationOverloadEffect() {
		super(MobEffectCategory.HARMFUL, 0x9FE8FF, ModParticles.VOID_STAR);
		addAttributeModifier(Attributes.MOVEMENT_SPEED, JjkShowdown.id("information_overload_speed"), -1.0, AttributeModifier.Operation.ADD_MULTIPLIED_TOTAL);
		addAttributeModifier(Attributes.JUMP_STRENGTH, JjkShowdown.id("information_overload_jump"), -1.0, AttributeModifier.Operation.ADD_MULTIPLIED_TOTAL);
		addAttributeModifier(Attributes.ATTACK_DAMAGE, JjkShowdown.id("information_overload_attack"), -1.0, AttributeModifier.Operation.ADD_MULTIPLIED_TOTAL);
		addAttributeModifier(Attributes.FLYING_SPEED, JjkShowdown.id("information_overload_fly"), -1.0, AttributeModifier.Operation.ADD_MULTIPLIED_TOTAL);
	}

	@Override
	public boolean shouldApplyEffectTickThisTick(int duration, int amplifier) {
		return true;
	}

	@Override
	public boolean applyEffectTick(ServerLevel level, LivingEntity entity, int amplifier) {
		// hang in place: cancel horizontal momentum, let gravity act gently
		var v = entity.getDeltaMovement();
		entity.setDeltaMovement(v.x * 0.2, Math.min(v.y, 0.0) * 0.6, v.z * 0.2);
		entity.hurtMarked = true;
		return true;
	}
}
