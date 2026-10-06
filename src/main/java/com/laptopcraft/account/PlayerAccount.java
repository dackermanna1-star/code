package com.laptopcraft.account;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.jspecify.annotations.Nullable;

/**
 * Mutable server-side state of one player's EmeraldPay account: wallet, orders, mail, transactions and the
 * (server-only) delivery addresses of pending orders. All lists are kept newest-first and trimmed.
 * Owned by {@link AccountData}; always mutate through {@link AccountService} so the data is marked dirty
 * and the client is synced.
 */
public final class PlayerAccount {
	public static final int MAX_ORDERS = 50;
	public static final int MAX_MAIL = 100;
	public static final int MAX_TRANSACTIONS = 100;
	/** Pending orders per player (keeps the order list bounded: pending orders are never trimmed). */
	public static final int MAX_PENDING_ORDERS = 20;
	public static final int MAX_BALANCE = 1_000_000_000;
	public static final int MAX_FROM = 64;
	public static final int MAX_SUBJECT = 128;
	public static final int MAX_BODY = 2000;
	public static final int MAX_LINK = 256;

	public static final Codec<PlayerAccount> CODEC = RecordCodecBuilder.create(i -> i.group(
			Codec.STRING.optionalFieldOf("name", "").forGetter(a -> a.name),
			Codec.INT.optionalFieldOf("balance", 0).forGetter(a -> a.balance),
			Order.CODEC.listOf().optionalFieldOf("orders", List.of()).forGetter(a -> a.orders),
			Mail.CODEC.listOf().optionalFieldOf("mail", List.of()).forGetter(a -> a.mail),
			Transaction.CODEC.listOf().optionalFieldOf("transactions", List.of()).forGetter(a -> a.transactions),
			DeliveryTarget.CODEC.listOf().optionalFieldOf("targets", List.of()).forGetter(a -> List.copyOf(a.targets.values())),
			Codec.LONG.optionalFieldOf("next_order_id", 1L).forGetter(a -> a.nextOrderId),
			Codec.LONG.optionalFieldOf("next_mail_id", 1L).forGetter(a -> a.nextMailId)
	).apply(i, PlayerAccount::new));

	private String name;
	private int balance;
	private final List<Order> orders;
	private final List<Mail> mail;
	private final List<Transaction> transactions;
	private final Map<Long, DeliveryTarget> targets = new LinkedHashMap<>();
	private long nextOrderId;
	private long nextMailId;

	private PlayerAccount(String name, int balance, List<Order> orders, List<Mail> mail, List<Transaction> transactions,
			List<DeliveryTarget> targets, long nextOrderId, long nextMailId) {
		this.name = name;
		this.balance = Math.clamp(balance, 0, MAX_BALANCE);
		this.orders = new ArrayList<>(orders);
		this.mail = new ArrayList<>(mail);
		this.transactions = new ArrayList<>(transactions);
		for (DeliveryTarget target : targets) {
			this.targets.put(target.orderId(), target);
		}
		// Never hand out an id twice, even if the counters were lost or edited.
		this.nextOrderId = Math.max(nextOrderId, this.orders.stream().mapToLong(Order::id).max().orElse(0L) + 1);
		this.nextMailId = Math.max(nextMailId, this.mail.stream().mapToLong(Mail::id).max().orElse(0L) + 1);
	}

	/** A brand-new, empty account. */
	public static PlayerAccount create(String name) {
		return new PlayerAccount(name, 0, List.of(), List.of(), List.of(), List.of(), 1L, 1L);
	}

	// ------------------------------------------------------------------ basics

	public String name() {
		return name;
	}

	public void setName(String name) {
		this.name = name;
	}

	public int balance() {
		return balance;
	}

	/** Sets the balance, clamped to 0..{@link #MAX_BALANCE}. */
	public void setBalance(int balance) {
		this.balance = Math.clamp(balance, 0, MAX_BALANCE);
	}

