package com.laptopcraft.client.os;

import net.minecraft.resources.Identifier;
import org.jspecify.annotations.Nullable;

/**
 * One entry of a {@link ContextMenu}. Build with the static factories and the {@code with...} helpers:
 *
 * <pre>{@code
 * List.of(
 *     MenuItem.of("Open", this::open),
 *     MenuItem.of("Rename…", Icons.FILE_TEXT, this::rename).shortcut("F2"),
 *     MenuItem.separator(),
 *     MenuItem.of("Delete", Icons.TRASH, this::delete).danger(),
 *     MenuItem.of("Paste", this::paste).enabled(clipboardHasFile))
 * }</pre>
 *
 * @param label    text
 * @param icon     optional 16px icon
 * @param action   run when chosen (menu closes first)
 * @param enabled  disabled items are dimmed and not clickable
 * @param divider  true = a thin separator line (other fields ignored); create with {@link #separator()}
 * @param shortcut optional right-aligned hint ("Ctrl+S")
 * @param destructive red label (destructive actions); set with {@link #danger()}
 * @param checked  draws a check mark in front of the label
 */
public record MenuItem(String label, @Nullable Identifier icon, @Nullable Runnable action, boolean enabled, boolean divider,
		@Nullable String shortcut, boolean destructive, boolean checked) {
	private static final MenuItem SEPARATOR = new MenuItem("", null, null, false, true, null, false, false);

	public static MenuItem of(String label, Runnable action) {
		return new MenuItem(label, null, action, true, false, null, false, false);
	}

	public static MenuItem of(String label, @Nullable Identifier icon, Runnable action) {
		return new MenuItem(label, icon, action, true, false, null, false, false);
	}

	public static MenuItem separator() {
		return SEPARATOR;
	}

	/** Non-clickable, dimmed item (e.g. a header or unavailable action). */
	public static MenuItem disabled(String label) {
		return new MenuItem(label, null, null, false, false, null, false, false);
	}

	public MenuItem enabled(boolean on) {
		return new MenuItem(label, icon, action, on, divider, shortcut, destructive, checked);
	}

	public MenuItem shortcut(String hint) {
		return new MenuItem(label, icon, action, enabled, divider, hint, destructive, checked);
	}

	public MenuItem danger() {
		return new MenuItem(label, icon, action, enabled, divider, shortcut, true, checked);
	}

	public MenuItem checked(boolean on) {
		return new MenuItem(label, icon, action, enabled, divider, shortcut, destructive, on);
	}

	public MenuItem icon(@Nullable Identifier newIcon) {
		return new MenuItem(label, newIcon, action, enabled, divider, shortcut, destructive, checked);
	}
}
