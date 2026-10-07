package com.laptopcraft.client.web;

import com.laptopcraft.client.web.sites.bank.EmeraldBankSite;
import com.laptopcraft.client.web.sites.blocktube.BlockTubeSite;
import com.laptopcraft.client.web.sites.bloogle.BloogleSite;
import com.laptopcraft.client.web.sites.emerazon.EmerazonSite;
import com.laptopcraft.client.web.sites.endereats.EnderEatsSite;
import com.laptopcraft.client.web.sites.weather.MineWeatherSite;

/** Registers every site of the in-game internet. */
public final class BuiltinSites {
	private BuiltinSites() {
	}

	/** Registers all built-in sites (called by {@code OSBootstrap}). */
	public static void register() {
		SiteRegistry.register(new BloogleSite());
		SiteRegistry.register(new EmerazonSite());
		SiteRegistry.register(new BlockTubeSite());
		SiteRegistry.register(new EnderEatsSite());
		SiteRegistry.register(new EmeraldBankSite());
		SiteRegistry.register(new MineWeatherSite());
	}
}
