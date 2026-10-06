package com.laptopcraft.account;

import com.laptopcraft.delivery.DeliveryEffects;
import java.util.Locale;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;

/**
 * Emerald Bank: moves real emeralds between the player's inventory and their EmeraldPay wallet.
 * Emerald blocks count as 9 emeralds; partial deposits paid with blocks get their change back as emeralds.
 */
public final class BankService {
	/** Largest single withdrawal (a full inventory of emerald stacks). */
	public static final int MAX_WITHDRAW = 36 * 64;
	private static final int BLOCK_VALUE = 9;

	private BankService() {
	}

	/** Handles a {@code Bank} packet action: "deposit", "deposit_all" or "withdraw". */
	public static void handle(ServerPlayer player, String action, int amount) {
		switch (action) {
			case "deposit" -> deposit(player, amount);
			case "deposit_all" -> depositAll(player);
			case "withdraw" -> withdraw(player, amount);
			default -> AccountService.error(player, "Emerald Bank", "Unknown bank action.");
		}
	}

	/** Emeralds in the player's inventory, counting emerald blocks as 9. */
	public static int inventoryEmeralds(ServerPlayer player) {
		Inventory inventory = player.getInventory();
		long total = 0;
		for (int i = 0; i < inventory.getContainerSize(); i++) {
			total += value(inventory.getItem(i));
		}
		return (int) Math.min(Integer.MAX_VALUE, total);
	}

	public static void deposit(ServerPlayer player, int amount) {
		if (amount <= 0) {
			AccountService.error(player, "Deposit failed", "Enter an amount of at least 1 emerald.");
			return;
		}
		int available = inventoryEmeralds(player);
		if (amount > available) {
			AccountService.error(player, "Deposit failed", available == 0
					? "You don't have any emeralds in your inventory."
					: "You only have " + format(available) + " emeralds in your inventory.");
			return;
		}
		PlayerAccount account = AccountService.account(player);
		if ((long) account.balance() + amount > PlayerAccount.MAX_BALANCE) {
			AccountService.error(player, "Deposit failed", "Your wallet is full. Even EmeraldPay has limits!");
			return;
		}
		take(player, amount);
		finishDeposit(player, account, amount);
	}

	public static void depositAll(ServerPlayer player) {
		int available = inventoryEmeralds(player);
		if (available <= 0) {
			AccountService.error(player, "Deposit failed", "You don't have any emeralds in your inventory.");
			return;
		}
		PlayerAccount account = AccountService.account(player);
		int amount = (int) Math.min(available, (long) PlayerAccount.MAX_BALANCE - account.balance());
		if (amount <= 0) {
			AccountService.error(player, "Deposit failed", "Your wallet is full. Even EmeraldPay has limits!");
			return;
		}
		take(player, amount);
		finishDeposit(player, account, amount);
	}

	public static void withdraw(ServerPlayer player, int amount) {
		PlayerAccount account = AccountService.account(player);
		if (amount <= 0) {
			AccountService.error(player, "Withdrawal failed", "Enter an amount of at least 1 emerald.");
			return;
		}
		if (amount > MAX_WITHDRAW) {
			AccountService.error(player, "Withdrawal failed", "You can withdraw at most " + format(MAX_WITHDRAW) + " emeralds at once.");
			return;
		}
		if (amount > account.balance()) {
			AccountService.error(player, "Withdrawal failed", "Insufficient funds: your balance is " + format(account.balance()) + " emeralds.");
			return;
		}
		account.addBalance(-amount);
		account.addTransaction(AccountService.now(player.level().getServer()), -amount, "Withdrawal at Emerald Bank");
		give(player, amount);
		DeliveryEffects.playTo(player, SoundEvents.EXPERIENCE_ORB_PICKUP, 0.7f, 0.8f);
		AccountService.sync(player);
		AccountService.notify(player, "bank", "Withdrawal successful",
				"Withdrew " + format(amount) + " emeralds. New balance: " + format(account.balance()) + ".");
	}

	private static void finishDeposit(ServerPlayer player, PlayerAccount account, int amount) {
		account.addBalance(amount);
		account.addTransaction(AccountService.now(player.level().getServer()), amount, "Deposit at Emerald Bank");
		DeliveryEffects.playTo(player, SoundEvents.EXPERIENCE_ORB_PICKUP, 0.7f, 1.3f);
		AccountService.sync(player);
		AccountService.notify(player, "bank", "Deposit successful",
				"Deposited " + format(amount) + " emeralds. New balance: " + format(account.balance()) + ".");
	}

	/**
	 * Removes exactly {@code amount} emeralds worth of items: loose emeralds first, then emerald blocks,
	 * returning change for a partially used block. Callers must have checked availability.
	 */
	private static void take(ServerPlayer player, int amount) {
		Inventory inventory = player.getInventory();
		int remaining = amount;
		for (int i = 0; i < inventory.getContainerSize() && remaining > 0; i++) {
			ItemStack stack = inventory.getItem(i);
			if (stack.is(Items.EMERALD)) {
				int n = Math.min(remaining, stack.getCount());
				inventory.removeItem(i, n);
				remaining -= n;
			}
		}
		int change = 0;
		for (int i = 0; i < inventory.getContainerSize() && remaining > 0; i++) {
			ItemStack stack = inventory.getItem(i);
			if (stack.is(Items.EMERALD_BLOCK)) {
				int blocks = Math.min(stack.getCount(), (remaining + BLOCK_VALUE - 1) / BLOCK_VALUE);
				inventory.removeItem(i, blocks);
				int value = blocks * BLOCK_VALUE;
				if (value > remaining) {
					change = value - remaining;
					remaining = 0;
				} else {
					remaining -= value;
				}
			}
		}
		if (change > 0) {
			give(player, change);
		}
		inventory.setChanged();
	}

	/** Gives emeralds in full stacks; whatever doesn't fit drops at the player's feet. */
	private static void give(ServerPlayer player, int amount) {
		int remaining = amount;
		while (remaining > 0) {
			int n = Math.min(remaining, Items.EMERALD.getDefaultMaxStackSize());
			player.getInventory().placeItemBackInInventory(new ItemStack(Items.EMERALD, n));
			remaining -= n;
		}
	}

	private static int value(ItemStack stack) {
		if (stack.is(Items.EMERALD)) {
			return stack.getCount();
		}
		if (stack.is(Items.EMERALD_BLOCK)) {
			return stack.getCount() * BLOCK_VALUE;
		}
		return 0;
	}

	/** 1234567 -> "1,234,567". */
	public static String format(long amount) {
		return String.format(Locale.ROOT, "%,d", amount);
	}
}
