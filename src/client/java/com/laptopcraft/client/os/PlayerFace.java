package com.laptopcraft.client.os;

import java.util.function.Supplier;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.PlayerFaceRenderer;
import net.minecraft.client.resources.DefaultPlayerSkin;
import net.minecraft.world.entity.player.PlayerSkin;
import org.jspecify.annotations.Nullable;

/** Draws the local player's face (with hat layer) — in a world or on the title screen. */
public final class PlayerFace {
	private static @Nullable Supplier<PlayerSkin> offlineLookup;

	private PlayerFace() {
	}

	public static void draw(GuiGraphics g, int x, int y, int size) {
		draw(g, x, y, size, 0xFFFFFFFF);
	}

	/** Face with an ARGB tint (use alpha to fade). */
	public static void draw(GuiGraphics g, int x, int y, int size, int tint) {
		PlayerFaceRenderer.draw(g, skin(), x, y, size, tint);
	}

	public static PlayerSkin skin() {
		Minecraft mc = Minecraft.getInstance();
		try {
			if (mc.player != null) {
				return mc.player.getSkin();
			}
			if (offlineLookup == null) {
				offlineLookup = mc.getSkinManager().createLookup(mc.getGameProfile(), false);
			}
			return offlineLookup.get();
		} catch (RuntimeException e) {
			return DefaultPlayerSkin.getDefaultSkin();
		}
	}
}
