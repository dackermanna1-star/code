package com.chaosunleashed.item;

import com.chaosunleashed.registry.ModSounds;
import net.minecraft.entity.effect.StatusEffectInstance;
import net.minecraft.entity.effect.StatusEffects;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.item.Item;
import net.minecraft.item.ItemStack;
import net.minecraft.particle.ParticleTypes;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.util.ActionResult;
import net.minecraft.util.Hand;
import net.minecraft.world.World;

/** Rare Kaiju loot: crush it for a surge of titanic power. */
public class KaijuHeartItem extends Item {
	public KaijuHeartItem(Settings settings) {
		super(settings);
	}

	@Override
	public ActionResult use(World world, PlayerEntity user, Hand hand) {
		ItemStack stack = user.getStackInHand(hand);
		if (world instanceof ServerWorld serverWorld) {
			user.addStatusEffect(new StatusEffectInstance(StatusEffects.STRENGTH, 20 * 180, 1));
			user.addStatusEffect(new StatusEffectInstance(StatusEffects.RESISTANCE, 20 * 180, 1));
			user.addStatusEffect(new StatusEffectInstance(StatusEffects.FIRE_RESISTANCE, 20 * 180, 0));
			user.addStatusEffect(new StatusEffectInstance(StatusEffects.REGENERATION, 20 * 30, 1));
			user.addStatusEffect(new StatusEffectInstance(StatusEffects.ABSORPTION, 20 * 120, 3));
			serverWorld.spawnParticles(ParticleTypes.TOTEM_OF_UNDYING, user.getX(), user.getBodyY(0.5), user.getZ(), 40, 0.5, 0.8, 0.5, 0.3);
			world.playSound(null, user.getX(), user.getY(), user.getZ(), ModSounds.KAIJU_ROAR, SoundCategory.PLAYERS, 0.6F, 1.6F);
			stack.decrementUnlessCreative(1, user);
			user.getItemCooldownManager().set(stack, 20 * 60);
		}
		return ActionResult.SUCCESS;
	}
}
