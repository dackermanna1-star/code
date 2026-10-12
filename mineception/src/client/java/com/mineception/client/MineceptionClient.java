package com.mineception.client;

import com.mineception.ClientHooks;
import com.mineception.client.render.LaptopRendering;
import com.mineception.client.screen.LaptopScreen;
import net.fabricmc.api.ClientModInitializer;
import net.minecraft.client.Minecraft;

/** Client entrypoint: the live laptop screens in the world, and the laptop screen that opens when a laptop is used. */
public class MineceptionClient implements ClientModInitializer {
	@Override
	public void onInitializeClient() {
		LaptopRendering.init();
		ClientHooks.openLaptop = pos -> {
			Minecraft minecraft = Minecraft.getInstance();
			if (minecraft.screen instanceof LaptopScreen open && open.pos().equals(pos)) {
				return;
			}
			minecraft.setScreen(new LaptopScreen(pos));
		};
	}
}
