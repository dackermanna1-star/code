package com.godforge;

import com.godforge.command.GodforgeCommand;
import com.godforge.config.GodforgeConfig;
import com.godforge.destruction.DestructionManager;
import com.godforge.entity.KineticVictims;
import com.godforge.network.ModNetworking;
import com.godforge.registry.ModBlocks;
import com.godforge.registry.ModComponents;
import com.godforge.registry.ModCreativeTab;
import com.godforge.registry.ModEntities;
import com.godforge.registry.ModItems;
import com.godforge.registry.ModParticles;
import com.godforge.registry.ModSounds;
import com.godforge.util.FallGuard;
import com.godforge.util.Scheduler;
import com.godforge.weapon.UltimateCooldowns;
import com.godforge.weapon.WeaponEvents;
import net.fabricmc.api.ModInitializer;
import net.minecraft.resources.Identifier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** Godforge Arsenal — ten god-tier weapons. Common (server + client) entry point. */
public final class Godforge implements ModInitializer {
	public static final String MOD_ID = "godforge";
	public static final Logger LOGGER = LoggerFactory.getLogger("Godforge");

	public static Identifier id(String path) {
		return Identifier.fromNamespaceAndPath(MOD_ID, path);
	}

	@Override
	public void onInitialize() {
		GodforgeConfig.load();
		ModComponents.init();
		ModSounds.init();
		ModParticles.init();
		ModBlocks.init();
		ModItems.init();
		ModEntities.init();
		ModCreativeTab.init();
		ModNetworking.init();
		DestructionManager.init();
		Scheduler.init();
		FallGuard.init();
		KineticVictims.init();
		UltimateCooldowns.init();
		WeaponEvents.init();
		GodforgeCommand.init();
		LOGGER.info("Godforge Arsenal armed: 10 god weapons registered");
	}
}
