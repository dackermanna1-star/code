package dev.overkill.item;

import dev.overkill.weapon.SunlineStrike;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;

/**
 * Sunline Rifle: hold right-click and aim the laser anywhere, like a laser pointer, for up to
 * 6 seconds. Let go and, 0.6 seconds later, everywhere it pointed explodes. The shot itself is run
 * by {@link SunlineStrike}.
 */
public class SunlineRifleItem extends Item {
	public SunlineRifleItem(Item.Properties properties) {
		super(properties);
	}

	@Override
	public int getUseDuration(ItemStack stack, LivingEntity user) {
		return SunlineStrike.MAX_AIM_TICKS;
	}

	@Override
	public InteractionResult use(Level level, Player player, InteractionHand hand) {
		ItemStack stack = player.getItemInHand(hand);
		player.startUsingItem(hand);
		if (level instanceof ServerLevel serverLevel) {
			SunlineStrike.start(serverLevel, player, hand, stack);
		}
		return InteractionResult.CONSUME;
	}

	@Override
	public boolean releaseUsing(ItemStack stack, Level level, LivingEntity user, int remaining) {
		// The strike arms itself as soon as it sees the trigger released; the cooldown starts right away.
		if (user instanceof Player player && !level.isClientSide()) {
			player.getCooldowns().addCooldown(stack, SunlineStrike.COOLDOWN_TICKS);
		}
		return true;
	}

	@Override
	public ItemStack finishUsingItem(ItemStack stack, Level level, LivingEntity user) {
		if (user instanceof Player player && !level.isClientSide()) {
			player.getCooldowns().addCooldown(stack, SunlineStrike.COOLDOWN_TICKS);
		}
		return stack;
	}
}
