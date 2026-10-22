package dev.juukulius.client.input;

import com.mojang.blaze3d.platform.InputConstants;
import dev.juukulius.JuliusMod;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.minecraft.client.KeyMapping;
import org.lwjgl.glfw.GLFW;

/** Configurable controls (Options → Controls → Key Binds → "Julius Juukulius"). */
public final class JuliusKeys {
	public static final KeyMapping.Category CATEGORY = KeyMapping.Category.register(JuliusMod.id("controls"));

	/** Transform into Julius / revert. */
	public static final KeyMapping TRANSFORM = register("transform", GLFW.GLFW_KEY_J);
	/** Tap: next spirit (sneak: previous). Hold: open the spirit wheel. */
	public static final KeyMapping SPIRIT_SELECT = register("spirit_select", GLFW.GLFW_KEY_R);
	/** The selected spirit's art (sneak: its combination art, e.g. El Fura with Aro, Ul Gora with Ia). */
	public static final KeyMapping SPIRIT_ART = register("spirit_art", GLFW.GLFW_KEY_Z);
	/** Heavy strike (sneak: Al Clauzeria). */
	public static final KeyMapping SWORD_SPECIAL = register("sword_special", GLFW.GLFW_KEY_V);
	/** Al Cranvel. */
	public static final KeyMapping ULTIMATE = register("ultimate", GLFW.GLFW_KEY_B);
	/** Dismiss the spirits to their crystals / summon them back. */
	public static final KeyMapping DISMISS = register("dismiss_spirits", GLFW.GLFW_KEY_K);
	/** Open the client settings (unbound by default). */
	public static final KeyMapping SETTINGS = register("settings", InputConstants.UNKNOWN.getValue());

	private JuliusKeys() {
	}

	private static KeyMapping register(String name, int key) {
		return KeyBindingHelper.registerKeyBinding(new KeyMapping("key.julius_juukulius." + name, InputConstants.Type.KEYSYM, key, CATEGORY));
	}

	public static void init() {
	}
}
