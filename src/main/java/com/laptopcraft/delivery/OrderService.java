package com.laptopcraft.delivery;

import com.laptopcraft.LaptopCraft;
import com.laptopcraft.account.AccountService;
import com.laptopcraft.account.BankService;
import com.laptopcraft.account.DeliveryTarget;
import com.laptopcraft.account.MailTemplates;
import com.laptopcraft.account.Order;
import com.laptopcraft.account.OrderLine;
import com.laptopcraft.account.OrderStatus;
import com.laptopcraft.account.PlayerAccount;
import com.laptopcraft.block.LaptopSessions;
import com.laptopcraft.network.ModPayloads;
import com.laptopcraft.registry.ModSounds;
import com.laptopcraft.shop.Catalog;
import com.laptopcraft.shop.DeliveryOption;
import com.laptopcraft.shop.Product;
import com.laptopcraft.shop.Restaurant;
import com.laptopcraft.shop.Store;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import net.minecraft.core.BlockPos;
import net.minecraft.core.HolderLookup;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import org.jspecify.annotations.Nullable;

/**
 * Places orders: validates a {@link ModPayloads.Purchase} against the {@link Catalog} (never trusting the client's
 * prices), charges the EmeraldPay wallet, records the order with its delivery address and sends the receipt.
 * {@link DeliveryManager} takes it from there.
 */
public final class OrderService {
	/** Max distance between the player and the laptop the order is placed from. */
	public static final double ORDER_RANGE = 8.0;

	private OrderService() {
	}

	/** Outcome of validating the cart: either priced lines or a user-facing error. */
	private record CartCheck(List<PricedLine> lines, @Nullable String error) {
		static CartCheck fail(String error) {
			return new CartCheck(List.of(), error);
		}
	}

	private record PricedLine(Product product, int quantity) {
		int price() {
			return product.price() * quantity;
		}
	}

	/** Handles a purchase request from the CubeOS browser. */
	public static void purchase(ServerPlayer player, ModPayloads.Purchase request) {
		Store store = request.store();
		@Nullable Restaurant restaurant = null;
		if (store == Store.ENDER_EATS) {
			restaurant = Catalog.restaurant(request.restaurantId()).orElse(null);
			if (restaurant == null) {
				reject(player, "That restaurant isn't on Ender Eats (anymore).");
				return;
			}
		}
		if (!LaptopSessions.isLaptopInRange(player, request.laptopPos(), ORDER_RANGE)) {
			reject(player, "You need to be sitting at your CubeBook to place an order.");
			return;
		}

		CartCheck cart = validateLines(player.level().registryAccess(), restaurant, store, request.lines());
		if (cart.error() != null) {
			reject(player, cart.error());
			return;
		}
		List<PricedLine> lines = cart.lines();

		int tip = request.tip();
		if ((store == Store.EMERAZON && tip != 0) || tip < 0 || tip > Catalog.MAX_TIP) {
			reject(player, "Invalid tip amount.");
			return;
		}
		DeliveryOption option = request.option();
		long subtotalLong = lines.stream().mapToLong(PricedLine::price).sum();
		int fee = Catalog.deliveryFee(store, restaurant, option);
		long totalLong = subtotalLong + fee + tip;
		if (totalLong > PlayerAccount.MAX_BALANCE) {
			reject(player, "That order is way too expensive. Even for you.");
			return;
		}
		int subtotal = (int) subtotalLong;

		PlayerAccount account = AccountService.account(player);
		if (account.pendingOrders() >= PlayerAccount.MAX_PENDING_ORDERS) {
			reject(player, "You already have " + PlayerAccount.MAX_PENDING_ORDERS
					+ " deliveries on the way. Wait for a few to arrive first!");
			return;
		}
		boolean free = player.isCreative();
		int total = free ? 0 : (int) totalLong;
		if (account.balance() < total) {
			AccountService.error(player, "Payment declined", "Your EmeraldPay balance (" + emeralds(account.balance())
					+ ") is too low for this order (" + emeralds(total) + "). Deposit emeralds at Emerald Bank (emeraldbank.mc).");
			return;
		}

		long now = AccountService.now(player.level().getServer());
		long id = account.nextOrderId();
		int seconds = Catalog.deliverySeconds(store, restaurant, option);
		BlockPos laptopPos = request.laptopPos().immutable();
		ResourceKey<Level> dimension = player.level().dimension();
		String destination = request.deliverToPlayer()
				? "Follow-me delivery to " + player.getGameProfile().name()
				: "CubeBook at " + laptopPos.getX() + ", " + laptopPos.getY() + ", " + laptopPos.getZ() + dimensionSuffix(dimension);
		List<OrderLine> orderLines = lines.stream().map(l -> new OrderLine(l.product().id(), l.quantity())).toList();
		Order order = new Order(id, store, restaurant == null ? "" : restaurant.id(), orderLines, subtotal, fee, tip, total, option,
				now, now + seconds * 20L, OrderStatus.PENDING, destination);

		if (total > 0) {
			account.addBalance(-total);
			account.addTransaction(now, -total, orderTitle(store, restaurant, id));
		}
		account.addOrder(order, new DeliveryTarget(id, dimension, laptopPos, request.deliverToPlayer()));
		AccountService.sendMail(player, store == Store.ENDER_EATS ? MailTemplates.FROM_ENDER_EATS : MailTemplates.FROM_EMERAZON,
				receiptSubject(store, restaurant, lines, id), receiptBody(player, order, restaurant, lines, free, seconds),
				ordersLink(store), false);

		int units = lines.stream().mapToInt(PricedLine::quantity).sum();
		String eta = "~" + duration(seconds);
		if (store == Store.ENDER_EATS) {
			AccountService.notify(player, "ender_eats", "Order placed",
					restaurant.name() + " is preparing your order #" + id + ". Courier arrives in " + eta + ".");
		} else {
			AccountService.notify(player, "emerazon", "Order placed",
					"Order #" + id + " - " + units + (units == 1 ? " item" : " items") + " - arriving in " + eta + ".");
		}
		DeliveryEffects.playTo(player, ModSounds.SHOP_PURCHASE, 1.0f, 1.0f);
		AccountService.sync(player);
		LaptopCraft.LOGGER.info("{} placed {} order #{} ({} lines, total {}{})", player.getGameProfile().name(), store.displayName(), id,
				lines.size(), total, free ? ", creative" : "");
	}

