package com.laptopcraft.account;

/**
 * Canned mail written by the in-game companies. Bodies are plain text (the Mail app wraps lines);
 * links are in-game URLs opened by the Mail app's button.
 */
public final class MailTemplates {
	public static final String FROM_EMERALDPAY = "EmeraldPay";
	public static final String FROM_BANK = "Emerald Bank";
	public static final String FROM_EMERAZON = "Emerazon";
	public static final String FROM_ENDER_EATS = "Ender Eats";
	public static final String FROM_CUBEOS = "CubeOS Team";
	public static final String FROM_ADMIN = "Server Admin";

	private MailTemplates() {
	}

	/** Adds the welcome mails to a brand-new account (oldest first, so the EmeraldPay welcome ends up on top). */
	static void addWelcomeMail(PlayerAccount account, String name, long time) {
		account.addMail("Prince Zombified of the Nether", "You won 1,000,000 emeralds!!! (not really)",
				"Dearest " + name + ",\n\n"
						+ "CONGRATULATIONS!!! You have been randomly selected to receive 1,000,000 EMERALDS from the "
						+ "Royal Treasury of the Nether Fortress.\n\n"
						+ "To claim your prize, simply drop your diamonds, your enchanted pickaxe and your bed into the "
						+ "nearest lava pool and wait for further instructions.\n\n"
						+ "Act now! This offer expires when the sun rises (or never, we're not sure how time works down here).\n\n"
						+ "Yours truly,\nA Very Real Prince\n\n"
						+ "P.S. This is spam. Please don't put anything in lava.",
				"", time);

		account.addMail(FROM_ENDER_EATS, "Hungry? Dinner teleports in under a minute",
				"Hi " + name + "!\n\n"
						+ "Ender Eats brings the best restaurants of the Overworld right to your door - or wherever you "
						+ "happen to be standing. Our Enderman couriers teleport your food in while it's still hot.\n\n"
						+ "- Pick a restaurant, fill your bag and check out with EmeraldPay\n"
						+ "- Track your courier live on the map\n"
						+ "- Add a tip: couriers love emeralds (and they remember who tipped)\n\n"
						+ "One tiny rule: please don't look your courier in the eye.\n\n"
						+ "Bon appetit!\nThe Ender Eats team",
				"endereats.mc", time);

		account.addMail(FROM_EMERAZON, "Welcome to Emerazon, " + name + "!",
				"Hello " + name + ",\n\n"
						+ "Your Emerazon account is ready. Clothes, hats, toys, paintings, decor, electronics and much "
						+ "more - all delivered as a real package right next to your CubeBook.\n\n"
						+ "Standard shipping is always free. In a hurry? Express delivery gets it to you in about "
						+ "15 seconds.\n\n"
						+ "Right-click the package when it arrives to unbox it. Confetti included at no extra cost.\n\n"
						+ "Happy shopping!\nEmerazon - from A to Zombie",
				"emerazon.mc", time);

		account.addMail(FROM_CUBEOS, "Getting started with your CubeBook",
				"Welcome to CubeOS, " + name + "!\n\n"
						+ "A few tips to get you going:\n"
						+ "- Right-click the laptop to boot it; sneak + right-click opens or closes the lid.\n"
						+ "- Your files and settings live on the laptop itself and stay on it when you pick it up.\n"
						+ "- Open the Browser and visit bloogle.mc to discover the web.\n"
						+ "- Change the wallpaper, theme and accent color in Settings.\n"
						+ "- Bored? There are games in the start menu.\n\n"
						+ "Have fun!\nThe CubeOS Team",
				"bloogle.mc", time);

		account.addMail(FROM_EMERALDPAY, "Welcome to EmeraldPay - here are " + AccountService.WELCOME_BONUS + " emeralds!",
				"Hi " + name + ",\n\n"
						+ "Your EmeraldPay wallet is open and we've added a welcome bonus of "
						+ AccountService.WELCOME_BONUS + " emeralds to get you started.\n\n"
						+ "Your wallet pays for everything on the web: Emerazon orders, Ender Eats deliveries and more.\n\n"
						+ "Need more? Visit Emerald Bank (emeraldbank.mc) to deposit real emeralds from your inventory "
						+ "(emerald blocks count as 9), or withdraw your balance back into your pockets at any time.\n\n"
						+ "Spend wisely!\nEmeraldPay",
				"emeraldbank.mc", time);
	}
}
