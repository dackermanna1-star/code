package com.extremesports.client.input;

import com.extremesports.ExtremeSports;
import com.mojang.blaze3d.platform.InputConstants;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.minecraft.client.KeyMapping;
import org.lwjgl.glfw.GLFW;

/** Trick and utility key bindings; all rebindable in Controls under "Extreme Sports". */
public final class Keybinds {
	public static final KeyMapping.Category CATEGORY = KeyMapping.Category.register(ExtremeSports.id("controls"));
	public static final KeyMapping FLIP = register("flip", GLFW.GLFW_KEY_R);
	public static final KeyMapping GRAB = register("grab", GLFW.GLFW_KEY_G);
	public static final KeyMapping GRIND = register("grind", GLFW.GLFW_KEY_V);
	public static final KeyMapping WHIP = register("whip", GLFW.GLFW_KEY_Z);
	public static final KeyMapping MENU = register("menu", GLFW.GLFW_KEY_J);
	public static final KeyMapping REMOUNT = register("remount", GLFW.GLFW_KEY_B);
	public static final KeyMapping PRACTICE_RESET = register("practice_reset", GLFW.GLFW_KEY_H);

	private static KeyMapping register(String name, int key) {
		return KeyBindingHelper.registerKeyBinding(new KeyMapping("key.extremesports." + name, InputConstants.Type.KEYSYM, key, CATEGORY));
	}

	private Keybinds() {
	}

	public static void init() {
	}
}
