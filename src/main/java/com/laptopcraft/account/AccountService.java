package com.laptopcraft.account;

import com.laptopcraft.LaptopCraft;
import com.laptopcraft.network.ModPayloads;
import java.util.UUID;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import org.jspecify.annotations.Nullable;

/**
 * Server-side entry point for EmeraldPay accounts: account lookup/creation (with the welcome bonus),
 * snapshots and syncing, notifications, mail and balance changes. Used by networking, commands and deliveries.
 *
 * <p>Every mutating method marks the saved data dirty; methods taking a {@link ServerPlayer} also push a
 * fresh {@link ModPayloads.AccountSync} to that player.
 */
public final class AccountService {
	/** Wallet bonus every new account starts with. */
	public static final int WELCOME_BONUS = 50;

	private AccountService() {
	}

	/** The shared order/mail clock: overworld game time (advances in every dimension, persists with the world). */
	public static long now(MinecraftServer server) {
		return server.overworld().getGameTime();
	}

	// ------------------------------------------------------------------ lookup

	/** The player's account, created on first use with the welcome bonus and welcome mail. */
	public static PlayerAccount account(ServerPlayer player) {
		MinecraftServer server = player.level().getServer();
		AccountData data = AccountData.get(server);
		PlayerAccount account = data.get(player.getUUID());
		String name = player.getGameProfile().name();
		if (account == null) {
			account = PlayerAccount.create(name);
			long time = now(server);
			account.addBalance(WELCOME_BONUS);
			account.addTransaction(time, WELCOME_BONUS, "Welcome bonus");
			MailTemplates.addWelcomeMail(account, name, time);
			data.put(player.getUUID(), account);
			LaptopCraft.LOGGER.info("Opened EmeraldPay account for {} (+{} emerald welcome bonus)", name, WELCOME_BONUS);
		} else if (!account.name().equals(name)) {
			account.setName(name);
			data.setDirty();
		}
		return account;
	}

	/** An existing account by uuid (offline players included), or {@code null}. */
	public static @Nullable PlayerAccount find(MinecraftServer server, UUID player) {
		return AccountData.get(server).get(player);
	}

	public static AccountSnapshot snapshot(ServerPlayer player) {
		return account(player).snapshot(now(player.level().getServer()));
	}

	/** Marks the account data dirty (call after mutating a {@link PlayerAccount} directly). */
	public static void markDirty(MinecraftServer server) {
		AccountData.get(server).setDirty();
	}

	// ------------------------------------------------------------------ client communication

	/** Marks the data dirty and sends the player a fresh snapshot. */
	public static void sync(ServerPlayer player) {
		markDirty(player.level().getServer());
		push(player);
	}

	/** Sends the player a fresh snapshot without touching the saved data (e.g. for RequestAccount). */
	public static void push(ServerPlayer player) {
		if (ServerPlayNetworking.canSend(player, ModPayloads.AccountSync.TYPE)) {
			ServerPlayNetworking.send(player, new ModPayloads.AccountSync(snapshot(player)));
		}
	}

	/**
	 * Sends a CubeOS notification (or a vanilla toast when the laptop is closed).
	 *
	 * @param icon "emerazon", "ender_eats", "bank", "mail", "info", "error" or "success"
	 */
	public static void notify(ServerPlayer player, String icon, String title, String message) {
		if (ServerPlayNetworking.canSend(player, ModPayloads.Notify.TYPE)) {
			ServerPlayNetworking.send(player, new ModPayloads.Notify(clip(icon, 64), clip(title, 256), clip(message, 1024)));
		}
	}

	/** Shorthand for an "error" notification (the OS shows it in the app that caused it). */
	public static void error(ServerPlayer player, String title, String message) {
		notify(player, "error", title, message);
	}

	// ------------------------------------------------------------------ balance

	/**
	 * Changes the wallet balance and records a transaction (skipped for a zero change).
	 *
	 * @return the new balance
	 */
	public static int addBalance(ServerPlayer player, int delta, String description) {
		PlayerAccount account = account(player);
		int before = account.balance();
		int after = account.addBalance(delta);
		if (after != before) {
			account.addTransaction(now(player.level().getServer()), after - before, description);
		}
		sync(player);
		return after;
	}

	// ------------------------------------------------------------------ mail

	/**
	 * Delivers a mail to the player's inbox, syncs and (optionally) pops a "mail" notification.
	 *
	 * @param link in-game URL for the Mail app's button, or "" for none
	 */
	public static Mail sendMail(ServerPlayer player, String from, String subject, String body, String link, boolean notify) {
		Mail mail = account(player).addMail(clip(from, 64), clip(subject, 128), clip(body, 8000), clip(link, 256), now(player.level().getServer()));
		sync(player);
		if (notify) {
			notify(player, "mail", "New mail from " + mail.from(), mail.subject());
		}
		return mail;
	}

	/** Delivers a mail to an account that may belong to an offline player. Returns false if there is no account. */
	public static boolean sendMail(MinecraftServer server, UUID player, String from, String subject, String body, String link) {
		ServerPlayer online = server.getPlayerList().getPlayer(player);
		if (online != null) {
			sendMail(online, from, subject, body, link, true);
			return true;
		}
		PlayerAccount account = find(server, player);
		if (account == null) {
			return false;
		}
		account.addMail(clip(from, 64), clip(subject, 128), clip(body, 8000), clip(link, 256), now(server));
		markDirty(server);
		return true;
	}

	/** Applies a Mail app action: "read", "delete", "read_all", "delete_all". Unknown actions are ignored. */
	public static void mailAction(ServerPlayer player, String action, long mailId) {
		PlayerAccount account = account(player);
		boolean changed = switch (action) {
			case "read" -> account.markRead(mailId);
			case "delete" -> account.deleteMail(mailId);
			case "read_all" -> account.markAllRead() > 0;
			case "delete_all" -> account.deleteAllMail() > 0;
			default -> false;
		};
		// Always answer so the client never keeps a stale view (e.g. double-deleting the same mail).
		if (changed) {
			sync(player);
		} else {
			push(player);
		}
	}

	static String clip(String s, int max) {
		return s.length() <= max ? s : s.substring(0, max);
	}
}
