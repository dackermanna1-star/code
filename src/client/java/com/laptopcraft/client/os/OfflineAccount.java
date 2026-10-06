package com.laptopcraft.client.os;

import com.laptopcraft.account.AccountSnapshot;
import com.laptopcraft.account.Mail;
import com.laptopcraft.account.Order;
import com.laptopcraft.account.OrderLine;
import com.laptopcraft.account.OrderStatus;
import com.laptopcraft.account.Transaction;
import com.laptopcraft.shop.Catalog;
import com.laptopcraft.shop.DeliveryOption;
import com.laptopcraft.shop.Product;
import com.laptopcraft.shop.Restaurant;
import com.laptopcraft.shop.Store;
import java.util.List;

/** Sample data for the offline dev laptop's fake account. */
final class OfflineAccount {
	private OfflineAccount() {
	}

	static AccountSnapshot sample(long now) {
		List<Product> emerazon = Catalog.byStore(Store.EMERAZON);
		List<Product> food = Catalog.byStore(Store.ENDER_EATS);
		String shopItem = emerazon.isEmpty() ? "sample_item" : emerazon.get(0).id();
		String shopItem2 = emerazon.size() > 1 ? emerazon.get(1).id() : shopItem;
		int price1 = emerazon.isEmpty() ? 12 : emerazon.get(0).price();
		int price2 = emerazon.size() > 1 ? emerazon.get(1).price() : price1;
		String restaurantId = Catalog.restaurants().isEmpty() ? "" : Catalog.restaurants().get(0).id();
		String foodItem = food.isEmpty() ? "sample_food" : food.get(0).id();
		int foodPrice = food.isEmpty() ? 6 : food.get(0).price();
		if (!restaurantId.isEmpty()) {
			List<Product> menu = Catalog.menu(restaurantId);
			if (!menu.isEmpty()) {
				foodItem = menu.get(0).id();
				foodPrice = menu.get(0).price();
			}
		}
		Restaurant restaurant = Catalog.restaurant(restaurantId).orElse(null);
		int foodFee = Catalog.deliveryFee(Store.ENDER_EATS, restaurant, DeliveryOption.STANDARD);

		// Order 2: food on its way (arrives ~45 s after the laptop opens). Order 1: delivered yesterday.
		Order pending = new Order(2, Store.ENDER_EATS, restaurantId, List.of(new OrderLine(foodItem, 2)), foodPrice * 2, foodFee, 2,
				foodPrice * 2 + foodFee + 2, DeliveryOption.STANDARD, now - 300, now + 900, OrderStatus.PENDING, "Dev laptop");
		Order delivered = new Order(1, Store.EMERAZON, "", List.of(new OrderLine(shopItem, 1), new OrderLine(shopItem2, 1)),
				price1 + price2, 0, 0, price1 + price2, DeliveryOption.STANDARD, now - 26000, now - 24800, OrderStatus.DELIVERED, "Dev laptop");

		List<Mail> mail = List.of(
				new Mail(3, "Prince of the Nether", "URGENT: 1,000,000 emeralds waiting for YOU",
						"Dearest friend,\n\nI am a wealthy piglin prince with a fortune in gold-ish emeralds. Kindly send 5 emeralds "
								+ "for \"processing\" and I will share my riches. Trust me. I am very trustworthy.\n\nOink regards,\nPrince Snoutington III",
						now - 1200, false, ""),
				new Mail(2, "Emerazon", "Your package has been delivered",
						"Good news! Order #1 was delivered next to your laptop.\nWe hope you love it. Don't forget to leave a review!",
						now - 24800, true, "emerazon.mc/orders"),
				new Mail(1, "CubeOS Team", "Welcome to your new CubeBook!",
						"Hi there!\n\nThanks for choosing the CubeBook. Explore the internet with the Browser, shop on Emerazon, order food "
								+ "on Ender Eats and keep your emeralds safe at the Emerald Bank.\n\nHave fun!\nThe CubeOS Team",
						now - 30000, true, "bloogle.mc"));

		List<Transaction> tx = List.of(
				new Transaction(now - 300, -pending.total(), "Ender Eats order #2"),
				new Transaction(now - 26000, -delivered.total(), "Emerazon order #1"),
				new Transaction(now - 27000, 150, "Deposit"));
		int balance = 120;
		return new AccountSnapshot(balance, List.of(pending, delivered), mail, tx, now);
	}
}
