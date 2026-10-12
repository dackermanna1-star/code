package com.mineception.client.screen;

import net.minecraft.client.gui.screens.Screen;
import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;

/**
 * The laptop: play the Minecraft that runs on it, and dive into the laptops inside it.
 *
 * <p>PLACEHOLDER (scaffold).
 */
public class LaptopScreen extends Screen {
	private final BlockPos pos;

	public LaptopScreen(BlockPos pos) {
		super(Component.translatable("screen.mineception.laptop"));
		this.pos = pos.immutable();
	}

	@Override
	public boolean isPauseScreen() {
		return false;
	}
}
