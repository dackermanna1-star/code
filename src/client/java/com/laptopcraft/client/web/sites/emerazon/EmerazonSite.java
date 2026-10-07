package com.laptopcraft.client.web.sites.emerazon;

import com.laptopcraft.client.web.PlaceholderSite;
import com.laptopcraft.client.web.WebPage;
import com.laptopcraft.client.web.WebUrl;
import java.util.List;

/** Emerazon (emerazon.mc) — the everything store. */
public class EmerazonSite extends PlaceholderSite {
	public EmerazonSite() {
		super("emerazon.mc", "Emerazon", "Everything from A to Zombie, delivered to your door.", "emerazon", "emerazon_logo", 0xFF232F3E,
				List.of("shop", "shopping", "buy", "clothes", "hats", "toys", "paintings", "decor", "delivery", "store", "amazon"));
	}

	@Override
	public WebPage createPage(WebUrl url) {
		return new EmerazonPage(this, url);
	}
}