	/** Adds {@code delta} (may be negative), clamped; returns the new balance. */
	public int addBalance(long delta) {
		this.balance = (int) Math.clamp(balance + delta, 0L, MAX_BALANCE);
		return balance;
	}

	public void addTransaction(long time, int amount, String description) {
		transactions.addFirst(new Transaction(time, amount, description));
		while (transactions.size() > MAX_TRANSACTIONS) {
			transactions.removeLast();
		}
	}

	public AccountSnapshot snapshot(long gameTime) {
		return new AccountSnapshot(balance, List.copyOf(orders), List.copyOf(mail), List.copyOf(transactions), gameTime);
	}

	// ------------------------------------------------------------------ mail

	/**
	 * Adds a mail (newest first), trimming the inbox to {@link #MAX_MAIL}. Texts are clipped so a full inbox
	 * plus a full laptop still fit in one {@code OpenLaptop} packet (1 MiB).
	 */
	public Mail addMail(String from, String subject, String body, String link, long time) {
		Mail m = new Mail(nextMailId++, clip(from, MAX_FROM), clip(subject, MAX_SUBJECT), clip(body, MAX_BODY), time, false, clip(link, MAX_LINK));
		mail.addFirst(m);
		while (mail.size() > MAX_MAIL) {
			mail.removeLast();
		}
		return m;
	}

	public List<Mail> mail() {
		return Collections.unmodifiableList(mail);
	}

	public long unreadMail() {
		return mail.stream().filter(m -> !m.read()).count();
	}

	public boolean markRead(long id) {
		for (int i = 0; i < mail.size(); i++) {
			Mail m = mail.get(i);
			if (m.id() == id) {
				if (!m.read()) {
					mail.set(i, m.asRead());
				}
				return true;
			}
		}
		return false;
	}

	public boolean deleteMail(long id) {
		return mail.removeIf(m -> m.id() == id);
	}

	public int markAllRead() {
		int changed = 0;
		for (int i = 0; i < mail.size(); i++) {
			if (!mail.get(i).read()) {
				mail.set(i, mail.get(i).asRead());
				changed++;
			}
		}
		return changed;
	}

	public int deleteAllMail() {
		int n = mail.size();
		mail.clear();
		return n;
	}

	// ------------------------------------------------------------------ orders

	/** Reserves the next order number. */
	public long nextOrderId() {
		return nextOrderId++;
	}

	public List<Order> orders() {
		return Collections.unmodifiableList(orders);
	}

	public Optional<Order> order(long id) {
		return orders.stream().filter(o -> o.id() == id).findFirst();
	}

	public long pendingOrders() {
		return orders.stream().filter(o -> o.status() == OrderStatus.PENDING).count();
	}

	/** True if any pending order is due at {@code gameTime}. */
	public boolean hasDueOrders(long gameTime) {
		for (Order order : orders) {
			if (order.status() == OrderStatus.PENDING && order.deliverAt() <= gameTime) {
				return true;
			}
		}
		return false;
	}

	/** Adds a new order (newest first) with its delivery address, trimming old finished orders. */
	public void addOrder(Order order, DeliveryTarget target) {
		orders.addFirst(order);
		targets.put(order.id(), target);
		for (int i = orders.size() - 1; i >= 0 && orders.size() > MAX_ORDERS; i--) {
			Order old = orders.get(i);
			if (old.status() != OrderStatus.PENDING) {
				orders.remove(i);
				targets.remove(old.id());
			}
		}
	}

	/** Replaces the stored order with the same id (e.g. a status change). */
	public void replaceOrder(Order order) {
		for (int i = 0; i < orders.size(); i++) {
			if (orders.get(i).id() == order.id()) {
				orders.set(i, order);
				if (order.status() != OrderStatus.PENDING) {
					targets.remove(order.id());
				}
				return;
			}
		}
	}

	public @Nullable DeliveryTarget target(long orderId) {
		return targets.get(orderId);
	}

	private static String clip(String s, int max) {
		return s.length() <= max ? s : s.substring(0, max - 3) + "...";
	}
}
