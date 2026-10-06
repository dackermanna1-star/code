package com.laptopcraft.client;

import com.laptopcraft.client.block.LaptopBlockClient;
import com.laptopcraft.client.content.ClothingClient;
import com.laptopcraft.client.content.DecorClient;
import com.laptopcraft.client.content.FoodClient;
import com.laptopcraft.client.content.ToyClient;
import com.laptopcraft.client.net.ClientNetworking;
import com.laptopcraft.client.os.OSBootstrap;
import net.fabricmc.api.ClientModInitializer;

public class LaptopCraftClient implements ClientModInitializer {
	@Override
	public void onInitializeClient() {
		ClientNetworking.init();
		LaptopBlockClient.init();

		ClothingClient.init();
		ToyClient.init();
		DecorClient.init();
		FoodClient.init();

		OSBootstrap.init();
	}
}
