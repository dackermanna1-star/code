package com.laptopcraft.shop;

import com.laptopcraft.content.ClothingContent;
import com.laptopcraft.content.CoreContent;
import com.laptopcraft.content.DecorContent;
import com.laptopcraft.content.FoodContent;
import com.laptopcraft.content.MarketplaceContent;
import com.laptopcraft.content.PaintingContent;
import com.laptopcraft.content.ToyContent;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import org.jspecify.annotations.Nullable;

/**
 * Static product + restaurant catalog shared by client and server. Filled once during mod
 * initialization by {@link #bootstrap()}, which asks every content group to add its products.
 */
public final class Catalog {
	private static final Map<String, Product> PRODUCTS = new LinkedHashMap<>();
	private static final Map<String, Restaurant> RESTAURANTS = new LinkedHashMap<>();
	private static boolean bootstrapped;

	/** Emerazon shipping: standard / express (seconds and fee). */
	public static final int EMERAZON_STANDARD_SECONDS = 60;
	public static final int EMERAZON_EXPRESS_SECONDS = 15;
	public static final int EMERAZON_EXPRESS_FEE = 2;
	/** Ender Eats "Priority" surcharge on top of the restaurant's own fee. */
	public static final int ENDER_EATS_PRIORITY_FEE = 2;
	/** Max distinct lines and units per order (server enforced). */
	public static final int MAX_ORDER_LINES = 20;
	public static final int MAX_UNITS_PER_LINE = 64;
	public static final int MAX_TIP = 10;

	private Catalog() {
	}

	public static void bootstrap() {
		if (bootstrapped) {
			return;
		}
		bootstrapped = true;
		CoreContent.addProducts();
		ClothingContent.addProducts();
		ToyContent.addProducts();
		DecorContent.addProducts();
		PaintingContent.addProducts();
		MarketplaceContent.addProducts();
		FoodContent.addRestaurantsAndMenus();
	}

	public static void register(Product product) {
		if (PRODUCTS.putIfAbsent(product.id(), product) != null) {
			throw new IllegalStateException("Duplicate LaptopCraft product id: " + product.id());
		}
	}

	public static void registerRestaurant(Restaurant restaurant) {
		if (RESTAURANTS.putIfAbsent(restaurant.id(), restaurant) != null) {
			throw new IllegalStateException("Duplicate LaptopCraft restaurant id: " + restaurant.id());
		}
	}

	public static Optional<Product> get(String id) {
		return Optional.ofNullable(PRODUCTS.get(id));
	}

	public static List<Product> all() {
		return Collections.unmodifiableList(new ArrayList<>(PRODUCTS.values()));
	}

	public static List<Product> byStore(Store store) {
		return PRODUCTS.values().stream().filter(p -> p.store() == store).toList();
	}

	/** Categories of a store in first-registration order. */
	public static List<String> categories(Store store) {
		return PRODUCTS.values().stream().filter(p -> p.store() == store).map(Product::category).distinct().toList();
	}

	public static List<Product> byCategory(Store store, String category) {
		return PRODUCTS.values().stream().filter(p -> p.store() == store && p.category().equals(category)).toList();
	}

	/** Case-insensitive search over name, description and category. */
	public static List<Product> search(Store store, String query) {
		String q = query.toLowerCase(Locale.ROOT).trim();
		if (q.isEmpty()) {
			return byStore(store);
		}
		return PRODUCTS.values().stream()
				.filter(p -> p.store() == store)
				.filter(p -> p.name().toLowerCase(Locale.ROOT).contains(q)
						|| p.description().toLowerCase(Locale.ROOT).contains(q)
						|| p.category().toLowerCase(Locale.ROOT).contains(q))
				.toList();
	}

	public static List<Restaurant> restaurants() {
		return Collections.unmodifiableList(new ArrayList<>(RESTAURANTS.values()));
	}

	public static Optional<Restaurant> restaurant(String id) {
		return Optional.ofNullable(RESTAURANTS.get(id));
	}

	public static List<Product> menu(String restaurantId) {
		return PRODUCTS.values().stream().filter(p -> p.store() == Store.ENDER_EATS && p.restaurantId().equals(restaurantId)).toList();
	}

	public static int deliveryFee(Store store, @Nullable Restaurant restaurant, DeliveryOption option) {
		if (store == Store.EMERAZON) {
			return option == DeliveryOption.EXPRESS ? EMERAZON_EXPRESS_FEE : 0;
		}
		int base = restaurant == null ? 0 : restaurant.deliveryFee();
		return option == DeliveryOption.EXPRESS ? base + ENDER_EATS_PRIORITY_FEE : base;
	}

	public static int deliverySeconds(Store store, @Nullable Restaurant restaurant, DeliveryOption option) {
		if (store == Store.EMERAZON) {
			return option == DeliveryOption.EXPRESS ? EMERAZON_EXPRESS_SECONDS : EMERAZON_STANDARD_SECONDS;
		}
		int base = restaurant == null ? 30 : restaurant.etaSeconds();
		return option == DeliveryOption.EXPRESS ? Math.max(10, base / 2) : base;
	}
}
