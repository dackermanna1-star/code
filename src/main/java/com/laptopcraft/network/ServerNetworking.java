package com.laptopcraft.network;

import com.laptopcraft.LaptopCraft;
import com.laptopcraft.account.AccountService;
import com.laptopcraft.account.BankService;
import com.laptopcraft.account.PlayerAccount;
import com.laptopcraft.block.LaptopBlock;
import com.laptopcraft.block.LaptopBlockEntity;
import com.laptopcraft.block.LaptopSessions;
import com.laptopcraft.delivery.OrderService;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.function.BiConsumer;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.fabric.api.networking.v1.ServerPlayConnectionEvents;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.minecraft.ChatFormatting;
import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.Vec3;
import org.jspecify.annotations.Nullable;

/**
 * Server-side handlers for every C2S LaptopCraft packet. Fabric runs them on the server thread.
 * Nothing from the client is trusted: positions are range- and block-checked, sizes are bounded and
 * spammy packets are rate limited per player.
 */
public final class ServerNetworking {
	/** Max distance for lid toggles. */
	public static final double LID_RANGE = 8.0;
	/** Bank actions must come from a player sitting at the laptop they opened. */
	public static final double BANK_RANGE = 10.0;
	/** Saves are accepted from a little further away so a knock-back never loses someone's notes. */
	public static final double SAVE_RANGE = 16.0;

	private static final Map<UUID, Limits> LIMITS = new HashMap<>();

	private ServerNetworking() {
	}

	public static void init() {
		receive(ModPayloads.LaptopSave.TYPE, ServerNetworking::onLaptopSave);
		receive(ModPayloads.LaptopLid.TYPE, ServerNetworking::onLaptopLid);
		receive(ModPayloads.Purchase.TYPE, ServerNetworking::onPurchase);
		receive(ModPayloads.Bank.TYPE, ServerNetworking::onBank);
		receive(ModPayloads.MailAction.TYPE, ServerNetworking::onMailAction);
		receive(ModPayloads.RequestAccount.TYPE, (player, payload) -> {
			if (limits(player).misc.tryTake(player)) {
				AccountService.push(player);
			}
		});

		ServerPlayConnectionEvents.JOIN.register((handler, sender, server) -> remindUnreadMail(handler.getPlayer()));
		ServerPlayConnectionEvents.DISCONNECT.register((handler, server) -> {
			LIMITS.remove(handler.getPlayer().getUUID());
			LaptopSessions.forget(handler.getPlayer().getUUID());
		});
		ServerLifecycleEvents.SERVER_STOPPED.register(server -> {
			LIMITS.clear();
			LaptopSessions.clear();
		});
	}

	/** Registers a handler that never lets an exception escape (that would disconnect the player). */
	private static <T extends CustomPacketPayload> void receive(CustomPacketPayload.Type<T> type, BiConsumer<ServerPlayer, T> handler) {
		ServerPlayNetworking.registerGlobalReceiver(type, (payload, context) -> {
			ServerPlayer player = context.player();
			try {
				handler.accept(player, payload);
			} catch (RuntimeException e) {
				LaptopCraft.LOGGER.error("Error handling {} from {}", type.id(), player.getGameProfile().name(), e);
				AccountService.error(player, "Something went wrong", "The server couldn't process that request. Please try again.");
			}
		});
	}

	// ------------------------------------------------------------------ handlers

	private static void onLaptopSave(ServerPlayer player, ModPayloads.LaptopSave payload) {
		if (!limits(player).save.tryTake(player)) {
			throttled(player, "Saving too fast", "Your CubeBook is saving faster than the server allows. Some changes may not have been saved.");
			return;
		}
		LaptopBlockEntity laptop = laptopInRange(player, payload.pos(), SAVE_RANGE);
		if (laptop == null) {
			return;
		}
		String error = laptop.applyEdit(payload.path(), payload.data(), payload.delete());
		if (error != null) {
			AccountService.error(player, "Couldn't save", error);
		}
	}

