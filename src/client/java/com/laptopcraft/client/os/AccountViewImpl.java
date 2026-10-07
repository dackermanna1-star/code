package com.laptopcraft.client.os;

import com.laptopcraft.account.AccountSnapshot;
import com.laptopcraft.account.Mail;
import com.laptopcraft.account.Order;
import com.laptopcraft.account.OrderLine;
import com.laptopcraft.account.OrderStatus;
import com.laptopcraft.account.Transaction;
import com.laptopcraft.network.ModPayloads;
import com.laptopcraft.shop.Catalog;
import com.laptopcraft.shop.DeliveryOption;
import com.laptopcraft.shop.Product;
import com.laptopcraft.shop.Restaurant;
import com.laptopcraft.shop.Store;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.function.LongSupplier;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.minecraft.client.Minecraft;
import net.minecraft.core.BlockPos;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import org.jspecify.annotations.Nullable;

/**
 * {@link AccountView} implementation. {@link #online()} is the shared instance fed by
 * {@code ClientNetworking} (AccountSync / Notify); {@link #createOffline} builds a self-contained fake
 * account for the offline dev laptop where purchases, bank actions and deliveries are simulated.
 */
public final class AccountViewImpl implements AccountView {
	/** Receives simulated notifications (offline mode). */
	@FunctionalInterface
	public interface Notifier {
		void notify(String icon, String title, String message);
	}

	private static final AccountViewImpl ONLINE = new AccountViewImpl(false, () -> {
		Minecraft mc = Minecraft.getInstance();
		return mc.level == null ? 0L : mc.level.getGameTime();
	});

	private final boolean offline;
	private final LongSupplier gameTime;
	private AccountSnapshot snapshot = AccountSnapshot.EMPTY;
	private int version;
	private @Nullable String lastError;
	private BlockPos laptopPos = BlockPos.ZERO;
	private @Nullable Notifier notifier;
	private int fakeInventory = 37;

	private AccountViewImpl(boolean offline, LongSupplier gameTime) {
		this.offline = offline;
		this.gameTime = gameTime;
	}

	/** The shared online account view. */
	public static AccountViewImpl online() {
		return ONLINE;
	}

	/** A fresh simulated account for the offline dev laptop. */
	public static AccountViewImpl createOffline(LongSupplier gameTime) {
		AccountViewImpl a = new AccountViewImpl(true, gameTime);
		a.snapshot = OfflineAccount.sample(gameTime.getAsLong());
		return a;
	}

	// ------------------------------------------------------------------ feed

	/** New server snapshot (AccountSync / OpenLaptop). */
	public void update(AccountSnapshot s) {
		this.snapshot = s;
		version++;
	}

	/** Error message from a Notify("error", ...). */
	public void reportError(String message) {
		this.lastError = message;
	}

	/** Laptop used as delivery address for purchases. */
	public void setLaptopPos(BlockPos pos) {
		this.laptopPos = pos;
	}

	/** Receiver of simulated notifications (offline mode). */
	public void setNotifier(@Nullable Notifier n) {
		this.notifier = n;
	}

	/** Forget everything (disconnect). */
	public void reset() {
		snapshot = AccountSnapshot.EMPTY;
		lastError = null;
		version++;
	}

	// ------------------------------------------------------------------ AccountView

	@Override
	public AccountSnapshot snapshot() {
		return snapshot;
	}

	@Override
	public int balance() {
		return snapshot.balance();
	}

	@Override
	public int version() {
		return version;
	}

	@Override
	public @Nullable String consumeLastError() {
		String e = lastError;
		lastError = null;
		return e;
	}

	@Override
	public boolean isOffline() {
		return offline;
	}

	private static void send(net.minecraft.network.protocol.common.custom.CustomPacketPayload payload) {
		try {
			if (ClientPlayNetworking.canSend(payload.type())) {
				ClientPlayNetworking.send(payload);
			}
		} catch (IllegalStateException ignored) {
			// not connected
		}
	}

	@Override
	public void purchase(Store store, String restaurantId, List<OrderLine> lines, DeliveryOption option, int tip, boolean deliverToPlayer) {
		if (offline) {
			simulatePurchase(store, restaurantId == null ? "" : restaurantId, lines, option, tip, deliverToPlayer);
			return;
		}
		send(new ModPayloads.Purchase(store, restaurantId == null ? "" : restaurantId, List.copyOf(lines), option,
				Math.max(0, tip), deliverToPlayer, laptopPos));
	}

