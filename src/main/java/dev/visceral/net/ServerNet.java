package dev.visceral.net;

import dev.visceral.combat.PlayerCombat;
import dev.visceral.config.CommonConfig;
import dev.visceral.entity.CombatState;
import dev.visceral.entity.VisceralEntity;
import net.fabricmc.fabric.api.networking.v1.EntityTrackingEvents;
import net.fabricmc.fabric.api.networking.v1.PlayerLookup;
import net.fabricmc.fabric.api.networking.v1.ServerPlayConnectionEvents;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;

/** Server-side networking: receivers and broadcast helpers. */
public final class ServerNet {
	private ServerNet() {
	}

	public static void init() {
		ServerPlayNetworking.registerGlobalReceiver(Payloads.AttackRequest.TYPE,
			(payload, context) -> PlayerCombat.onAttackRequest(context.player(), payload));

		ServerPlayConnectionEvents.JOIN.register((handler, sender, server) -> {
			CommonConfig c = CommonConfig.get();
			if (ServerPlayNetworking.canSend(handler.getPlayer(), Payloads.ServerSettings.TYPE)) {
				sender.sendPacket(new Payloads.ServerSettings(c.meleeOverhaul, c.physicalReactions, c.maxGoreLevel, c.finishers, c.attackTimeScale));
			}
		});

		// Late joiners / players walking into range must learn about bodies already on the ground.
		EntityTrackingEvents.START_TRACKING.register((entity, player) -> {
			CombatState cs = VisceralEntity.get(entity);
			if (cs != null && cs.state.incapacitated()) send(player, stateSync(entity, cs));
		});
	}

	public static Payloads.PhysStateSync stateSync(Entity entity, CombatState cs) {
		int flags = 0;
		if (cs.crawling) flags |= Payloads.PhysStateSync.FLAG_CRAWL;
		if (cs.failedAttempt) flags |= Payloads.PhysStateSync.FLAG_FAIL;
		if (entity instanceof LivingEntity le && le.isDeadOrDying()) flags |= Payloads.PhysStateSync.FLAG_DEAD;
		return new Payloads.PhysStateSync(entity.getId(), cs.state.ordinal(), Math.min(cs.stateTicks, Short.MAX_VALUE),
			Math.min(cs.stateDuration, Short.MAX_VALUE), cs.dirX, cs.dirZ, cs.force, flags);
	}

	public static void send(ServerPlayer player, CustomPacketPayload payload) {
		if (ServerPlayNetworking.canSend(player, payload.type())) ServerPlayNetworking.send(player, payload);
	}

	/** Sends to everyone tracking {@code entity}, plus the entity itself if it is a player. */
	public static void broadcast(Entity entity, CustomPacketPayload payload) {
		broadcast(entity, payload, true);
	}

	public static void broadcast(Entity entity, CustomPacketPayload payload, boolean includeSelf) {
		if (entity.level().isClientSide()) return;
		for (ServerPlayer p : PlayerLookup.tracking(entity)) {
			if (p != entity) send(p, payload);
		}
		if (includeSelf && entity instanceof ServerPlayer self) send(self, payload);
	}

	public static void syncState(LivingEntity entity, CombatState cs) {
		broadcast(entity, stateSync(entity, cs));
	}
}