	private static void onLaptopLid(ServerPlayer player, ModPayloads.LaptopLid payload) {
		if (!limits(player).misc.tryTake(player)) {
			return;
		}
		if (laptopInRange(player, payload.pos(), LID_RANGE) != null) {
			BlockState state = player.level().getBlockState(payload.pos());
			LaptopBlock.setOpen(player.level(), payload.pos(), state, payload.open(), player);
		}
	}

	private static void onPurchase(ServerPlayer player, ModPayloads.Purchase payload) {
		if (!limits(player).purchase.tryTake(player)) {
			AccountService.error(player, "Order failed", "Whoa, slow down! You're placing orders too quickly.");
			return;
		}
		OrderService.purchase(player, payload);
	}

	private static void onBank(ServerPlayer player, ModPayloads.Bank payload) {
		if (!limits(player).bank.tryTake(player)) {
			AccountService.error(player, "Emerald Bank", "Too many requests. Please wait a moment.");
			return;
		}
		if (LaptopSessions.activeLaptop(player, BANK_RANGE) == null) {
			AccountService.error(player, "Emerald Bank", "Banking is only available from your CubeBook.");
			return;
		}
		BankService.handle(player, payload.action(), payload.amount());
	}

	private static void onMailAction(ServerPlayer player, ModPayloads.MailAction payload) {
		if (limits(player).misc.tryTake(player)) {
			AccountService.mailAction(player, payload.action(), payload.mailId());
		}
	}

	// ------------------------------------------------------------------ helpers

	/** The laptop at {@code pos} if it is loaded, in the player's dimension and within {@code range}. */
	private static @Nullable LaptopBlockEntity laptopInRange(ServerPlayer player, BlockPos pos, double range) {
		Level level = player.level();
		if (!level.isLoaded(pos) || player.position().distanceToSqr(Vec3.atCenterOf(pos)) > range * range) {
			return null;
		}
		return level.getBlockEntity(pos) instanceof LaptopBlockEntity laptop ? laptop : null;
	}

	private static void throttled(ServerPlayer player, String title, String message) {
		Limits limits = limits(player);
		int now = player.level().getServer().getTickCount();
		if (now - limits.lastThrottleNotice > 100) {
			limits.lastThrottleNotice = now;
			AccountService.error(player, title, message);
		}
	}

	private static void remindUnreadMail(ServerPlayer player) {
		PlayerAccount account = AccountService.find(player.level().getServer(), player.getUUID());
		if (account == null) {
			return;
		}
		long unread = account.unreadMail();
		if (unread > 0) {
			player.sendSystemMessage(Component.translatable(unread == 1 ? "message.laptopcraft.unread_mail.one" : "message.laptopcraft.unread_mail", unread)
					.withStyle(ChatFormatting.AQUA));
		}
	}

	private static Limits limits(ServerPlayer player) {
		return LIMITS.computeIfAbsent(player.getUUID(), id -> new Limits());
	}

	/** Per-player token buckets. */
	private static final class Limits {
		/** At most ~5 purchases per second. */
		final TokenBucket purchase = new TokenBucket(5, 5);
		final TokenBucket save = new TokenBucket(60, 30);
		final TokenBucket bank = new TokenBucket(6, 3);
		final TokenBucket misc = new TokenBucket(40, 20);
		int lastThrottleNotice = Integer.MIN_VALUE / 2;
	}

	/** Classic token bucket driven by the server tick counter. */
	private static final class TokenBucket {
		private final double capacity;
		private final double perTick;
		private double tokens;
		private int lastTick = Integer.MIN_VALUE;

		TokenBucket(double capacity, double perSecond) {
			this.capacity = capacity;
			this.perTick = perSecond / 20.0;
			this.tokens = capacity;
		}

		boolean tryTake(ServerPlayer player) {
			int now = player.level().getServer().getTickCount();
			if (lastTick != Integer.MIN_VALUE) {
				tokens = Math.min(capacity, tokens + Math.max(0, now - lastTick) * perTick);
			}
			lastTick = now;
			if (tokens >= 1) {
				tokens -= 1;
				return true;
			}
			return false;
		}
	}
}
