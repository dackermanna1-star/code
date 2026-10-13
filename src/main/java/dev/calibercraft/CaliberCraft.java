package dev.calibercraft;

import dev.calibercraft.combat.BulletManager;
import dev.calibercraft.config.ServerConfig;
import dev.calibercraft.data.CaliberDataLoader;
import dev.calibercraft.network.FirePayload;
import dev.calibercraft.network.GunActionPayload;
import dev.calibercraft.network.GunsmithPayload;
import dev.calibercraft.network.ModNetworking;
import dev.calibercraft.registry.ModBlocks;
import dev.calibercraft.registry.ModComponents;
import dev.calibercraft.registry.ModCreativeTab;
import dev.calibercraft.registry.ModItems;
import dev.calibercraft.registry.ModLoot;
import dev.calibercraft.registry.ModParticles;
import dev.calibercraft.registry.ModSounds;
import dev.calibercraft.server.GunService;
import dev.calibercraft.server.GunsmithService;
import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.fabricmc.fabric.api.networking.v1.ServerPlayConnectionEvents;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.fabricmc.fabric.api.resource.v1.ResourceLoader;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.server.packs.PackType;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** Common/server entrypoint. Nothing here touches client-only classes. */
public final class CaliberCraft implements ModInitializer {
	public static final String MOD_ID = "calibercraft";
	public static final Logger LOGGER = LoggerFactory.getLogger("CaliberCraft");

	public static Identifier id(String path) {
		return Identifier.fromNamespaceAndPath(MOD_ID, path);
	}

	@Override
	public void onInitialize() {
		ServerConfig.load();
		ModComponents.init();
		ModBlocks.init();
		ModItems.init();
		ModSounds.init();
		ModParticles.init();
		ModCreativeTab.init();
		ModLoot.init();
		ModNetworking.registerTypes();

		ResourceLoader.get(PackType.SERVER_DATA).registerReloader(CaliberDataLoader.ID, new CaliberDataLoader());

		ServerPlayNetworking.registerGlobalReceiver(FirePayload.TYPE, (p, ctx) -> GunService.handleFire(p, ctx.player()));
		ServerPlayNetworking.registerGlobalReceiver(GunActionPayload.TYPE, (p, ctx) -> GunService.handleAction(p, ctx.player()));
		ServerPlayNetworking.registerGlobalReceiver(GunsmithPayload.TYPE, (p, ctx) -> GunsmithService.handle(p, ctx.player()));

		ServerPlayConnectionEvents.JOIN.register((handler, sender, server) -> GunService.sync(handler.getPlayer()));
		ServerPlayConnectionEvents.DISCONNECT.register((handler, server) -> GunService.remove(handler.getPlayer()));
		ServerLifecycleEvents.END_DATA_PACK_RELOAD.register((server, resources, success) -> {
			for (ServerPlayer p : server.getPlayerList().getPlayers()) {
				GunService.sync(p);
			}
		});
		ServerLifecycleEvents.SERVER_STOPPED.register(server -> {
			BulletManager.clear();
			GunService.clear();
		});
		ServerTickEvents.END_SERVER_TICK.register(server -> {
			for (ServerPlayer p : server.getPlayerList().getPlayers()) {
				GunService.tick(p);
			}
		});
		ServerTickEvents.END_WORLD_TICK.register(BulletManager::tickAll);
		LOGGER.info("{} initialised", ServerConfig.get().displayName);
	}
}
