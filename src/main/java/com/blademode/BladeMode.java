package com.blademode;

import com.blademode.cut.SlashHandler;
import com.blademode.net.BladeModePayload;
import com.blademode.net.MobSlicePayload;
import com.blademode.net.SlashFxPayload;
import com.blademode.net.SlashPayload;
import com.blademode.piece.PhysicsWorld;
import com.blademode.piece.PieceEntity;
import com.blademode.registry.ModBlocks;
import com.blademode.registry.ModEntities;
import com.blademode.registry.ModItems;
import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.fabricmc.fabric.api.networking.v1.PayloadTypeRegistry;
import net.fabricmc.fabric.api.networking.v1.ServerPlayConnectionEvents;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.fabricmc.fabric.api.object.builder.v1.entity.FabricTrackedDataRegistry;
import net.minecraft.resources.Identifier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class BladeMode implements ModInitializer {
	public static final String MOD_ID = "blademode";
	public static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);

	public static Identifier id(String path) {
		return Identifier.fromNamespaceAndPath(MOD_ID, path);
	}

	@Override
	public void onInitialize() {
		BladeConfig.load();
		FabricTrackedDataRegistry.register(id("piece_data"), PieceEntity.PIECE_DATA_SERIALIZER);
		ModBlocks.init();
		ModItems.init();
		ModEntities.init();

		PayloadTypeRegistry.playC2S().register(SlashPayload.TYPE, SlashPayload.CODEC);
		PayloadTypeRegistry.playC2S().register(BladeModePayload.TYPE, BladeModePayload.CODEC);
		PayloadTypeRegistry.playS2C().register(SlashFxPayload.TYPE, SlashFxPayload.CODEC);
		PayloadTypeRegistry.playS2C().register(MobSlicePayload.TYPE, MobSlicePayload.CODEC);

		ServerPlayNetworking.registerGlobalReceiver(SlashPayload.TYPE, (payload, context) ->
			SlashHandler.handleSlash(context.player(), payload.eye(), payload.dirA(), payload.dirB()));
		ServerPlayNetworking.registerGlobalReceiver(BladeModePayload.TYPE, (payload, context) ->
			SlashHandler.setBladeMode(context.player(), payload.active()));
		ServerPlayConnectionEvents.DISCONNECT.register((handler, server) -> SlashHandler.onDisconnect(handler.player));

		ServerTickEvents.END_WORLD_TICK.register(PhysicsWorld::tick);
		ServerTickEvents.END_SERVER_TICK.register(SlashHandler::tick);
		ServerLifecycleEvents.SERVER_STOPPING.register(server -> SlashHandler.onServerStopping());

		LOGGER.info("Blade Mode ready: hold attack with the High-Frequency Blade and drag to cut.");
	}
}
