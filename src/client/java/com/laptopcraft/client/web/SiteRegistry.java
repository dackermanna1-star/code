package com.laptopcraft.client.web;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.jspecify.annotations.Nullable;

/** All sites of the in-game internet, by host. */
public final class SiteRegistry {
	private static final Map<String, Site> SITES = new LinkedHashMap<>();

	private SiteRegistry() {
	}

	/** Registers (or replaces) a site. */
	public static void register(Site site) {
		SITES.put(site.host().toLowerCase(Locale.ROOT), site);
	}

	public static @Nullable Site get(String host) {
		return host == null ? null : SITES.get(host.toLowerCase(Locale.ROOT));
	}

	/** All sites in registration order. */
	public static List<Site> all() {
		return Collections.unmodifiableList(new ArrayList<>(SITES.values()));
	}
}
