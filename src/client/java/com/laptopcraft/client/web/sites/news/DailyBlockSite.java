package com.laptopcraft.client.web.sites.news;

import com.laptopcraft.client.web.PlaceholderSite;
import java.util.List;

/** Placeholder for The Daily Block (dailyblock.mc) — replaced by the real site implementation. */
public class DailyBlockSite extends PlaceholderSite {
	public DailyBlockSite() {
		super("dailyblock.mc", "The Daily Block", "All the news that's fit to mine.", "news", "dailyblock_logo", 0xFF1F2328, List.of("news", "newspaper", "headlines", "stats"));
	}
}
