package com.laptopcraft;

import com.laptopcraft.command.LaptopCommands;
import com.laptopcraft.content.ClothingContent;
import com.laptopcraft.content.DecorContent;
import com.laptopcraft.content.FoodContent;
import com.laptopcraft.content.MarketplaceContent;
import com.laptopcraft.content.PaintingContent;
import com.laptopcraft.content.ToyContent;
import com.laptopcraft.delivery.DeliveryManager;
import com.laptopcraft.network.ModPayloads;
import com.laptopcraft.network.ServerNetworking;
import com.laptopcraft.registry.ModBlockEntities;
import com.laptopcraft.registry.ModBlocks;
import com.laptopcraft.registry.ModCreativeTab;
import com.laptopcraft.registry.ModDataComponents;
import com.laptopcraft.registry.ModItems;
import com.laptopcraft.registry.ModSounds;
import com.laptopcraft.shop.Catalog;
import net.fabricmc.api.ModInitializer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class LaptopCraft implements ModInitializer {
	public static final String MOD_ID = "laptopcraft";
	public static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);

	@Override
	public void onInitialize() {
		ModSounds.init();
		ModDataComponents.init();
		ModBlocks.init();
		ModItems.init();

		ClothingContent.init();
		ToyContent.init();
		DecorContent.init();
		FoodContent.init();
		PaintingContent.init();
		MarketplaceContent.init();

		ModBlockEntities.init();
		ModCreativeTab.init();
		Catalog.bootstrap();

		ModPayloads.init();
		ServerNetworking.init();
		DeliveryManager.init();
		LaptopCommands.init();

		LOGGER.info("LaptopCraft loaded: {} products, {} restaurants", Catalog.all().size(), Catalog.restaurants().size());
	}
}
