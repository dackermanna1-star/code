package com.jjkshowdown.network;

import com.google.gson.Gson;
import com.jjkshowdown.JjkShowdown;
import com.jjkshowdown.ability.AbilityHandler;
import com.jjkshowdown.ability.AbilitySlot;
import com.jjkshowdown.cinematic.Cinematics;
import com.jjkshowdown.combat.Movement;
import com.jjkshowdown.config.JjkConfig;
import com.jjkshowdown.qte.QteManager;
import com.jjkshowdown.registry.VoiceLine;
import com.jjkshowdown.sorcerer.CharacterType;
import com.jjkshowdown.sorcerer.Characters;
import net.fabricmc.fabric.api.networking.v1.PayloadTypeRegistry;
import net.fabricmc.fabric.api.networking.v1.PlayerLookup;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.minecraft.network.chat.Component;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.server.permissions.Permissions;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.phys.Vec3;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

public final class JjkNetwork {
	/** Client preferences per player (QTE / cinematics). */
	private static final Map<UUID, Payloads.ClientSettings> CLIENT_SETTINGS = new ConcurrentHashMap<>();
	private static final Gson GSON = new Gson();

	private JjkNetwork() {
	}

	public static void init() {
		PayloadTypeRegistry.playC2S().register(Payloads.SelectCharacter.TYPE, Payloads.SelectCharacter.CODEC);
		PayloadTypeRegistry.playC2S().register(Payloads.AbilityInput.TYPE, Payloads.AbilityInput.CODEC);
		PayloadTypeRegistry.playC2S().register(Payloads.CombatAction.TYPE, Payloads.CombatAction.CODEC);
		PayloadTypeRegistry.playC2S().register(Payloads.QteResponse.TYPE, Payloads.QteResponse.CODEC);
		PayloadTypeRegistry.playC2S().register(Payloads.CinematicSkip.TYPE, Payloads.CinematicSkip.CODEC);
		PayloadTypeRegistry.playC2S().register(Payloads.ClientSettings.TYPE, Payloads.ClientSettings.CODEC);
		PayloadTypeRegistry.playC2S().register(Payloads.ApplyConfig.TYPE, Payloads.ApplyConfig.CODEC);

		PayloadTypeRegistry.playS2C().register(Payloads.SorcererSync.TYPE, Payloads.SorcererSync.CODEC);
		PayloadTypeRegistry.playS2C().register(Payloads.EntityVisual.TYPE, Payloads.EntityVisual.CODEC);
		PayloadTypeRegistry.playS2C().register(Payloads.Cinematic.TYPE, Payloads.Cinematic.CODEC);
		PayloadTypeRegistry.playS2C().register(Payloads.CinematicEnd.TYPE, Payloads.CinematicEnd.CODEC);
		PayloadTypeRegistry.playS2C().register(Payloads.QteStart.TYPE, Payloads.QteStart.CODEC);
		PayloadTypeRegistry.playS2C().register(Payloads.QteEnd.TYPE, Payloads.QteEnd.CODEC);
		PayloadTypeRegistry.playS2C().register(Payloads.ScreenEffect.TYPE, Payloads.ScreenEffect.CODEC);
		PayloadTypeRegistry.playS2C().register(Payloads.Voice.TYPE, Payloads.Voice.CODEC);
		PayloadTypeRegistry.playS2C().register(Payloads.Clash.TYPE, Payloads.Clash.CODEC);
		PayloadTypeRegistry.playS2C().register(Payloads.Notify.TYPE, Payloads.Notify.CODEC);
		PayloadTypeRegistry.playS2C().register(Payloads.OpenSelection.TYPE, Payloads.OpenSelection.CODEC);
		PayloadTypeRegistry.playS2C().register(Payloads.ComboEvent.TYPE, Payloads.ComboEvent.CODEC);
		PayloadTypeRegistry.playS2C().register(Payloads.ConfigSync.TYPE, Payloads.ConfigSync.CODEC);

		ServerPlayNetworking.registerGlobalReceiver(Payloads.SelectCharacter.TYPE, (p, ctx) ->
				Characters.requestSelect(ctx.player(), CharacterType.byOrdinal(p.character())));
		ServerPlayNetworking.registerGlobalReceiver(Payloads.AbilityInput.TYPE, (p, ctx) -> {
			AbilitySlot slot = AbilitySlot.byOrdinal(p.slot());
			if (slot != null) AbilityHandler.handleInput(ctx.player(), slot, p.pressed());
		});
		ServerPlayNetworking.registerGlobalReceiver(Payloads.CombatAction.TYPE, (p, ctx) ->
				Movement.handleAction(ctx.player(), p.action(), p.x(), p.z()));
		ServerPlayNetworking.registerGlobalReceiver(Payloads.QteResponse.TYPE, (p, ctx) ->
				QteManager.handleResponse(ctx.player(), p.qteId(), p.presses(), p.elapsedTicks()));
		ServerPlayNetworking.registerGlobalReceiver(Payloads.CinematicSkip.TYPE, (p, ctx) ->
				Cinematics.handleSkip(ctx.player(), p.sessionId()));
		ServerPlayNetworking.registerGlobalReceiver(Payloads.ClientSettings.TYPE, (p, ctx) ->
				CLIENT_SETTINGS.put(ctx.player().getUUID(), p));
		ServerPlayNetworking.registerGlobalReceiver(Payloads.ApplyConfig.TYPE, (p, ctx) -> {
			ServerPlayer player = ctx.player();
			if (!canEditConfig(player)) {
				notify(player, Payloads.Notify.WARN, Component.translatable("message.jjkshowdown.config_denied"), 0xFF5555);
				return;
			}
			try {
				JjkConfig cfg = GSON.fromJson(p.json(), JjkConfig.class);
				if (cfg != null) {
					JjkConfig.apply(cfg);
					broadcastConfig(player.level().getServer());
					notify(player, Payloads.Notify.INFO, Component.translatable("message.jjkshowdown.config_saved"), 0x55FF55);
				}
			} catch (Exception e) {
				JjkShowdown.LOGGER.warn("Rejected malformed config from {}", player.getName().getString(), e);
			}
		});
	}

