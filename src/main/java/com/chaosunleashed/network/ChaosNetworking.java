package com.chaosunleashed.network;

import com.chaosunleashed.core.ChaosActions;
import com.chaosunleashed.core.ChaosEventManager;
import com.chaosunleashed.core.ChaosEventType;
import com.chaosunleashed.core.ChaosPermissions;
import com.chaosunleashed.registry.ModBlocks;
import net.fabricmc.fabric.api.networking.v1.PayloadTypeRegistry;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.minecraft.network.packet.s2c.play.SubtitleS2CPacket;
import net.minecraft.network.packet.s2c.play.TitleFadeS2CPacket;
import net.minecraft.network.packet.s2c.play.TitleS2CPacket;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.MathHelper;
import net.minecraft.util.math.Vec3d;

public final class ChaosNetworking {
	private ChaosNetworking() {
	}

	public static void init() {
		PayloadTypeRegistry.playS2C().register(ChaosStatusPayload.ID, ChaosStatusPayload.CODEC);
		PayloadTypeRegistry.playS2C().register(ScreenShakePayload.ID, ScreenShakePayload.CODEC);
		PayloadTypeRegistry.playS2C().register(OpenPanelPayload.ID, OpenPanelPayload.CODEC);
		PayloadTypeRegistry.playC2S().register(PanelActionPayload.ID, PanelActionPayload.CODEC);

		ServerPlayNetworking.registerGlobalReceiver(PanelActionPayload.ID, (payload, context) -> handlePanelAction(context.player(), payload));
	}

	// ------------------------------------------------------------------------------------------ server -> client

	public static void sendStatus(ServerPlayerEntity player, ChaosStatusPayload payload) {
		if (ServerPlayNetworking.canSend(player, ChaosStatusPayload.ID)) {
			ServerPlayNetworking.send(player, payload);
		}
	}

	public static void sendShake(ServerPlayerEntity player, float strength, int ticks) {
		if (ServerPlayNetworking.canSend(player, ScreenShakePayload.ID)) {
			ServerPlayNetworking.send(player, new ScreenShakePayload(strength, ticks));
		}
	}

	public static void openPanel(ServerPlayerEntity player, BlockPos pos) {
		ChaosEventManager manager = ChaosEventManager.get();
		if (manager != null) {
			manager.sendStatus(player);
		}
		if (ServerPlayNetworking.canSend(player, OpenPanelPayload.ID)) {
			ServerPlayNetworking.send(player, new OpenPanelPayload(pos, ChaosPermissions.canUsePanel(player)));
		}
	}

	public static void sendTitle(ServerPlayerEntity player, Text title, Text subtitle) {
		player.networkHandler.sendPacket(new TitleFadeS2CPacket(10, 70, 20));
		player.networkHandler.sendPacket(new SubtitleS2CPacket(subtitle));
		player.networkHandler.sendPacket(new TitleS2CPacket(title));
	}

	// ------------------------------------------------------------------------------------------ client -> server

	/** Every GUI action is re-validated here: real panel block, within reach, and permission. */
	private static void handlePanelAction(ServerPlayerEntity player, PanelActionPayload payload) {
		ChaosEventManager manager = ChaosEventManager.get();
		if (manager == null) {
			return;
		}
		BlockPos pos = payload.pos();
		if (!player.getEntityWorld().isChunkLoaded(pos.getX() >> 4, pos.getZ() >> 4)
			|| !player.getEntityWorld().getBlockState(pos).isOf(ModBlocks.CHAOS_CONTROL_PANEL)
			|| player.squaredDistanceTo(Vec3d.ofCenter(pos)) > 10.0 * 10.0) {
			return;
		}
		if (!ChaosPermissions.canUsePanel(player)) {
			player.sendMessage(ChaosActions.prefix().append(Text.literal("You don't have permission to change Chaos settings.")
				.formatted(Formatting.RED)), false);
			manager.sendStatus(player);
			return;
		}
		ChaosEventType type = ChaosEventType.byOrdinal(payload.eventType());
		Text feedback = switch (payload.action()) {
			case ENABLE -> type == null ? null : ChaosActions.setEnabled(manager, type, true);
			case DISABLE -> type == null ? null : ChaosActions.setEnabled(manager, type, false);
			case START -> {
				if (type == null) {
					yield null;
				}
				ChaosEventManager.StartResult result = ChaosActions.start(manager, type, player.getEntityWorld(), player.getBlockPos(),
					player, MathHelper.clamp(payload.intensity(), 1, 5));
				yield ChaosActions.prefix().append(result.message());
			}
			case STOP_EVENT -> type == null ? null : ChaosActions.stop(manager, type);
			case STOP_ALL -> ChaosActions.stopAll(manager);
			case RANDOM_ON -> ChaosActions.setRandom(manager, true);
			case RANDOM_OFF -> ChaosActions.setRandom(manager, false);
		};
		if (feedback != null) {
			player.sendMessage(feedback, false);
		}
		manager.broadcastStatus();
	}
}
