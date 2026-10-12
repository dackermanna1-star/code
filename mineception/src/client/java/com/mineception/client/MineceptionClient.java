package com.mineception.client;

import com.mineception.ClientHooks;
import com.mineception.client.render.LaptopRendering;
import com.mineception.client.screen.LaptopScreen;
import net.fabricmc.api.ClientModInitializer;
import net.minecraft.client.Minecraft;

public class MineceptionClient implements ClientModInitializer {
	@Override
	public void onInitializeClient() {
		LaptopRendering.init();
		ClientHooks.openLaptop = pos -> Minecraft.getInstance().setScreen(new LaptopScreen(pos));
	}
}
