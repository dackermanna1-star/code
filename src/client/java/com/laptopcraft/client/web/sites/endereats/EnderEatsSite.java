package com.laptopcraft.client.web.sites.endereats;

import com.laptopcraft.client.web.PlaceholderSite;
import com.laptopcraft.client.web.WebPage;
import com.laptopcraft.client.web.WebUrl;
import java.util.List;

/** Ender Eats (endereats.mc) — food delivered by teleporting Enderman couriers. */
public class EnderEatsSite extends PlaceholderSite {
	public EnderEatsSite() {
		super("endereats.mc", "Ender Eats", "Hungry? Your food teleports to you in seconds.", "endereats", "endereats_logo", 0xFF2A1B3D,
				List.of("food", "eat", "delivery", "pizza", "burger", "sushi", "taco", "restaurant", "hungry", "uber", "dinner", "lunch"));
	}

	@Override
	public WebPage createPage(WebUrl url) {
		return new EnderEatsPage(this, url);
	}
}
