package dev.visceral.client.input;

import dev.visceral.Visceral;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.minecraft.client.KeyMapping;
import org.lwjgl.glfw.GLFW;

public final class Keybinds {
	public static final KeyMapping.Category CATEGORY = KeyMapping.Category.register(Visceral.id("combat"));
	public static KeyMapping lockOn;
	public static KeyMapping kick;
	public static KeyMapping swapShoulder;
	public static KeyMapping openConfig;

	private Keybinds() {
	}

	public static void register() {
		lockOn = KeyBindingHelper.registerKeyBinding(new KeyMapping("key.visceral.lock_on", GLFW.GLFW_KEY_E, CATEGORY));
		kick = KeyBindingHelper.registerKeyBinding(new KeyMapping("key.visceral.kick", GLFW.GLFW_KEY_Q, CATEGORY));
		swapShoulder = KeyBindingHelper.registerKeyBinding(new KeyMapping("key.visceral.swap_shoulder", GLFW.GLFW_KEY_V, CATEGORY));
		openConfig = KeyBindingHelper.registerKeyBinding(new KeyMapping("key.visceral.config", GLFW.GLFW_KEY_O, CATEGORY));
	}
}
