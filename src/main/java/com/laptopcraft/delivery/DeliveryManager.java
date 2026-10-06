package com.laptopcraft.delivery;

import com.laptopcraft.LaptopCraft;
import com.laptopcraft.account.AccountData;
import com.laptopcraft.account.AccountService;
import com.laptopcraft.account.DeliveryTarget;
import com.laptopcraft.account.MailTemplates;
import com.laptopcraft.account.Order;
import com.laptopcraft.account.OrderLine;
import com.laptopcraft.account.OrderStatus;
import com.laptopcraft.account.PlayerAccount;
import com.laptopcraft.block.LaptopBlock;
import com.laptopcraft.block.PackageBlock;
import com.laptopcraft.block.PackageBlockEntity;
import com.laptopcraft.registry.ModBlocks;
import com.laptopcraft.shop.Catalog;
import com.laptopcraft.shop.Product;
import com.laptopcraft.shop.Restaurant;
import com.laptopcraft.shop.Store;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.minecraft.ChatFormatting;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.HolderLookup;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.HoverEvent;
import net.minecraft.network.chat.MutableComponent;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.Vec3;
import org.jspecify.annotations.Nullable;

/**
 * Delivers due orders. Every {@link #CHECK_INTERVAL} ticks each pending order whose time has come is
 * delivered as a package block (Emerazon box / Ender Eats bag) on a free spot next to its laptop, or next
 * to the player for Follow-me orders. If the laptop's area isn't loaded the courier finds the player instead;
 * if there's no room at all the items go straight into the player's inventory. Orders that can't be delivered
 * yet (player offline, area unloaded) simply wait.
 */
public final class DeliveryManager {
	public static final int CHECK_INTERVAL = 10;
	/** Ticks to wait before retrying an order that couldn't be delivered. */
	private static final int RETRY_DELAY = 100;
	private static final int EMERAZON_COLOR = 0xFF9900;
	private static final int ENDER_EATS_COLOR = 0xB57BFF;

	/** "uuid#orderId" -> server tick of the next attempt. */
	private static final Map<String, Integer> RETRY_AT = new HashMap<>();

	private DeliveryManager() {
	}

	public static void init() {
		ServerTickEvents.END_SERVER_TICK.register(DeliveryManager::tick);
		ServerLifecycleEvents.SERVER_STOPPED.register(server -> RETRY_AT.clear());
		CourierManager.init();
	}

	private static void tick(MinecraftServer server) {
		CourierManager.tick(server);
		if (server.getTickCount() % CHECK_INTERVAL != 0) {
			return;
		}
		long now = AccountService.now(server);
		for (Map.Entry<UUID, PlayerAccount> entry : List.copyOf(AccountData.get(server).all().entrySet())) {
			PlayerAccount account = entry.getValue();
			if (!account.hasDueOrders(now)) {
				continue;
			}
			for (Order order : List.copyOf(account.orders())) {
				if (order.status() == OrderStatus.PENDING && order.deliverAt() <= now) {
					try {
						tryDeliver(server, entry.getKey(), account, order);
					} catch (RuntimeException e) {
						LaptopCraft.LOGGER.error("Delivery of order #{} for {} failed", order.id(), account.name(), e);
						RETRY_AT.put(key(entry.getKey(), order.id()), server.getTickCount() + RETRY_DELAY * 6);
					}
				}
			}
		}
	}

	/**
	 * Makes all of the player's pending orders due now (admin command).
	 *
	 * @return how many orders were rushed
	 */
	public static int rush(ServerPlayer player) {
		PlayerAccount account = AccountService.account(player);
		long now = AccountService.now(player.level().getServer());
		int rushed = 0;
		for (Order o : List.copyOf(account.orders())) {
			if (o.status() == OrderStatus.PENDING && o.deliverAt() > now) {
				account.replaceOrder(new Order(o.id(), o.store(), o.restaurantId(), o.lines(), o.subtotal(), o.fee(), o.tip(), o.total(),
						o.option(), o.placedAt(), now, o.status(), o.destination()));
				RETRY_AT.remove(key(player.getUUID(), o.id()));
				rushed++;
			}
		}
		if (rushed > 0) {
			AccountService.sync(player);
		}
		return rushed;
	}

	private static String key(UUID player, long orderId) {
		return player + "#" + orderId;
	}

	/** Where a package ended up. {@code level == null} means it went straight into the player's inventory. */
	private record Drop(@Nullable ServerLevel level, @Nullable BlockPos pos, boolean nearPlayer, boolean rerouted) {
	}

