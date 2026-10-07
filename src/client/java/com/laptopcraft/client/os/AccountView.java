package com.laptopcraft.client.os;

import com.laptopcraft.account.AccountSnapshot;
import com.laptopcraft.account.OrderLine;
import com.laptopcraft.shop.DeliveryOption;
import com.laptopcraft.shop.Store;
import java.util.List;
import org.jspecify.annotations.Nullable;

/**
 * Client view of the player's EmeraldPay account. The data is a server snapshot that is refreshed
 * automatically after every change; actions are sent to the server, which validates them and replies
 * with a new snapshot (and a notification). Poll {@link #version()} to notice updates.
 *
 * <pre>{@code
 * if (account.version() != seenVersion) { seenVersion = account.version(); rebuildOrderList(); }
 * String err = account.consumeLastError();   // e.g. "Not enough emeralds" after a failed purchase
 * }</pre>
 * In the offline dev laptop everything is simulated locally (120 emeralds, sample orders and mail).
 */
public interface AccountView {
	AccountSnapshot snapshot();

	/** Wallet balance in emeralds. */
	int balance();

	/** Increments on every AccountSync — poll it to detect changes. */
	int version();

	/** Last error message from the server (Notify with icon "error"), then cleared. */
	@Nullable String consumeLastError();

	/**
	 * Places an order. Emerazon: {@code restaurantId = ""}, {@code tip = 0}. Ender Eats: all lines from
	 * one restaurant's menu. {@code deliverToPlayer}: true = to the player wherever they are, false =
	 * next to this laptop.
	 */
	void purchase(Store store, String restaurantId, List<OrderLine> lines, DeliveryOption option, int tip, boolean deliverToPlayer);

	/** Moves emeralds from the inventory into the wallet (emerald blocks count as 9). */
	void deposit(int amount);

	void depositAll();

	/** Moves emeralds from the wallet into the inventory. */
	void withdraw(int amount);

	void markMailRead(long id);

	void deleteMail(long id);

	void markAllRead();

	/** Asks the server for a fresh snapshot. */
	void refresh();

	/** Emeralds (+9 per emerald block) in the local player's inventory. */
	int inventoryEmeralds();

	// ---------------------------------------------------------------- additions

	/** Number of unread mails. */
	default int unreadMail() {
		return (int) snapshot().unreadMail();
	}

	/** True in the offline dev laptop (actions are simulated). */
	boolean isOffline();

	/** Deletes all mail (server action "delete_all"). */
	void deleteAllMail();
}
