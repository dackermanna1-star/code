package com.modernapartments;

import com.modernapartments.command.ApartmentsCommand;
import com.modernapartments.network.ModNetworking;
import com.modernapartments.registry.ModBlockEntities;
import com.modernapartments.registry.ModBlocks;
import com.modernapartments.registry.ModEntities;
import com.modernapartments.registry.ModItemGroups;
import com.modernapartments.registry.ModItems;
import com.modernapartments.registry.ModStructures;
import com.modernapartments.build.placement.PlacementManager;
import com.modernapartments.block.ElevatorHandler;
import net.fabricmc.api.ModInitializer;
import net.minecraft.resources.Identifier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class ModernApartments implements ModInitializer {
	public static final String MOD_ID = "modernapartments";
	public static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);

	public static Identifier id(String path) {
		return Identifier.fromNamespaceAndPath(MOD_ID, path);
	}

	@Override
	public void onInitialize() {
		ModConfig.load();
		ModBlocks.init();
		ModItems.init();
		ModBlockEntities.init();
		ModEntities.init();
		ModItemGroups.init();
		ModStructures.init();
		ModNetworking.init();
		ApartmentsCommand.init();
		ElevatorHandler.init();
		PlacementManager.init();
		LOGGER.info("Modern Apartments ready: {} blocks registered", ModBlocks.ALL.size());
	}
}
