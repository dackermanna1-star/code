package com.chaosunleashed.item;

import com.chaosunleashed.events.blackhole.StabilizerCoreEntity;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.entity.projectile.ProjectileEntity;
import net.minecraft.item.Item;
import net.minecraft.item.ItemStack;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.sound.SoundEvents;
import net.minecraft.util.ActionResult;
import net.minecraft.util.Hand;
import net.minecraft.world.World;

/** Throwable: toss it into a Black Hole to collapse it safely. */
public class StabilizerCoreItem extends Item {
	public StabilizerCoreItem(Settings settings) {
		super(settings);
	}

	@Override
	public ActionResult use(World world, PlayerEntity user, Hand hand) {
		ItemStack stack = user.getStackInHand(hand);
		world.playSound(null, user.getX(), user.getY(), user.getZ(), SoundEvents.ENTITY_ENDER_PEARL_THROW, SoundCategory.NEUTRAL, 0.6F, 0.5F);
		if (world instanceof ServerWorld serverWorld) {
			ProjectileEntity.spawnWithVelocity(StabilizerCoreEntity::new, serverWorld, stack, user, 0.0F, 1.6F, 0.5F);
		}
		stack.decrementUnlessCreative(1, user);
		user.getItemCooldownManager().set(stack, 10);
		return ActionResult.SUCCESS;
	}
}
