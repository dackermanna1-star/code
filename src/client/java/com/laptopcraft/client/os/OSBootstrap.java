package com.laptopcraft.client.os;

import com.laptopcraft.client.web.BuiltinSites;

/** Client init for CubeOS: registers the built-in apps and web sites. */
public final class OSBootstrap {
	private OSBootstrap() {
	}

	public static void init() {
		BuiltinApps.register();
		BuiltinSites.register();
	}
}
