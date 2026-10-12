package com.chaosunleashed.item;

import com.chaosunleashed.events.alien.PlasmaBoltEntity;
import com.chaosunleashed.registry.ModSounds;
import net.minecraft.entity.EquipmentSlot;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.item.Item;
import net.minecraft.item.ItemStack;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.util.ActionResult;
import net.minecraft.util.Hand;
import net.minecraft.world.World;

/** Alien tech: fires a fast plasma bolt that burns whatever it hits. Uses durability instead of ammo. */
public class PlasmaPistolItem extends Item {
	public PlasmaPistolItem(Settings settings) {
		super(settings);
	}

	@Override
	public ActionResult use(World world, PlayerEntity user, Hand hand) {
		ItemStack stack = user.getStackInHand(hand);
		if (world instanceof ServerWorld serverWorld) {
			PlasmaBoltEntity bolt = new PlasmaBoltEntity(serverWorld, user);
			bolt.setDamage(7.0F);
			bolt.setPosition(user.getX(), user.getEyeY() - 0.15, user.getZ());
			bolt.setVelocity(user, user.getPitch(), user.getYaw(), 0.0F, 1.8F, 0.5F);
			serverWorld.spawnEntity(bolt);
			stack.damage(1, user, hand == Hand.MAIN_HAND ? EquipmentSlot.MAINHAND : EquipmentSlot.OFFHAND);
		}
		world.playSound(null, user.getX(), user.getY(), user.getZ(), ModSounds.PLASMA_SHOOT, SoundCategory.PLAYERS, 0.9F, 1.2F);
		user.getItemCooldownManager().set(stack, 8);
		return ActionResult.SUCCESS;
	}
}
