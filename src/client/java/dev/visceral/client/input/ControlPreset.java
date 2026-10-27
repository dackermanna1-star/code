package dev.visceral.client.input;

import com.mojang.blaze3d.platform.InputConstants;
import dev.visceral.Visceral;
import dev.visceral.client.config.ClientConfig;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.client.Options;
import net.minecraft.client.gui.components.toasts.SystemToast;
import net.minecraft.network.chat.Component;
import org.lwjgl.glfw.GLFW;

/**
 * The GTA-style control scheme: hold Left Shift to sprint, Left Ctrl to crouch, E to lock on,
 * Q to kick. Vanilla bindings that would collide are moved (inventory to I, drop item to G).
 * Applied once on first launch (configurable), only to bindings still at their vanilla default,
 * and fully reversible from the settings screen.
 */
public final class ControlPreset {
	private ControlPreset() {
	}

	public static void applyOnFirstLaunch(Minecraft mc) {
		ClientConfig cfg = ClientConfig.get();
		if (!cfg.applyControlPreset || cfg.controlPresetApplied) return;
		apply(mc, false);
		cfg.controlPresetApplied = true;
		ClientConfig.save();
		mc.getToastManager().addToast(new SystemToast(SystemToast.SystemToastId.PERIODIC_NOTIFICATION,
			Component.translatable("visceral.toast.controls.title"), Component.translatable("visceral.toast.controls.body")));
	}

	/** @param force rebind even if the user customised the vanilla key. */
	public static void apply(Minecraft mc, boolean force) {
		Options o = mc.options;
		rebind(o.keySprint, GLFW.GLFW_KEY_LEFT_CONTROL, GLFW.GLFW_KEY_LEFT_SHIFT, force);
		rebind(o.keyShift, GLFW.GLFW_KEY_LEFT_SHIFT, GLFW.GLFW_KEY_LEFT_CONTROL, force);
		rebind(o.keyInventory, GLFW.GLFW_KEY_E, GLFW.GLFW_KEY_I, force);
		rebind(o.keyDrop, GLFW.GLFW_KEY_Q, GLFW.GLFW_KEY_G, force);
		rebind(Keybinds.lockOn, -2, GLFW.GLFW_KEY_E, true);
		rebind(Keybinds.kick, -2, GLFW.GLFW_KEY_Q, true);
		KeyMapping.resetMapping();
		o.save();
		Visceral.LOGGER.info("Applied Visceral control preset");
	}

	public static void revert(Minecraft mc) {
		Options o = mc.options;
		o.keySprint.setKey(o.keySprint.getDefaultKey());
		o.keyShift.setKey(o.keyShift.getDefaultKey());
		o.keyInventory.setKey(o.keyInventory.getDefaultKey());
		o.keyDrop.setKey(o.keyDrop.getDefaultKey());
		// Our keys move off E/Q so vanilla inventory and drop work again.
		Keybinds.lockOn.setKey(InputConstants.Type.KEYSYM.getOrCreate(GLFW.GLFW_KEY_R));
		Keybinds.kick.setKey(InputConstants.Type.KEYSYM.getOrCreate(GLFW.GLFW_KEY_Z));
		KeyMapping.resetMapping();
		o.save();
	}

	private static void rebind(KeyMapping key, int expectedDefault, int target, boolean force) {
		boolean atDefault = expectedDefault == -2 || key.saveString().equals(InputConstants.Type.KEYSYM.getOrCreate(expectedDefault).getName());
		if (force || atDefault) key.setKey(InputConstants.Type.KEYSYM.getOrCreate(target));
	}
}
