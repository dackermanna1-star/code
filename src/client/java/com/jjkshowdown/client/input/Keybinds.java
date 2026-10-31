package com.jjkshowdown.client.input;

import com.jjkshowdown.JjkShowdown;
import com.jjkshowdown.ability.AbilitySlot;
import com.mojang.blaze3d.platform.InputConstants;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.minecraft.client.KeyMapping;
import org.lwjgl.glfw.GLFW;

import java.util.EnumMap;
import java.util.Map;

/** All key mappings (rebindable under Options > Controls > "Jujutsu Showdown"). */
public final class Keybinds {
	public static final KeyMapping.Category CATEGORY = KeyMapping.Category.register(JjkShowdown.id("controls"));
	public static final Map<AbilitySlot, KeyMapping> ABILITY = new EnumMap<>(AbilitySlot.class);

	public static KeyMapping DODGE;
	public static KeyMapping BLOCK;
	public static KeyMapping CHARACTER_MENU;
	public static KeyMapping CONFIG_MENU;

	private Keybinds() {
	}

	private static KeyMapping key(String name, int code) {
		return KeyBindingHelper.registerKeyBinding(new KeyMapping("key.jjkshowdown." + name, InputConstants.Type.KEYSYM, code, CATEGORY));
	}

	public static void init() {
		ABILITY.put(AbilitySlot.PRIMARY, key("primary", GLFW.GLFW_KEY_R));
		ABILITY.put(AbilitySlot.SECONDARY, key("secondary", GLFW.GLFW_KEY_G));
		ABILITY.put(AbilitySlot.TERTIARY, key("tertiary", GLFW.GLFW_KEY_V));
		ABILITY.put(AbilitySlot.ULTIMATE, key("ultimate", GLFW.GLFW_KEY_B));
		ABILITY.put(AbilitySlot.TOGGLE, key("toggle", GLFW.GLFW_KEY_Z));
		ABILITY.put(AbilitySlot.DOMAIN, key("domain", GLFW.GLFW_KEY_H));
		ABILITY.put(AbilitySlot.HEAL, key("heal", GLFW.GLFW_KEY_Y));
		DODGE = key("dodge", GLFW.GLFW_KEY_LEFT_ALT);
		BLOCK = key("block", GLFW.GLFW_KEY_C);
		CHARACTER_MENU = key("character_menu", GLFW.GLFW_KEY_J);
		CONFIG_MENU = key("config_menu", GLFW.GLFW_KEY_K);
	}
}