	private static void tryDeliver(MinecraftServer server, UUID owner, PlayerAccount account, Order order) {
		String retryKey = key(owner, order.id());
		Integer retry = RETRY_AT.get(retryKey);
		if (retry != null && retry > server.getTickCount()) {
			return;
		}
		ServerPlayer player = server.getPlayerList().getPlayer(owner);
		boolean playerAvailable = player != null && player.isAlive() && !player.isSpectator();
		DeliveryTarget target = account.target(order.id());

		// 1. Decide where the courier goes.
		ServerLevel level;
		BlockPos center;
		@Nullable Direction preferred;
		boolean nearPlayer;
		boolean rerouted = false;
		ServerLevel laptopLevel = target == null || target.toPlayer() ? null : server.getLevel(target.dimension());
		if (laptopLevel != null && laptopLevel.isLoaded(target.pos())) {
			level = laptopLevel;
			center = target.pos();
			BlockState laptop = level.getBlockState(center);
			preferred = laptop.getBlock() instanceof LaptopBlock ? laptop.getValue(LaptopBlock.FACING) : null;
			nearPlayer = false;
		} else if (playerAvailable) {
			level = player.level();
			center = player.blockPosition();
			preferred = player.getDirection();
			nearPlayer = true;
			rerouted = target != null && !target.toPlayer();
		} else {
			// Nobody to hand it to yet: wait for the player to log in or the area to load.
			RETRY_AT.put(retryKey, server.getTickCount() + RETRY_DELAY);
			return;
		}

		// 2. Pack the box.
		List<ItemStack> contents = createContents(order, server.registryAccess());
		Restaurant restaurant = Catalog.restaurant(order.restaurantId()).orElse(null);
		String sender = order.store() == Store.ENDER_EATS && restaurant != null ? restaurant.name() : order.store().displayName();
		PackageBlock packageBlock = ModBlocks.packageFor(order.store());

		// 3. Set it down (or hand it over).
		Drop drop;
		Optional<BlockPos> spot = DropSpotFinder.find(level, center, preferred, packageBlock.defaultBlockState());
		if (spot.isPresent()) {
			BlockPos pos = spot.get();
			Direction facing = Direction.getApproximateNearest(center.getX() - pos.getX(), 0, center.getZ() - pos.getZ());
			if (facing.getAxis().isVertical()) {
				facing = Direction.NORTH;
			}
			level.setBlock(pos, packageBlock.defaultBlockState().setValue(PackageBlock.FACING, facing), 3);
			if (level.getBlockEntity(pos) instanceof PackageBlockEntity parcel) {
				parcel.fill(contents, order.id(), account.name(), sender);
			}
			DeliveryEffects.arrival(level, pos, order.store());
			Vec3 recipient = playerAvailable && player.level() == level ? player.position() : Vec3.atCenterOf(center);
			CourierManager.spawn(level, pos, order.store(), recipient);
			drop = new Drop(level, pos, nearPlayer, rerouted);
		} else if (playerAvailable) {
			for (ItemStack stack : contents) {
				player.getInventory().placeItemBackInInventory(stack);
			}
			DeliveryEffects.arrival(player.level(), player.blockPosition(), order.store());
			drop = new Drop(null, null, true, rerouted);
		} else {
			RETRY_AT.put(retryKey, server.getTickCount() + RETRY_DELAY);
			return;
		}
		RETRY_AT.remove(retryKey);

		// 4. Paperwork.
		account.replaceOrder(order.withStatus(OrderStatus.DELIVERED));
		String summary = summary(order);
		String where = drop.level() == null ? "straight into your inventory (there was no room for the package)"
				: drop.nearPlayer() ? "right next to you at " + coords(drop.pos())
				: "next to your CubeBook at " + coords(drop.pos()) + OrderService.dimensionSuffix(drop.level().dimension());
		String mailFrom = order.store() == Store.ENDER_EATS ? MailTemplates.FROM_ENDER_EATS : MailTemplates.FROM_EMERAZON;
		String mailBody = (order.store() == Store.ENDER_EATS
				? "Your food from " + sender + " has arrived! Our courier left the bag " + where + ".\n\nEnjoy your meal!"
				: "Your package has been delivered " + where + ".\n\nRight-click the box to unbox it.")
				+ (drop.rerouted() ? "\n\nYour CubeBook's neighborhood wasn't loaded, so the courier tracked you down instead." : "")
				+ "\n\nOrder #" + order.id() + ": " + summary;
		if (playerAvailable) {
			AccountService.sendMail(player, mailFrom, "Delivered: " + summary, mailBody, OrderService.ordersLink(order.store()), false);
			AccountService.notify(player, order.store() == Store.ENDER_EATS ? "ender_eats" : "emerazon",
					order.store() == Store.ENDER_EATS ? "Your food is here!" : "Package delivered!",
					"Order #" + order.id() + " arrived " + where + ".");
			player.sendSystemMessage(chatMessage(order, drop, sender));
		} else {
			account.addMail(mailFrom, "Delivered: " + summary, mailBody, OrderService.ordersLink(order.store()), AccountService.now(server));
			AccountService.markDirty(server);
		}
		LaptopCraft.LOGGER.debug("Delivered {} order #{} for {} at {}", order.store().displayName(), order.id(), account.name(), drop.pos());
	}

