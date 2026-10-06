package com.laptopcraft.client.os;

import net.minecraft.resources.Identifier;

/**
 * Identifiers of the shared CubeOS icon textures ({@code laptopcraft:textures/gui/icons/<name>.png},
 * 32×32). Draw them with {@link com.laptopcraft.client.os.ui.Gfx#icon} (missing files get a letter tile).
 */
public final class Icons {
	public static final Identifier FOLDER = icon("folder");
	public static final Identifier FILE_TEXT = icon("file_text");
	public static final Identifier FILE_IMAGE = icon("file_image");
	public static final Identifier TRASH = icon("trash");
	public static final Identifier POWER = icon("power");
	public static final Identifier LOCK = icon("lock");
	public static final Identifier USER = icon("user");
	public static final Identifier SEARCH = icon("search");
	public static final Identifier CART = icon("cart");
	public static final Identifier WIFI = icon("wifi");
	public static final Identifier VOLUME = icon("volume");
	public static final Identifier BELL = icon("bell");
	public static final Identifier HOME = icon("home");
	public static final Identifier BACK = icon("back");
	public static final Identifier FORWARD = icon("forward");
	public static final Identifier RELOAD = icon("reload");
	public static final Identifier STAR = icon("star");
	public static final Identifier BOOKMARK = icon("bookmark");
	public static final Identifier INFO = icon("info");
	public static final Identifier ERROR = icon("error");
	public static final Identifier SUCCESS = icon("success");
	public static final Identifier WARNING = icon("warning");
	public static final Identifier PLAY = icon("play");
	public static final Identifier PAUSE = icon("pause");
	public static final Identifier MAIL = icon("mail");
	public static final Identifier SETTINGS = icon("settings");
	public static final Identifier BROWSER = icon("browser");

	/** CubeOS logo, 64×64. */
	public static final Identifier LOGO = Identifier.fromNamespaceAndPath("laptopcraft", "textures/gui/os/logo.png");

	private Icons() {
	}

	/** {@code laptopcraft:textures/gui/icons/<name>.png}. */
	public static Identifier icon(String name) {
		return Identifier.fromNamespaceAndPath("laptopcraft", "textures/gui/icons/" + name + ".png");
	}

	/** Icon of an app id (same path scheme). */
	public static Identifier app(String appId) {
		return icon(appId);
	}

	/**
	 * Icon for a notification icon key as used by {@code ModPayloads.Notify}: emerazon, ender_eats, bank,
	 * mail, info, error, success (also warning and any other icon name).
	 */
	public static Identifier notification(String key) {
		return switch (key) {
			case "ender_eats", "endereats" -> icon("endereats");
			case "emerazon" -> icon("emerazon");
			case "bank" -> icon("bank");
			case "mail" -> MAIL;
			case "error" -> ERROR;
			case "success" -> SUCCESS;
			case "warning" -> WARNING;
			case "info", "" -> INFO;
			default -> key.matches("[a-z0-9_]+") ? icon(key) : INFO;
		};
	}
}
