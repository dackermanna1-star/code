package com.ordnance;

import com.ordnance.command.OrdnanceCommand;
import com.ordnance.config.ConfigManager;
import com.ordnance.explosion.BlastWaveManager;
import com.ordnance.network.OrdnanceNetworking;
import com.ordnance.registry.ModBlocks;
import com.ordnance.registry.ModComponents;
import com.ordnance.registry.ModEntities;
import com.ordnance.registry.ModItemGroups;
import com.ordnance.registry.ModItems;
import com.ordnance.registry.ModParticles;
import com.ordnance.registry.ModSounds;
import com.ordnance.weapon.FlameStreamManager;
import com.ordnance.weapon.MissileStrikeManager;
import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.command.v2.CommandRegistrationCallback;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.minecraft.util.Identifier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Common entrypoint. Everything registered here exists on both the dedicated server and the client;
 * all authoritative gameplay (damage, block changes, ammo) runs on the logical server.
 */
public final class Ordnance implements ModInitializer {
	public static final String MOD_ID = "ordnance";
	public static final Logger LOGGER = LoggerFactory.getLogger("Ordnance");

	public static Identifier id(String path) {
		return Identifier.of(MOD_ID, path);
	}

	@Override
	public void onInitialize() {
		ConfigManager.load();

		ModComponents.init();
		ModSounds.init();
		ModParticles.init();
		ModBlocks.init();
		ModEntities.init();
		ModItems.init();
		ModItemGroups.init();
		MissileStrikeManager.init();
		OrdnanceNetworking.init();

		ServerTickEvents.END_WORLD_TICK.register(world -> {
			BlastWaveManager.tick(world);
			FlameStreamManager.tick(world);
			MissileStrikeManager.tick(world);
		});
		ServerLifecycleEvents.SERVER_STOPPED.register(server -> {
			BlastWaveManager.clear();
			FlameStreamManager.clear();
			MissileStrikeManager.clear();
		});
		CommandRegistrationCallback.EVENT.register(OrdnanceCommand::register);

		LOGGER.info("Ordnance loaded: explosions, fire and arsenal online.");
	}
}
