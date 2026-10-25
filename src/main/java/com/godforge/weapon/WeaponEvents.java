package com.godforge.weapon;

import com.godforge.weapon.items.GodfistItem;
import net.fabricmc.fabric.api.event.player.AttackBlockCallback;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.item.ItemStack;

/** Hooks vanilla interactions that the weapons extend. */
public final class WeaponEvents {
	private WeaponEvents() {
	}

	public static void init() {
		// The Godfist doesn't mine: punching terrain makes it explode into rubble.
		AttackBlockCallback.EVENT.register((player, level, hand, pos, direction) -> {
			if (hand != InteractionHand.MAIN_HAND || player.isSpectator()) {
				return InteractionResult.PASS;
			}
			ItemStack stack = player.getItemInHand(hand);
			if (!(stack.getItem() instanceof GodfistItem fist)) {
				return InteractionResult.PASS;
			}
			if (level instanceof ServerLevel serverLevel && player instanceof ServerPlayer serverPlayer) {
				if (WeaponAccess.denyReason(serverPlayer, fist.type(), fist.type().mode(0), false) == null) {
					fist.punchBlock(serverLevel, serverPlayer, stack, pos);
				}
			}
			return InteractionResult.SUCCESS;
		});
	}
}