	@Override
	public void deposit(int amount) {
		if (amount <= 0) {
			return;
		}
		if (offline) {
			int moved = Math.min(amount, fakeInventory);
			if (moved <= 0) {
				fail("You don't have any emeralds in your inventory.");
				return;
			}
			fakeInventory -= moved;
			changeBalance(moved, "Deposit");
			say("bank", "Deposit complete", "+" + moved + " emeralds added to your wallet.");
			return;
		}
		send(new ModPayloads.Bank("deposit", amount));
	}

	@Override
	public void depositAll() {
		if (offline) {
			deposit(fakeInventory);
			return;
		}
		send(new ModPayloads.Bank("deposit_all", 0));
	}

	@Override
	public void withdraw(int amount) {
		if (amount <= 0) {
			return;
		}
		if (offline) {
			if (amount > snapshot.balance()) {
				fail("Not enough emeralds in your wallet.");
				return;
			}
			fakeInventory += amount;
			changeBalance(-amount, "Withdrawal");
			say("bank", "Withdrawal complete", amount + " emeralds moved to your inventory.");
			return;
		}
		send(new ModPayloads.Bank("withdraw", amount));
	}

	@Override
	public void markMailRead(long id) {
		updateMail(id, false);
		if (!offline) {
			send(new ModPayloads.MailAction("read", id));
		}
	}

	@Override
	public void deleteMail(long id) {
		updateMail(id, true);
		if (!offline) {
			send(new ModPayloads.MailAction("delete", id));
		}
	}

	@Override
	public void markAllRead() {
		List<Mail> mail = new ArrayList<>();
		for (Mail m : snapshot.mail()) {
			mail.add(m.asRead());
		}
		replace(snapshot.balance(), snapshot.orders(), mail, snapshot.transactions());
		if (!offline) {
			send(new ModPayloads.MailAction("read_all", 0L));
		}
	}

	@Override
	public void deleteAllMail() {
		replace(snapshot.balance(), snapshot.orders(), List.of(), snapshot.transactions());
		if (!offline) {
			send(new ModPayloads.MailAction("delete_all", 0L));
		}
	}

	/** Optimistic local mail update; the server confirms with an AccountSync. */
	private void updateMail(long id, boolean delete) {
		List<Mail> mail = new ArrayList<>();
		boolean changed = false;
		for (Mail m : snapshot.mail()) {
			if (m.id() == id) {
				changed = true;
				if (!delete) {
					mail.add(m.asRead());
				}
			} else {
				mail.add(m);
			}
		}
		if (changed) {
			replace(snapshot.balance(), snapshot.orders(), mail, snapshot.transactions());
		}
	}

	@Override
	public void refresh() {
		if (!offline) {
			send(ModPayloads.RequestAccount.INSTANCE);
		}
	}

	@Override
	public int inventoryEmeralds() {
		if (offline) {
			return fakeInventory;
		}
		Player p = Minecraft.getInstance().player;
		if (p == null) {
			return 0;
		}
		int n = 0;
		for (ItemStack s : p.getInventory().getNonEquipmentItems()) {
			if (s.is(Items.EMERALD)) {
				n += s.getCount();
			} else if (s.is(Items.EMERALD_BLOCK)) {
				n += s.getCount() * 9;
			}
		}
		return n;
	}

	// ------------------------------------------------------------------ offline simulation

	/** Advances simulated deliveries (offline only). Called every client tick by the OS. */
	public void tick() {
		if (!offline) {
			return;
		}
		long now = gameTime.getAsLong();
		List<Order> orders = new ArrayList<>(snapshot.orders());
		List<Mail> mail = new ArrayList<>(snapshot.mail());
		boolean changed = false;
		for (int i = 0; i < orders.size(); i++) {
			Order o = orders.get(i);
			if (o.status() == OrderStatus.PENDING && now >= o.deliverAt()) {
				orders.set(i, o.withStatus(OrderStatus.DELIVERED));
				changed = true;
				boolean food = o.store() == Store.ENDER_EATS;
				String what = food ? "Your food" : "Your package";
				mail.add(0, new Mail(nextMailId(mail), food ? "Ender Eats" : "Emerazon",
						(food ? "Order #" : "Package #") + o.id() + " delivered",
						what + " has arrived" + (o.destination().isEmpty() ? "" : " (" + o.destination() + ")")
								+ ". Enjoy! Please rate your experience.",
						now, false, food ? "endereats.mc/orders" : "emerazon.mc/orders"));
				say(food ? "ender_eats" : "emerazon", "Delivered!", what + " (order #" + o.id() + ") has arrived.");
			}
		}
		if (changed) {
			replace(snapshot.balance(), orders, mail, snapshot.transactions());
		}
	}