	public static boolean canEditConfig(ServerPlayer player) {
		return player.permissions().hasPermission(Permissions.COMMANDS_GAMEMASTER)
				|| player.level().getServer().isSingleplayerOwner(player.nameAndId());
	}

	public static Payloads.ClientSettings settings(ServerPlayer player) {
		return CLIENT_SETTINGS.getOrDefault(player.getUUID(), new Payloads.ClientSettings(true, true, false));
	}

	public static void forget(ServerPlayer player) {
		CLIENT_SETTINGS.remove(player.getUUID());
	}

	// ------------------------------------------------------------------------------------------------ send helpers

	public static void send(ServerPlayer player, CustomPacketPayload payload) {
		if (ServerPlayNetworking.canSend(player, payload.type())) {
			ServerPlayNetworking.send(player, payload);
		}
	}

	/** Send to everyone tracking {@code entity} plus the entity itself if it is a player. */
	public static void sendTracking(Entity entity, CustomPacketPayload payload) {
		for (ServerPlayer p : PlayerLookup.tracking(entity)) {
			send(p, payload);
		}
		if (entity instanceof ServerPlayer self) {
			send(self, payload);
		}
	}

	public static void sendAround(ServerLevel level, Vec3 pos, double radius, CustomPacketPayload payload) {
		for (ServerPlayer p : PlayerLookup.around(level, pos, radius)) {
			send(p, payload);
		}
	}

	public static void notify(ServerPlayer player, int kind, Component message, int color) {
		send(player, new Payloads.Notify(kind, message, color));
	}

	public static void notify(Entity entity, int kind, Component message, int color) {
		if (entity instanceof ServerPlayer p) notify(p, kind, message, color);
	}

	public static void screenEffect(Entity entity, int effect, float intensity, int duration, int color) {
		if (entity instanceof ServerPlayer p) send(p, new Payloads.ScreenEffect(effect, intensity, duration, color));
	}

	/** Shake the screens of all players near a position, falling off with distance. */
	public static void shakeAround(ServerLevel level, Vec3 pos, double radius, float intensity, int duration) {
		for (ServerPlayer p : PlayerLookup.around(level, pos, radius)) {
			double d = Math.sqrt(p.distanceToSqr(pos));
			float falloff = (float) Math.max(0.15, 1.0 - d / radius);
			send(p, new Payloads.ScreenEffect(Payloads.ScreenEffect.SHAKE, intensity * falloff, duration, 0));
		}
	}

	public static void flashAround(ServerLevel level, Vec3 pos, double radius, float intensity, int duration, int color) {
		for (ServerPlayer p : PlayerLookup.around(level, pos, radius)) {
			double d = Math.sqrt(p.distanceToSqr(pos));
			float falloff = (float) Math.max(0.1, 1.0 - d / radius);
			send(p, new Payloads.ScreenEffect(Payloads.ScreenEffect.FLASH, intensity * falloff, duration, color));
		}
	}

	public static void voice(Entity speaker, VoiceLine line) {
		Payloads.Voice payload = new Payloads.Voice(speaker.getId(), line.ordinal());
		if (speaker.level() instanceof ServerLevel level) {
			sendAround(level, speaker.position(), 64, payload);
		}
	}

	public static void broadcastConfig(net.minecraft.server.MinecraftServer server) {
		String json = GSON.toJson(JjkConfig.get());
		for (ServerPlayer p : server.getPlayerList().getPlayers()) {
			send(p, new Payloads.ConfigSync(json, canEditConfig(p)));
		}
	}

	public static void sendConfig(ServerPlayer p) {
		send(p, new Payloads.ConfigSync(GSON.toJson(JjkConfig.get()), canEditConfig(p)));
	}
}
