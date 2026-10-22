package com.ordnance.client.fx;

import com.ordnance.weapon.FlamethrowerItem;
import com.ordnance.weapon.GrenadeItem;
import com.ordnance.weapon.MagazineWeaponItem;
import net.minecraft.client.network.AbstractClientPlayerEntity;
import net.minecraft.client.render.entity.model.BipedEntityModel;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.entity.LivingEntity;
import net.minecraft.item.ItemStack;
import net.minecraft.util.Arm;
import net.minecraft.util.Hand;
import net.minecraft.util.math.MathHelper;
import net.minecraft.util.math.RotationAxis;
import org.jspecify.annotations.Nullable;

/** Third-person arm poses and first-person view-model motion for the weapons. */
public final class WeaponPoses {
	/** Where a held grenade sits in first-person view space (vanilla equip offset plus the model's transform). */
	private static final float GRENADE_PIVOT_X = 0.62F;
	private static final float GRENADE_PIVOT_Y = -0.36F;
	private static final float GRENADE_PIVOT_Z = -0.91F;

	private WeaponPoses() {
	}

	public static BipedEntityModel.@Nullable ArmPose armPose(LivingEntity player, ItemStack stack, Hand hand) {
		if (stack.getItem() instanceof MagazineWeaponItem) {
			boolean reloading = player.isUsingItem() && player.getActiveHand() == hand;
			return reloading ? BipedEntityModel.ArmPose.CROSSBOW_CHARGE : BipedEntityModel.ArmPose.CROSSBOW_HOLD;
		} else if (stack.getItem() instanceof FlamethrowerItem) {
			return BipedEntityModel.ArmPose.CROSSBOW_HOLD;
		} else if (stack.getItem() instanceof GrenadeItem && player.isUsingItem() && player.getActiveHand() == hand) {
			return BipedEntityModel.ArmPose.THROW_TRIDENT;
		}

		return null;
	}

	public static void applyViewModel(AbstractClientPlayerEntity player, Hand hand, ItemStack item, MatrixStack matrices, float tickProgress) {
		if (item.getItem() instanceof GrenadeItem) {
			if (player.isUsingItem() && player.getActiveHand() == hand) {
				// Wind-up: draw the grenade back and up beside the head, tilted back about its own centre.
				float windUp = Math.min(1.0F, (player.getItemUseTime() + tickProgress) / GrenadeItem.FULL_THROW_TICKS);
				float ease = windUp * (2.0F - windUp);
				boolean rightArm = (hand == Hand.MAIN_HAND) == (player.getMainArm() == Arm.RIGHT);
				float side = rightArm ? 1.0F : -1.0F;
				matrices.translate(0.06F * side * ease, 0.12F * ease, 0.2F * ease);
				matrices.translate(GRENADE_PIVOT_X * side, GRENADE_PIVOT_Y, GRENADE_PIVOT_Z);
				matrices.multiply(RotationAxis.POSITIVE_X.rotationDegrees(25.0F * ease));
				matrices.multiply(RotationAxis.POSITIVE_Z.rotationDegrees(-12.0F * side * ease));
				matrices.translate(-GRENADE_PIVOT_X * side, -GRENADE_PIVOT_Y, -GRENADE_PIVOT_Z);
			}

			return;
		}

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
