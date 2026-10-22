package dev.juukulius.item;

import dev.juukulius.character.JuliusAttachments;
import dev.juukulius.combat.SwordArts;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.ItemUseAnimation;
import net.minecraft.world.level.Level;

/**
 * The sword of House Juukulius. In normal hands it is an excellent knight's sword; while Julius is transformed his six
 * spirits clad it in Al Clarista's rainbow light, enabling the combo, the heavy strike, Al Clauzeria, and a charged
 * long-range Al Clarista wave (hold use, release to fire).
 */
public class JuukuliusSwordItem extends Item {
	public static final int MAX_USE_TICKS = 72000;

	public JuukuliusSwordItem(Properties properties) {
		super(properties);
	}

	@Override
	public InteractionResult use(Level level, Player player, InteractionHand hand) {
		if (hand != InteractionHand.MAIN_HAND || !isTransformed(player)) {
			return InteractionResult.PASS;
		}

		player.startUsingItem(hand);
		return InteractionResult.CONSUME;
	}

	@Override
	public int getUseDuration(ItemStack stack, LivingEntity entity) {
		return MAX_USE_TICKS;
	}

	@Override
	public ItemUseAnimation getUseAnimation(ItemStack stack) {
		return ItemUseAnimation.NONE;
	}

	@Override
	public void onUseTick(Level level, LivingEntity entity, ItemStack stack, int remainingTicks) {
		if (!level.isClientSide() && entity instanceof ServerPlayer player) {
			SwordArts.chargeTick(player, this.getUseDuration(stack, entity) - remainingTicks);
		}
	}

	@Override
	public boolean releaseUsing(ItemStack stack, Level level, LivingEntity entity, int remainingTicks) {
		if (!level.isClientSide() && entity instanceof ServerPlayer player) {
			return SwordArts.releaseCharge(player, this.getUseDuration(stack, entity) - remainingTicks);
		}

		return false;
	}

	private static boolean isTransformed(Player player) {
		return player.level().isClientSide() ? JuliusAttachments.appearance(player).transformed() : JuliusAttachments.data(player).transformed;
	}
}
