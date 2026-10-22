package com.ordnance.client.fx;

import com.ordnance.weapon.FlamethrowerItem;
import com.ordnance.weapon.MagazineWeaponItem;
import net.minecraft.client.network.AbstractClientPlayerEntity;
import net.minecraft.client.render.entity.model.BipedEntityModel;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.entity.LivingEntity;
import net.minecraft.item.ItemStack;
import net.minecraft.util.Hand;
import net.minecraft.util.math.MathHelper;
import net.minecraft.util.math.RotationAxis;
import org.jspecify.annotations.Nullable;

/** Third-person arm poses and first-person view-model motion for the weapons. */
public final class WeaponPoses {
	private WeaponPoses() {
	}

	public static BipedEntityModel.@Nullable ArmPose armPose(LivingEntity player, ItemStack stack, Hand hand) {
		if (stack.getItem() instanceof MagazineWeaponItem) {
			boolean reloading = player.isUsingItem() && player.getActiveHand() == hand;
			return reloading ? BipedEntityModel.ArmPose.CROSSBOW_CHARGE : BipedEntityModel.ArmPose.CROSSBOW_HOLD;
		} else if (stack.getItem() instanceof FlamethrowerItem) {
			return BipedEntityModel.ArmPose.CROSSBOW_HOLD;
		}

		return null;
	}

	public static void applyViewModel(AbstractClientPlayerEntity player, Hand hand, ItemStack item, MatrixStack matrices, float tickProgress) {
		if (hand != Hand.MAIN_HAND || !(item.getItem() instanceof MagazineWeaponItem || item.getItem() instanceof FlamethrowerItem)) {
			return;
		}

		float kick = Recoil.kick(tickProgress);
		if (kick > 0.001F) {
			matrices.translate(0.0F, 0.03F * kick, 0.16F * kick);
			matrices.multiply(RotationAxis.POSITIVE_X.rotationDegrees(7.0F * kick));
		}

		if (item.getItem() instanceof MagazineWeaponItem weapon && player.isUsingItem() && player.getActiveHand() == hand) {
			float progress = weapon.reloadProgress(item, player);
			float ease = Math.min(1.0F, (player.getItemUseTime() + tickProgress) / 6.0F);
			float dip = ease * (0.6F + 0.4F * MathHelper.sin(progress * (float)Math.PI));
			matrices.translate(-0.08F * dip, -0.22F * dip, 0.05F * dip);
			matrices.multiply(RotationAxis.POSITIVE_X.rotationDegrees(-25.0F * dip));
			matrices.multiply(RotationAxis.POSITIVE_Z.rotationDegrees(12.0F * dip));
		}
	}
}
