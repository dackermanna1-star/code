package com.laptopcraft.client.web;

import java.util.List;
import net.minecraft.resources.Identifier;

/**
 * A web site of the in-game internet, registered with {@link SiteRegistry#register(Site)}.
 * The browser asks the site of a URL's host for a fresh {@link WebPage} on every navigation.
 */
public interface Site {
	/** e.g. "emerazon.mc". */
	String host();

	/** e.g. "Emerazon". */
	String name();

	/** One line, shown in Bloogle results. */
	String description();

	/** 32×32 favicon, usually {@code laptopcraft:textures/gui/icons/<site>.png}. */
	Identifier favicon();

	/** Brand color (ARGB) — used for the tab accent and loading bar. */
	int themeColor();

	/** Creates the page for {@code url} (any path of this host; show your own "not found" for unknown paths). */
	WebPage createPage(WebUrl url);

	/** Extra search keywords for Bloogle. */
	default List<String> keywords() {
		return List.of();
	}
}
