package com.laptopcraft.client.os;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.jspecify.annotations.Nullable;

/** Registry of installed CubeOS apps (in registration order). */
public final class AppRegistry {
	private static final Map<String, AppInfo> APPS = new LinkedHashMap<>();

	private AppRegistry() {
	}

	/** Registers (or replaces) an app. */
	public static void register(AppInfo info) {
		APPS.put(info.id(), info);
	}

	public static @Nullable AppInfo get(String id) {
		return APPS.get(id);
	}

	/** All apps in registration order. */
	public static List<AppInfo> all() {
		return Collections.unmodifiableList(new ArrayList<>(APPS.values()));
	}

	/** Apps of one category. */
	public static List<AppInfo> byCategory(AppCategory category) {
		return APPS.values().stream().filter(a -> a.category() == category).toList();
	}
}
