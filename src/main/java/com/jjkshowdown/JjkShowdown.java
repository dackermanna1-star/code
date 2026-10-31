package com.jjkshowdown;

import com.jjkshowdown.ability.Abilities;
import com.jjkshowdown.ability.AbilityHandler;
import com.jjkshowdown.cinematic.Cinematics;
import com.jjkshowdown.command.JjkCommand;
import com.jjkshowdown.config.JjkConfig;
import com.jjkshowdown.domain.DomainManager;
import com.jjkshowdown.network.JjkNetwork;
import com.jjkshowdown.network.ServerSync;
import com.jjkshowdown.qte.QteManager;
import com.jjkshowdown.registry.ModAttachments;
import com.jjkshowdown.registry.ModBlocks;
import com.jjkshowdown.registry.ModEffects;
import com.jjkshowdown.registry.ModEntities;
import com.jjkshowdown.registry.ModItems;
import com.jjkshowdown.registry.ModParticles;
import com.jjkshowdown.registry.ModSounds;
import com.jjkshowdown.sorcerer.Characters;
import com.jjkshowdown.sorcerer.CursedEnergy;
import com.jjkshowdown.sorcerer.Mastery;
import com.jjkshowdown.sorcerer.SorcererStats;
import com.jjkshowdown.sorcerer.Sorcerers;
import com.jjkshowdown.util.Scheduler;
import com.jjkshowdown.world.TerrainJournal;
import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.command.v2.CommandRegistrationCallback;
import net.fabricmc.fabric.api.entity.event.v1.ServerLivingEntityEvents;
import net.fabricmc.fabric.api.entity.event.v1.ServerPlayerEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.fabricmc.fabric.api.networking.v1.EntityTrackingEvents;
import net.fabricmc.fabric.api.networking.v1.ServerPlayConnectionEvents;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.LivingEntity;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class JjkShowdown implements ModInitializer {
	public static final String MOD_ID = "jjkshowdown";
	public static final Logger LOGGER = LoggerFactory.getLogger("Jujutsu Showdown");

	public static Identifier id(String path) {
		return Identifier.fromNamespaceAndPath(MOD_ID, path);
	}

	@Override
	public void onInitialize() {
		JjkConfig.load();
		ModSounds.init();
		ModParticles.init();
		ModBlocks.init();
		ModEffects.init();
		ModEntities.init();
		ModItems.init();
		ModAttachments.init();
		Abilities.init();
		JjkNetwork.init();

		CommandRegistrationCallback.EVENT.register((dispatcher, registryAccess, environment) -> JjkCommand.register(dispatcher));

		ServerTickEvents.END_SERVER_TICK.register(server -> {
			Scheduler.tick();
			Cinematics.tick(server);
			QteManager.tick(server);
			DomainManager.tick(server);
			int budget = JjkConfig.get().destruction.restoreBlocksPerTick;
			for (ServerLevel level : server.getAllLevels()) TerrainJournal.get(level).tick(level, budget);
		});

		ServerPlayConnectionEvents.JOIN.register((handler, sender, server) -> Characters.onJoin(handler.player));
		ServerPlayConnectionEvents.DISCONNECT.register((handler, server) -> {
			QteManager.cancelFor(handler.player);
			JjkNetwork.forget(handler.player);
		});
		ServerPlayerEvents.AFTER_RESPAWN.register((oldPlayer, newPlayer, alive) -> {
			SorcererStats.apply(newPlayer);
			CursedEnergy.fill(newPlayer);
			newPlayer.setHealth(newPlayer.getMaxHealth());
			Sorcerers.state(newPlayer).dirty = true;
			Sorcerers.state(newPlayer).visualDirty = true;
		});
		ServerLivingEntityEvents.AFTER_DEATH.register((entity, source) -> {
			if (Sorcerers.peekState(entity) != null) AbilityHandler.interrupt(entity);
			if (source.getEntity() instanceof LivingEntity killer && Sorcerers.isSorcerer(killer) && killer != entity) {
				Mastery.addXp(killer, Math.min(200f, entity.getMaxHealth() * 0.5f));
			}
		});
		EntityTrackingEvents.START_TRACKING.register((tracked, player) -> {
			if (tracked instanceof LivingEntity le) ServerSync.sendVisualTo(player, le);
		});
		ServerLifecycleEvents.SERVER_STOPPING.register(server -> {
			DomainManager.shutdown(server);
			Cinematics.clear();
			Scheduler.clear();
		});
		LOGGER.info("Jujutsu Showdown loaded: throughout heaven and earth, two stand alone.");
	}
}
