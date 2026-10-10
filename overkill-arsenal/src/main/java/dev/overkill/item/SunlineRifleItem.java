package dev.overkill.item;

import dev.overkill.weapon.SunlineStrike;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;

/**
 * Sunline Rifle: right-click traces an instant beam up to 160 blocks. 0.6 seconds later everything
 * on the line erupts in a chain of fiery explosions.
 */
public class SunlineRifleItem extends Item {
	public static final int COOLDOWN_TICKS = 100;

	public SunlineRifleItem(Item.Properties properties) {
		super(properties);
	}

	@Override
	public InteractionResult use(Level level, Player player, InteractionHand hand) {
		ItemStack stack = player.getItemInHand(hand);
		if (level instanceof ServerLevel serverLevel) {
			SunlineStrike.fire(serverLevel, player, hand);
			player.getCooldowns().addCooldown(stack, COOLDOWN_TICKS);
		}
		return InteractionResult.CONSUME;
	}
}
