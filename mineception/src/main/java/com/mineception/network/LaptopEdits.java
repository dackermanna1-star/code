package com.mineception.network;

import com.mineception.block.LaptopBlockEntity;
import com.mineception.dream.EditRules;
import com.mineception.dream.MiniBlock;
import com.mineception.dream.MiniWorld;
import com.mineception.dream.Theme;
import java.util.HashMap;
import java.util.Iterator;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.fabricmc.fabric.api.networking.v1.PayloadTypeRegistry;
import net.fabricmc.fabric.api.networking.v1.ServerPlayConnectionEvents;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.minecraft.ChatFormatting;
import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.MinecraftServer;
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
	/**
	 * Furthest a player may be for a refused edit to be corrected: a little beyond {@link #MAX_DISTANCE}, for players
	 * pushed away while the laptop screen is open or whose position the server sees slightly differently.
	 */
	public static final double RESYNC_DISTANCE = 16.0;
	public static final int BURST = 20;
	public static final int EDITS_PER_SECOND = 20;
	/** Minimum server ticks between corrective resyncs sent to one player. */
	public static final int RESYNC_INTERVAL = 10;
	/** Most laptops waiting for a resync per player (a player only has one laptop open at a time). */
	private static final int MAX_PENDING = 4;

	/** Outcome of an edit request. */
	public enum Result {
		APPLIED(false),
		NOT_ALIVE(true),
		TOO_FAR(true),
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

		/**
		 * Whether the sender's client may have predicted this edit and needs the laptop's real state back. Malformed
		 * requests (no laptop, bad depth, index or block) are never predicted by a real client.
		 */
		public final boolean resync;

		Result(boolean resync) {
			this.resync = resync;
		}
	}

	/** A laptop whose whole data one player should get again. */
	private record Resync(ResourceKey<Level> dimension, BlockPos pos) {
	}

	/** Per player: refused edits are corrected at most every {@link #RESYNC_INTERVAL} ticks, but always eventually. */
	private static final class Resyncs {
		final Set<Resync> pending = new LinkedHashSet<>();
		/** Server tick of the last resync sent, or a value far in the past. */
		long last = Long.MIN_VALUE / 2;
	}

	private static final EditRateLimiter RATE = new EditRateLimiter(BURST, EDITS_PER_SECOND);
	private static final Map<UUID, Resyncs> RESYNCS = new HashMap<>();

	private LaptopEdits() {
	}

	public static void init() {
		PayloadTypeRegistry.playC2S().register(EditBlockPayload.TYPE, EditBlockPayload.CODEC);
		ServerPlayNetworking.registerGlobalReceiver(EditBlockPayload.TYPE, (payload, context) -> receive(context.player(), payload));
		ServerTickEvents.END_SERVER_TICK.register(LaptopEdits::flushResyncs);
		ServerPlayConnectionEvents.DISCONNECT.register((handler, server) -> forget(handler.player.getUUID()));
		ServerLifecycleEvents.SERVER_STOPPED.register(server -> {
			RATE.clear();
			RESYNCS.clear();
		});
	}

	/**
	 * The network receiver: handles one edit request and tells the sender's client what it needs to know. A refused
	 * edit the client may have shown already gets the laptop's real state sent back (see {@link #flushResyncs}), and a
	 * full laptop says so in the action bar.
	 */
	public static Result receive(ServerPlayer player, EditBlockPayload payload) {
		Result result = handle(player, payload);
		if (result == Result.DREAM_FULL) {
			player.displayClientMessage(Component.translatable("message.mineception.dream_full").withStyle(ChatFormatting.RED), true);
		}
		if (result.resync) {
			Resyncs resyncs = RESYNCS.computeIfAbsent(player.getUUID(), id -> new Resyncs());
			if (resyncs.pending.size() < MAX_PENDING) {
				resyncs.pending.add(new Resync(player.level().dimension(), payload.pos().immutable()));
			}
			MinecraftServer server = player.level().getServer();
			if (server != null) {
				flushResyncs(player, resyncs, server.getTickCount());
			}
		}
		return result;
	}

	/** Server tick: sends the resyncs that had to wait for the interval to pass. */
	private static void flushResyncs(MinecraftServer server) {
		if (RESYNCS.isEmpty()) {
			return;
		}
		int now = server.getTickCount();
		Iterator<Map.Entry<UUID, Resyncs>> entries = RESYNCS.entrySet().iterator();
		while (entries.hasNext()) {
			Map.Entry<UUID, Resyncs> entry = entries.next();
			Resyncs resyncs = entry.getValue();
			if (resyncs.pending.isEmpty()) {
				// Keep the time of the last resync while it still limits the next one
				if (now - resyncs.last >= RESYNC_INTERVAL) {
					entries.remove();
				}
				continue;
			}
			ServerPlayer player = server.getPlayerList().getPlayer(entry.getKey());
			if (player == null) {
				entries.remove();
				continue;
			}
			flushResyncs(player, resyncs, now);
		}
	}

	/** Sends the player's pending resyncs if the interval since the last one has passed. */
	private static void flushResyncs(ServerPlayer player, Resyncs resyncs, long now) {
		if (resyncs.pending.isEmpty() || now - resyncs.last < RESYNC_INTERVAL) {
			return;
		}
		boolean sent = false;
		for (Resync resync : resyncs.pending) {
			// Only laptops the player can still see: same dimension, loaded, close by
			if (!player.level().dimension().equals(resync.dimension())
				|| player.getEyePosition().distanceToSqr(Vec3.atCenterOf(resync.pos())) > RESYNC_DISTANCE * RESYNC_DISTANCE
				|| !player.level().isLoaded(resync.pos())) {
				continue;
			}
			if (player.level().getBlockEntity(resync.pos()) instanceof LaptopBlockEntity laptop) {
				player.connection.send(laptop.fullSyncPacket());
				sent = true;
			}
		}
		resyncs.pending.clear();
		if (sent) {
			resyncs.last = now;
		}
	}

	/** Forgets everything kept for a player (they left). */
	public static void forget(UUID player) {
		RATE.forget(player);
		RESYNCS.remove(player);
	}

	/** Whether the server keeps edit state (rate limit or resyncs) for a player; for tests. */
	public static boolean isTracked(UUID player) {
		return RESYNCS.containsKey(player) || RATE.tracks(player);
	}

	/** Whether a resync for the player is still waiting for the interval to pass; for tests. */
	public static boolean resyncPending(UUID player) {
		Resyncs resyncs = RESYNCS.get(player);
		return resyncs != null && !resyncs.pending.isEmpty();
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
}