	/** Checks every line against the catalog; duplicate products are merged. */
	private static CartCheck validateLines(HolderLookup.Provider registries, @Nullable Restaurant restaurant, Store store, List<OrderLine> requested) {
		if (requested.isEmpty()) {
			return CartCheck.fail("Your cart is empty.");
		}
		Map<String, Integer> merged = new LinkedHashMap<>();
		for (OrderLine line : requested) {
			if (line.quantity() < 1 || line.quantity() > Catalog.MAX_UNITS_PER_LINE) {
				return CartCheck.fail("Quantities must be between 1 and " + Catalog.MAX_UNITS_PER_LINE + ".");
			}
			merged.merge(line.productId(), line.quantity(), Integer::sum);
		}
		if (merged.size() > Catalog.MAX_ORDER_LINES) {
			return CartCheck.fail("Too many different items: at most " + Catalog.MAX_ORDER_LINES + " per order.");
		}
		List<PricedLine> lines = new ArrayList<>();
		for (Map.Entry<String, Integer> e : merged.entrySet()) {
			Optional<Product> found = Catalog.get(e.getKey());
			if (found.isEmpty() || found.get().store() != store) {
				return CartCheck.fail("One of the items in your cart is no longer available.");
			}
			Product product = found.get();
			if (restaurant != null && !product.restaurantId().equals(restaurant.id())) {
				return CartCheck.fail(product.name() + " isn't on the menu at " + restaurant.name() + ".");
			}
			if (e.getValue() > Catalog.MAX_UNITS_PER_LINE) {
				return CartCheck.fail("You can order at most " + Catalog.MAX_UNITS_PER_LINE + " of " + product.name() + ".");
			}
			if (!canCreate(product, registries)) {
				return CartCheck.fail(product.name() + " is temporarily out of stock.");
			}
			lines.add(new PricedLine(product, e.getValue()));
		}
		return new CartCheck(lines, null);
	}

	/** Makes sure the product can actually be delivered (content bugs must not take the player's money). */
	private static boolean canCreate(Product product, HolderLookup.Provider registries) {
		try {
			ItemStack stack = product.createStack(registries);
			return stack != null && !stack.isEmpty();
		} catch (RuntimeException e) {
			LaptopCraft.LOGGER.error("Product {} failed to create its item stack", product.id(), e);
			return false;
		}
	}

	/**
	 * Admin gift (command): a free Follow-me order of {@code quantity} x {@code product} that arrives next to
	 * {@code recipient} after {@code delaySeconds}.
	 *
	 * @return the order id, or -1 if the product can't be delivered
	 */
	public static long gift(ServerPlayer recipient, Product product, int quantity, int delaySeconds, String from) {
		if (!canCreate(product, recipient.level().registryAccess())) {
			return -1;
		}
		PlayerAccount account = AccountService.account(recipient);
		long now = AccountService.now(recipient.level().getServer());
		long id = account.nextOrderId();
		int qty = Math.clamp(quantity, 1, Catalog.MAX_UNITS_PER_LINE);
		String restaurantId = product.store() == Store.ENDER_EATS ? product.restaurantId() : "";
		Order order = new Order(id, product.store(), restaurantId, List.of(new OrderLine(product.id(), qty)), product.price() * qty, 0, 0, 0,
				DeliveryOption.EXPRESS, now, now + Math.max(1, delaySeconds) * 20L, OrderStatus.PENDING, "Gift for " + recipient.getGameProfile().name());
		account.addOrder(order, new DeliveryTarget(id, recipient.level().dimension(), recipient.blockPosition(), true));
		AccountService.sendMail(recipient, product.store() == Store.ENDER_EATS ? MailTemplates.FROM_ENDER_EATS : MailTemplates.FROM_EMERAZON,
				"A gift is on its way!", from + " sent you a gift: " + qty + " x " + product.name() + ".\n\n"
						+ "It will be delivered right next to you in about " + duration(Math.max(1, delaySeconds)) + ". Enjoy!",
				ordersLink(product.store()), true);
		return id;
	}

