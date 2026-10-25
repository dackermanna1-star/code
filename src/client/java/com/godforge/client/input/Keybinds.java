package com.godforge.client.input;

import com.godforge.Godforge;
import com.godforge.client.hud.WeaponHud;
import com.godforge.client.screen.WeaponConfigScreen;
import com.godforge.network.CycleModePayload;
import com.godforge.weapon.GodWeaponItem;
import com.mojang.blaze3d.platform.InputConstants;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.item.ItemStack;
import org.lwjgl.glfw.GLFW;

public final class Keybinds {
	public static final KeyMapping.Category CATEGORY = KeyMapping.Category.register(Godforge.id("weapons"));
	public static final KeyMapping CYCLE_MODE = KeyBindingHelper.registerKeyBinding(
		new KeyMapping("key.godforge.cycle_mode", InputConstants.Type.KEYSYM, GLFW.GLFW_KEY_R, CATEGORY)
	);
	public static final KeyMapping CONFIGURE = KeyBindingHelper.registerKeyBinding(
		new KeyMapping("key.godforge.configure", InputConstants.Type.KEYSYM, GLFW.GLFW_KEY_G, CATEGORY)
	);

	private Keybinds() {
	}

	public static void init() {
	}

	public static void tick(Minecraft mc) {
		if (mc.player == null) {
			return;
		}
		while (CYCLE_MODE.consumeClick()) {
			if (holdingWeapon(mc)) {
				boolean backwards = mc.player.isShiftKeyDown();
				ClientPlayNetworking.send(new CycleModePayload(!backwards));
			}
		}
		while (CONFIGURE.consumeClick()) {
			if (holdingWeapon(mc) && mc.screen == null) {
				InteractionHand hand = WeaponHud.heldHand(mc.player);
				ItemStack stack = mc.player.getItemInHand(hand);
				mc.setScreen(new WeaponConfigScreen(stack, hand));
			}
		}
	}

	private static boolean holdingWeapon(Minecraft mc) {
		return mc.player.getMainHandItem().getItem() instanceof GodWeaponItem || mc.player.getOffhandItem().getItem() instanceof GodWeaponItem;
	}

	/** Short "[R] mode  [G] tune" hint for the HUD. */
	public static String hint() {
		return "[" + CYCLE_MODE.getTranslatedKeyMessage().getString() + "] [" + CONFIGURE.getTranslatedKeyMessage().getString() + "]";
	}
}
