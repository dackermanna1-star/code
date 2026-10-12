package com.mineception.network;

import com.mineception.block.LaptopBlockEntity;
import com.mineception.dream.EditRules;
import com.mineception.dream.MiniBlock;
import com.mineception.dream.MiniWorld;
import com.mineception.dream.Theme;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import net.fabricmc.fabric.api.networking.v1.PayloadTypeRegistry;
import net.fabricmc.fabric.api.networking.v1.ServerPlayConnectionEvents;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.minecraft.ChatFormatting;
import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.minecraft.network.protocol.Packet;
import net.minecraft.network.protocol.game.ClientGamePacketListener;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.Vec3;

/**
 * Server side of {@link EditBlockPayload}: every edit a client sends is checked against the laptop's current level
 * before it is stored and synced to everyone. Clients are not trusted: the sender must be alive, near the laptop and
 * within the rate limit, and the edit must be one the game itself allows ({@link EditRules}: break a breakable block,
 * place a hotbar block into air or water, never the laptop cell or the bedrock floor).
 */
public final class LaptopEdits {
	/** Furthest a player's eyes may be from the laptop block's centre to edit its dreams. */
	public static final double MAX_DISTANCE = 8.0;
	public static final int BURST = 20;
	public static final int EDITS_PER_SECOND = 20;
	/** Minimum game ticks between corrective resyncs sent to one player after rejected edits. */
	private static final long RESYNC_INTERVAL = 10;

	/** Outcome of an edit request. */
	public enum Result {
		APPLIED(false),
		NOT_ALIVE(false),
		TOO_FAR(false),
		NOT_LOADED(false),
		NO_LAPTOP(false),
		BAD_DEPTH(false),
		BAD_INDEX(false),
		BAD_BLOCK(false),
		RATE_LIMITED(true),
		PROTECTED_CELL(true),
		NOT_BREAKABLE(true),
		OCCUPIED(true),
		DREAM_FULL(true);

		/** Whether the sender's client may have predicted this edit and needs the laptop's real state back. */
		final boolean resync;

		Result(boolean resync) {
			this.resync = resync;
		}
	}

	private static final EditRateLimiter RATE = new EditRateLimiter(BURST, EDITS_PER_SECOND);
	private static final Map<UUID, Long> LAST_RESYNC = new HashMap<>();

	private LaptopEdits() {
	}

	public static void init() {
		PayloadTypeRegistry.playC2S().register(EditBlockPayload.TYPE, EditBlockPayload.CODEC);
		ServerPlayNetworking.registerGlobalReceiver(EditBlockPayload.TYPE, (payload, context) -> receive(context.player(), payload));
		ServerPlayConnectionEvents.DISCONNECT.register((handler, server) -> {
			RATE.forget(handler.player.getUUID());
			LAST_RESYNC.remove(handler.player.getUUID());
		});
	}

	private static void receive(ServerPlayer player, EditBlockPayload payload) {
		Result result = handle(player, payload);
		if (result == Result.DREAM_FULL) {
			player.displayClientMessage(Component.translatable("message.mineception.dream_full").withStyle(ChatFormatting.RED), true);
		}
		if (result.resync) {
			resync(player, payload.pos());
		}
	}

	/**
	 * Validates and applies one edit for {@code player}. Cheap checks come first, and nothing touches the world before
	 * the player is known to be close to the position, so a hostile client cannot make the server load chunks or build
	 * levels for far-away or missing laptops.
	 */
	public static Result handle(Player player, EditBlockPayload payload) {
		if (!player.isAlive() || player.isSpectator()) {
			return Result.NOT_ALIVE;
		}
		BlockPos pos = payload.pos();
		Vec3 eye = player.getEyePosition();
		if (eye.distanceToSqr(Vec3.atCenterOf(pos)) > MAX_DISTANCE * MAX_DISTANCE) {
			return Result.TOO_FAR;
		}
		Level level = player.level();
		if (!level.isLoaded(pos)) {
			return Result.NOT_LOADED;
		}
		if (!(level.getBlockEntity(pos) instanceof LaptopBlockEntity laptop)) {
			return Result.NO_LAPTOP;
		}
		int depth = payload.depth();
		if (depth < 1 || depth > Theme.DEPTHS) {
			return Result.BAD_DEPTH;
		}
		int index = payload.index();
		if (index < 0 || index >= MiniWorld.VOLUME) {
			return Result.BAD_INDEX;
		}
		if (!MiniBlock.isValidId(payload.block())) {
			return Result.BAD_BLOCK;
		}
		MiniBlock block = MiniBlock.byId(payload.block());
		if (block != MiniBlock.AIR && !block.placeable()) {
			return Result.BAD_BLOCK;
		}
		if (!RATE.tryAcquire(player.getUUID(), level.getGameTime())) {
			return Result.RATE_LIMITED;
		}
		EditRules.Verdict verdict = EditRules.check(laptop.level(depth), index, block);
		if (!verdict.ok()) {
			return switch (verdict) {
				case OUT_OF_BOUNDS -> Result.BAD_INDEX;
				case NOT_PLACEABLE -> Result.BAD_BLOCK;
				case PROTECTED_CELL -> Result.PROTECTED_CELL;
				case NOT_BREAKABLE -> Result.NOT_BREAKABLE;
				default -> Result.OCCUPIED;
			};
		}
		return laptop.applyEdit(depth, index, block) ? Result.APPLIED : Result.DREAM_FULL;
	}

	/** Sends the laptop's true state back to a player whose predicted edit was refused (throttled). */
	private static void resync(ServerPlayer player, BlockPos pos) {
		long now = player.level().getGameTime();
		Long last = LAST_RESYNC.get(player.getUUID());
		if (last != null && now - last < RESYNC_INTERVAL && now >= last) {
			return;
		}
		if (!(player.level().getBlockEntity(pos) instanceof LaptopBlockEntity laptop)) {
			return;
		}
		Packet<ClientGamePacketListener> packet = laptop.getUpdatePacket();
		if (packet != null) {
			LAST_RESYNC.put(player.getUUID(), now);
			player.connection.send(packet);
		}
	}
}