	private void simulatePurchase(Store store, String restaurantId, List<OrderLine> lines, DeliveryOption option, int tip, boolean toPlayer) {
		if (lines.isEmpty()) {
			fail("Your cart is empty.");
			return;
		}
		int subtotal = 0;
		List<String> names = new ArrayList<>();
		for (OrderLine line : lines) {
			Optional<Product> p = Catalog.get(line.productId());
			if (p.isEmpty() || p.get().store() != store) {
				fail("Product not available: " + line.productId());
				return;
			}
			if (line.quantity() <= 0 || line.quantity() > Catalog.MAX_UNITS_PER_LINE) {
				fail("Invalid quantity for " + p.get().name());
				return;
			}
			subtotal += p.get().price() * line.quantity();
			names.add(line.quantity() + "× " + p.get().name());
		}
		Restaurant restaurant = store == Store.ENDER_EATS ? Catalog.restaurant(restaurantId).orElse(null) : null;
		if (store == Store.ENDER_EATS && restaurant == null) {
			fail("Unknown restaurant.");
			return;
		}
		int fee = Catalog.deliveryFee(store, restaurant, option);
		int realTip = store == Store.ENDER_EATS ? Math.max(0, Math.min(tip, Catalog.MAX_TIP)) : 0;
		int total = subtotal + fee + realTip;
		if (total > snapshot.balance()) {
			fail("Not enough emeralds: this order costs " + total + ", you have " + snapshot.balance() + ".");
			return;
		}
		long now = gameTime.getAsLong();
		int seconds = Catalog.deliverySeconds(store, restaurant, option);
		long id = snapshot.orders().stream().mapToLong(Order::id).max().orElse(0L) + 1;
		Order order = new Order(id, store, restaurantId, List.copyOf(lines), subtotal, fee, realTip, total, option, now,
				now + seconds * 20L, OrderStatus.PENDING, toPlayer ? "Follow me" : "Dev laptop");
		List<Order> orders = new ArrayList<>(snapshot.orders());
		orders.add(0, order);
		List<Transaction> tx = new ArrayList<>(snapshot.transactions());
		String shop = store.displayName();
		tx.add(0, new Transaction(now, -total, shop + " order #" + id));
		List<Mail> mail = new ArrayList<>(snapshot.mail());
		mail.add(0, new Mail(nextMailId(mail), shop, "Order #" + id + " confirmed",
				"Thanks for your order!\n\n" + String.join("\n", names) + "\n\nTotal: " + total
						+ " emeralds\nEstimated delivery: " + seconds + " seconds.",
				now, false, store == Store.ENDER_EATS ? "endereats.mc/orders" : "emerazon.mc/orders"));
		replace(snapshot.balance() - total, orders, mail, tx);
		say(store == Store.ENDER_EATS ? "ender_eats" : "emerazon", "Order placed!",
				"Order #" + id + " · " + total + " emeralds · arriving in ~" + seconds + "s");
	}

	private void changeBalance(int delta, String description) {
		List<Transaction> tx = new ArrayList<>(snapshot.transactions());
		tx.add(0, new Transaction(gameTime.getAsLong(), delta, description));
		replace(snapshot.balance() + delta, snapshot.orders(), snapshot.mail(), tx);
	}

	private static long nextMailId(List<Mail> mail) {
		return mail.stream().mapToLong(Mail::id).max().orElse(0L) + 1;
	}

	private void replace(int balance, List<Order> orders, List<Mail> mail, List<Transaction> tx) {
		snapshot = new AccountSnapshot(balance, List.copyOf(orders), List.copyOf(mail), List.copyOf(tx),
				offline ? gameTime.getAsLong() : snapshot.gameTime());
		version++;
	}

	private void fail(String message) {
		lastError = message;
		say("error", "Something went wrong", message);
	}

	private void say(String icon, String title, String message) {
		if (notifier != null) {
			notifier.notify(icon, title, message);
		}
	}
}
