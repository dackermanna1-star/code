package com.laptopcraft.client.os;

import java.util.function.Supplier;
import net.minecraft.resources.Identifier;

/**
 * Static description of an app, registered with {@link AppRegistry#register(AppInfo)}.
 *
 * @param id             unique id, e.g. "notepad" (also the app-state key)
 * @param name           display name ("Notepad")
 * @param icon           32×32 icon texture, usually {@code Icons.app(id)}
 * @param factory        creates a fresh app instance per window
 * @param defaultWidth   initial window width (whole window incl. frame); clamped to the desktop
 * @param defaultHeight  initial window height
 * @param minWidth       minimum window width when resizing
 * @param minHeight      minimum window height
 * @param singleInstance true = launching again focuses the existing window
 * @param category       start-menu group
 */
public record AppInfo(String id, String name, Identifier icon, Supplier<App> factory, int defaultWidth, int defaultHeight,
		int minWidth, int minHeight, boolean singleInstance, AppCategory category) {
}
