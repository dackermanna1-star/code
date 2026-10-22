package dev.juukulius.network;

import dev.juukulius.animation.JuliusAnim;
import dev.juukulius.character.JuliusServer;
import dev.juukulius.config.JuliusServerConfig;
import net.fabricmc.fabric.api.networking.v1.PayloadTypeRegistry;
import net.fabricmc.fabric.api.networking.v1.PlayerLookup;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.phys.Vec3;
import org.jspecify.annotations.Nullable;

/** Payload registration and the server-side send helpers. */
public final class JuliusNetworking {
	/** Effects are sent to players within this distance. */
	public static final double FX_RANGE = 96.0;

	private JuliusNetworking() {
	}

	public static void init() {
		PayloadTypeRegistry.playC2S().register(ActionRequestPayload.TYPE, ActionRequestPayload.CODEC);
		PayloadTypeRegistry.playS2C().register(AnimationPayload.TYPE, AnimationPayload.CODEC);
		PayloadTypeRegistry.playS2C().register(FxPayload.TYPE, FxPayload.CODEC);
		PayloadTypeRegistry.playS2C().register(ActionResultPayload.TYPE, ActionResultPayload.CODEC);
		PayloadTypeRegistry.playS2C().register(ServerRulesPayload.TYPE, ServerRulesPayload.CODEC);

		ServerPlayNetworking.registerGlobalReceiver(ActionRequestPayload.TYPE, (payload, context) -> JuliusServer.handleRequest(context.player(), payload));
	}

	/** Broadcasts an animation to everyone tracking {@code actor}; optionally to the actor too. */
	public static void sendAnimation(ServerPlayer actor, JuliusAnim animation, float speed, boolean includeSelf) {
		AnimationPayload payload = new AnimationPayload(actor.getId(), animation.ordinal(), speed, false);
		for (ServerPlayer watcher : PlayerLookup.tracking(actor)) {
			if (watcher != actor && ServerPlayNetworking.canSend(watcher, AnimationPayload.TYPE)) {
				ServerPlayNetworking.send(watcher, payload);
			}
		}

		if (includeSelf && ServerPlayNetworking.canSend(actor, AnimationPayload.TYPE)) {
			ServerPlayNetworking.send(actor, payload);
		}
	}

	/** Tells the actor that its predicted animation must be replaced. */
	public static void sendCorrection(ServerPlayer actor, JuliusAnim animation, float speed) {
		if (ServerPlayNetworking.canSend(actor, AnimationPayload.TYPE)) {
			ServerPlayNetworking.send(actor, new AnimationPayload(actor.getId(), animation.ordinal(), speed, true));
		}
	}

	public static void sendFx(ServerLevel level, FxType type, @Nullable Entity entity, Vec3 pos, Vec3 dir, int color, float power,
		@Nullable ServerPlayer except) {
		FxPayload payload = new FxPayload(type.ordinal(), entity != null ? entity.getId() : -1, pos, dir, color, power);
		for (ServerPlayer player : PlayerLookup.around(level, pos, FX_RANGE)) {
			if (player != except && ServerPlayNetworking.canSend(player, FxPayload.TYPE)) {
				ServerPlayNetworking.send(player, payload);
			}
		}
	}

	public static void sendFx(ServerLevel level, FxType type, @Nullable Entity entity, Vec3 pos, Vec3 dir, int color, float power) {
		sendFx(level, type, entity, pos, dir, color, power, null);
	}

	public static void deny(ServerPlayer player, ActionRequestPayload.Action action, ActionResultPayload.DenyReason reason) {
		if (ServerPlayNetworking.canSend(player, ActionResultPayload.TYPE)) {
			ServerPlayNetworking.send(player, new ActionResultPayload(action.ordinal(), reason.ordinal()));
		}
	}

	public static void sendRules(ServerPlayer player) {
		if (ServerPlayNetworking.canSend(player, ServerRulesPayload.TYPE)) {
			JuliusServerConfig config = JuliusServerConfig.get();
			ServerPlayNetworking.send(player, new ServerRulesPayload(config.manaCostMultiplier, config.cooldownMultiplier));
		}
	}
}
