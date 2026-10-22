package com.ordnance.weapon;

import net.minecraft.entity.LivingEntity;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.entity.player.PlayerInventory;
import net.minecraft.item.Item;
import net.minecraft.item.ItemStack;
import net.minecraft.util.Arm;
import net.minecraft.util.math.MathHelper;
import net.minecraft.util.math.Vec3d;
import org.jspecify.annotations.Nullable;

/** Inventory and geometry helpers shared by the weapons. */
public final class WeaponHelper {
	private WeaponHelper() {
	}

	/** First ammo stack of the category: off hand first, then the inventory in slot order (hotbar first). */
	@Nullable
	public static ItemStack findAmmo(PlayerEntity player, AmmoCategory category) {
		ItemStack offHand = player.getOffHandStack();
		if (offHand.getItem() instanceof AmmoItem ammo && ammo.category() == category) {
			return offHand;
		}

		PlayerInventory inventory = player.getInventory();
		for (int i = 0; i < inventory.size(); i++) {
			ItemStack stack = inventory.getStack(i);
			if (stack.getItem() instanceof AmmoItem ammo && ammo.category() == category) {
				return stack;
			}
		}

		return null;
	}

	public static boolean hasAmmo(PlayerEntity player, AmmoCategory category) {
		return player.isInCreativeMode() || findAmmo(player, category) != null;
	}

	/** Removes one round (not in creative) and returns its type; creative players always get one. */
	@Nullable
	public static AmmoItem takeAmmo(PlayerEntity player, AmmoCategory category) {
		ItemStack stack = findAmmo(player, category);
		if (stack == null) {
			return player.isInCreativeMode() ? category.defaultAmmo() : null;
		}

		AmmoItem ammo = (AmmoItem)stack.getItem();
		if (!player.isInCreativeMode()) {
			stack.decrement(1);
		}

		return ammo;
	}

	public static int count(PlayerEntity player, Item item) {
		PlayerInventory inventory = player.getInventory();
		int total = 0;
		for (int i = 0; i < inventory.size(); i++) {
			ItemStack stack = inventory.getStack(i);
			if (stack.isOf(item)) {
				total += stack.getCount();
			}
		}

		return total;
	}

	public static int countAmmo(PlayerEntity player, AmmoCategory category) {
		PlayerInventory inventory = player.getInventory();
		int total = 0;
		for (int i = 0; i < inventory.size(); i++) {
			ItemStack stack = inventory.getStack(i);
			if (stack.getItem() instanceof AmmoItem ammo && ammo.category() == category) {
				total += stack.getCount();
			}
		}

		return total;
	}

	/** Consumes one of the item (not in creative). Returns false if the player has none. */
	public static boolean consume(PlayerEntity player, Item item) {
		if (player.isInCreativeMode()) {
			return true;
		}

		PlayerInventory inventory = player.getInventory();
		for (int i = 0; i < inventory.size(); i++) {
			ItemStack stack = inventory.getStack(i);
			if (stack.isOf(item)) {
				stack.decrement(1);
				return true;
			}
		}

		return false;
	}

	/** Horizontal unit vector to the entity's right (accounts for left-handed players). */
	public static Vec3d right(LivingEntity entity, float yaw) {
		float rad = yaw * (float)(Math.PI / 180.0);
		Vec3d right = new Vec3d(-MathHelper.cos(rad), 0.0, -MathHelper.sin(rad));
		return entity.getMainArm() == Arm.LEFT ? right.multiply(-1.0) : right;
	}

	/** Point in front of the eyes, offset sideways towards the weapon hand and downwards. */
	public static Vec3d muzzle(LivingEntity entity, double forward, double side, double down) {
		Vec3d look = entity.getRotationVec(1.0F);
		return entity.getEyePos().add(look.multiply(forward)).add(right(entity, entity.getYaw()).multiply(side)).add(0.0, -down, 0.0);
	}
}
