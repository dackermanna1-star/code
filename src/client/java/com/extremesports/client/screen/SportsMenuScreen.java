package com.extremesports.client.screen;

import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;
import org.jspecify.annotations.Nullable;

public class SportsMenuScreen extends Screen {
	private final @Nullable Screen parent;

	public SportsMenuScreen(@Nullable Screen parent) {
		super(Component.translatable("screen.extremesports.menu"));
		this.parent = parent;
	}

	@Override
	public void onClose() {
		minecraft.setScreen(parent);
	}
}
