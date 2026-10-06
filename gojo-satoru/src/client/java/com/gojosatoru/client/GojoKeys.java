package com.gojosatoru.client;

import com.gojosatoru.GojoMod;
import com.gojosatoru.network.GojoNetwork.AbilityPayload;
import com.gojosatoru.power.Ability;
import com.mojang.blaze3d.platform.InputConstants;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import org.lwjgl.glfw.GLFW;

public final class GojoKeys {
    public static final KeyMapping.Category CATEGORY = KeyMapping.Category.register(GojoMod.id("gojo"));

    public static final KeyMapping TRANSFORM = key("transform", GLFW.GLFW_KEY_G);
    public static final KeyMapping INFINITY = key("infinity", GLFW.GLFW_KEY_H);
    public static final KeyMapping BLUE = key("blue", GLFW.GLFW_KEY_Z);
    public static final KeyMapping RED = key("red", GLFW.GLFW_KEY_R);
    public static final KeyMapping PURPLE = key("purple", GLFW.GLFW_KEY_V);
    public static final KeyMapping DOMAIN = key("domain", GLFW.GLFW_KEY_B);
    public static final KeyMapping TELEPORT = key("teleport", GLFW.GLFW_KEY_LEFT_ALT);

    private static boolean blueSent;

    private GojoKeys() {
    }

    private static KeyMapping key(String name, int defaultKey) {
        return KeyBindingHelper.registerKeyBinding(
                new KeyMapping("key.gojo." + name, InputConstants.Type.KEYSYM, defaultKey, CATEGORY));
    }

    public static void init() {
        // Loading the class registers the key mappings.
    }

    public static KeyMapping forAbility(Ability ability) {
        return switch (ability) {
            case TRANSFORM -> TRANSFORM;
            case INFINITY -> INFINITY;
            case BLUE -> BLUE;
            case RED -> RED;
            case PURPLE -> PURPLE;
            case DOMAIN -> DOMAIN;
            case TELEPORT -> TELEPORT;
        };
    }

    public static void tick(Minecraft minecraft) {
        if (minecraft.player == null || !ClientPlayNetworking.canSend(AbilityPayload.TYPE)) {
            blueSent = false;
            return;
        }
        tap(TRANSFORM, Ability.TRANSFORM);
        tap(INFINITY, Ability.INFINITY);
        tap(RED, Ability.RED);
        tap(PURPLE, Ability.PURPLE);
        tap(DOMAIN, Ability.DOMAIN);
        tap(TELEPORT, Ability.TELEPORT);

        // Blue is held: tell the server when the key goes down and when it comes back up.
        boolean clicked = false;
        while (BLUE.consumeClick()) {
            clicked = true;
        }
        if ((clicked || BLUE.isDown()) && !blueSent) {
            send(Ability.BLUE, true);
            blueSent = true;
        } else if (blueSent && !BLUE.isDown()) {
            send(Ability.BLUE, false);
            blueSent = false;
        }
    }

    private static void tap(KeyMapping key, Ability ability) {
        while (key.consumeClick()) {
            send(ability, true);
        }
    }

    private static void send(Ability ability, boolean pressed) {
        ClientPlayNetworking.send(new AbilityPayload(ability.ordinal(), pressed));
    }
}
