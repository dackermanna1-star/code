package dev.calibercraft.client.input;

import com.mojang.blaze3d.platform.InputConstants;
import dev.calibercraft.CaliberCraft;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.minecraft.client.KeyMapping;
import org.lwjgl.glfw.GLFW;

/** Weapon keybindings (firing and aiming use the vanilla attack/use keys). */
public final class Keybinds {
	public static final KeyMapping.Category CATEGORY = KeyMapping.Category.register(CaliberCraft.id("weapons"));

	public static final KeyMapping RELOAD = register("reload", GLFW.GLFW_KEY_R);
	public static final KeyMapping FIRE_MODE = register("fire_mode", GLFW.GLFW_KEY_B);
	public static final KeyMapping AMMO_TYPE = register("ammo_type", GLFW.GLFW_KEY_N);
	public static final KeyMapping MELEE = register("melee", GLFW.GLFW_KEY_V);
	public static final KeyMapping INSPECT = register("inspect", GLFW.GLFW_KEY_I);
	public static final KeyMapping CUSTOMIZE = register("customize", GLFW.GLFW_KEY_G);
	public static final KeyMapping SETTINGS = register("settings", InputConstants.UNKNOWN.getValue());

	private Keybinds() {
	}

	private static KeyMapping register(String name, int key) {
		return KeyBindingHelper.registerKeyBinding(new KeyMapping("key.calibercraft." + name, InputConstants.Type.KEYSYM, key, CATEGORY));
	}

	public static void init() {
	}
}