	private static void reject(ServerPlayer player, String message) {
		AccountService.error(player, "Order failed", message);
	}

	// ------------------------------------------------------------------ texts

	static String orderTitle(Store store, @Nullable Restaurant restaurant, long id) {
		return store == Store.ENDER_EATS && restaurant != null
				? "Ender Eats #" + id + " - " + restaurant.name()
				: store.displayName() + " order #" + id;
	}

	static String ordersLink(Store store) {
		return store == Store.ENDER_EATS ? "endereats.mc/orders" : "emerazon.mc/orders";
	}

	private static String receiptSubject(Store store, @Nullable Restaurant restaurant, List<PricedLine> lines, long id) {
		if (store == Store.ENDER_EATS && restaurant != null) {
			return restaurant.name() + " is preparing your order #" + id;
		}
		String first = lines.getFirst().product().name();
		return "Order #" + id + " confirmed: " + first + (lines.size() > 1 ? " and " + (lines.size() - 1) + " more" : "");
	}

	private static String receiptBody(ServerPlayer player, Order order, @Nullable Restaurant restaurant, List<PricedLine> lines,
			boolean free, int seconds) {
		StringBuilder b = new StringBuilder();
		String name = player.getGameProfile().name();
		if (order.store() == Store.ENDER_EATS && restaurant != null) {
			b.append("Thanks for ordering from ").append(restaurant.name()).append(", ").append(name).append("!\n");
			b.append("The kitchen is on it and an Enderman courier is standing by.\n\n");
		} else {
			b.append("Thanks for shopping with Emerazon, ").append(name).append("!\n");
			b.append("We're packing your box right now.\n\n");
		}
		b.append("Order #").append(order.id()).append(" - ").append(optionLabel(order.store(), order.option())).append("\n\n");
		for (PricedLine line : lines) {
			b.append("- ").append(line.quantity()).append(" x ").append(line.product().name())
					.append(": ").append(emeralds(line.price())).append('\n');
		}
		b.append('\n');
		b.append("Subtotal: ").append(emeralds(order.subtotal())).append('\n');
		b.append("Delivery: ").append(order.fee() == 0 ? "FREE" : emeralds(order.fee())).append('\n');
		if (order.store() == Store.ENDER_EATS) {
			b.append("Courier tip: ").append(order.tip() == 0 ? "none" : emeralds(order.tip())).append('\n');
		}
		if (free) {
			b.append("Total charged: 0 emeralds\n");
			b.append("Creative mode - on the house!\n");
		} else {
			b.append("Total charged: ").append(emeralds(order.total())).append('\n');
		}
		b.append('\n');
		b.append("Delivering to: ").append(order.destination()).append('\n');
		b.append("Estimated arrival: in about ").append(duration(seconds)).append(".\n\n");
		b.append(order.store() == Store.ENDER_EATS
				? "Track your courier live at endereats.mc."
				: "Track your package at emerazon.mc. Right-click the box when it arrives to unbox it!");
		return b.toString();
	}

	static String optionLabel(Store store, DeliveryOption option) {
		if (store == Store.ENDER_EATS) {
			return option == DeliveryOption.EXPRESS ? "Priority delivery" : "Standard delivery";
		}
		return option == DeliveryOption.EXPRESS ? "Express delivery" : "Standard delivery (free)";
	}

	static String dimensionSuffix(ResourceKey<Level> dimension) {
		if (dimension == Level.OVERWORLD) {
			return "";
		}
		if (dimension == Level.NETHER) {
			return " (the Nether)";
		}
		if (dimension == Level.END) {
			return " (the End)";
		}
		return " (" + dimension.identifier().getPath() + ")";
	}

	static String emeralds(long amount) {
		return BankService.format(amount) + (amount == 1 ? " emerald" : " emeralds");
	}

	/** 45 -> "45 seconds", 90 -> "1 min 30 s". */
	static String duration(int seconds) {
		if (seconds < 60) {
			return seconds + (seconds == 1 ? " second" : " seconds");
		}
		int min = seconds / 60;
		int sec = seconds % 60;
		return min + " min" + (sec == 0 ? "" : " " + sec + " s");
	}
}
