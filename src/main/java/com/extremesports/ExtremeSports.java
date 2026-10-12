package com.extremesports;

import com.extremesports.command.SportsCommands;
import com.extremesports.network.ModNetworking;
import com.extremesports.registry.ModAttachments;
import com.extremesports.registry.ModBlocks;
import com.extremesports.registry.ModCreativeTab;
import com.extremesports.registry.ModCriteria;
import com.extremesports.registry.ModDataComponents;
import com.extremesports.registry.ModEntities;
import com.extremesports.registry.ModItems;
import com.extremesports.registry.ModSounds;
import com.extremesports.server.ServerEvents;
import net.fabricmc.api.ModInitializer;
import net.minecraft.resources.Identifier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class ExtremeSports implements ModInitializer {
	public static final String MOD_ID = "extremesports";
	public static final Logger LOGGER = LoggerFactory.getLogger("ExtremeSports");

	public static Identifier id(String path) {
		return Identifier.fromNamespaceAndPath(MOD_ID, path);
	}

	@Override
	public void onInitialize() {
		ModDataComponents.init();
		ModSounds.init();
		ModBlocks.init();
		ModItems.init();
		ModEntities.init();
		ModAttachments.init();
		ModCriteria.init();
		ModCreativeTab.init();
		ModNetworking.init();
		ServerEvents.init();
		SportsCommands.init();
		LOGGER.info("Extreme Sports Overhaul loaded");
	}
}