	/** Builds the delivered stacks: product stack x quantity, split into max-size stacks. */
	static List<ItemStack> createContents(Order order, HolderLookup.Provider registries) {
		List<ItemStack> out = new ArrayList<>();
		for (OrderLine line : order.lines()) {
			Optional<Product> product = Catalog.get(line.productId());
			if (product.isEmpty()) {
				LaptopCraft.LOGGER.warn("Order #{} contains unknown product {}", order.id(), line.productId());
				continue;
			}
			ItemStack unit;
			try {
				unit = product.get().createStack(registries);
			} catch (RuntimeException e) {
				LaptopCraft.LOGGER.error("Product {} failed to create its item stack", line.productId(), e);
				continue;
			}
			if (unit == null || unit.isEmpty()) {
				continue;
			}
			long remaining = (long) unit.getCount() * Math.max(1, line.quantity());
			int max = Math.max(1, unit.getMaxStackSize());
			while (remaining > 0) {
				int n = (int) Math.min(max, remaining);
				out.add(unit.copyWithCount(n));
				remaining -= n;
			}
		}
		return out;
	}

	/** "Red Hoodie x2, Top Hat" (max three names). */
	static String summary(Order order) {
		StringBuilder b = new StringBuilder();
		int shown = 0;
		for (OrderLine line : order.lines()) {
			if (shown == 3) {
				b.append(" and ").append(order.lines().size() - 3).append(" more");
				break;
			}
			if (shown > 0) {
				b.append(", ");
			}
			b.append(Catalog.get(line.productId()).map(Product::name).orElse(line.productId()));
			if (line.quantity() > 1) {
				b.append(" x").append(line.quantity());
			}
			shown++;
		}
		return b.toString();
	}

	private static String coords(@Nullable BlockPos pos) {
		return pos == null ? "?" : pos.getX() + ", " + pos.getY() + ", " + pos.getZ();
	}

	private static Component chatMessage(Order order, Drop drop, String sender) {
		boolean food = order.store() == Store.ENDER_EATS;
		MutableComponent prefix = Component.literal("[" + order.store().displayName() + "] ")
				.withStyle(style -> style.withColor(food ? ENDER_EATS_COLOR : EMERAZON_COLOR).withBold(true));
		MutableComponent body;
		if (drop.pos() == null) {
			body = Component.translatable(food ? "message.laptopcraft.delivered.food.inventory" : "message.laptopcraft.delivered.inventory",
					order.id());
		} else {
			MutableComponent where = Component.literal("[" + coords(drop.pos()) + "]").withStyle(style -> style
					.withColor(ChatFormatting.GREEN)
					.withHoverEvent(new HoverEvent.ShowText(Component.translatable(food
							? "message.laptopcraft.delivered.hover.food" : "message.laptopcraft.delivered.hover"))));
			String key = food
					? (drop.nearPlayer() ? "message.laptopcraft.delivered.food.near_player" : "message.laptopcraft.delivered.food")
					: (drop.nearPlayer() ? "message.laptopcraft.delivered.near_player" : "message.laptopcraft.delivered");
			body = food
					? Component.translatable(key, sender, where)
					: Component.translatable(key, order.id(), where);
		}
		// Siblings inherit their parent's style, so keep the bold prefix and the body side by side.
		MutableComponent message = Component.empty().append(prefix).append(body.withStyle(ChatFormatting.WHITE));
		if (drop.rerouted()) {
			message.append(Component.literal(" ").append(Component.translatable("message.laptopcraft.delivered.rerouted")
					.withStyle(ChatFormatting.GRAY, ChatFormatting.ITALIC)));
		}
		return message;
	}
}
