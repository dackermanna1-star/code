package com.laptopcraft.client.web;

import com.laptopcraft.client.os.Icons;
import java.util.List;
import net.minecraft.resources.Identifier;

/**
 * Simple {@link Site} implementation with a "coming soon" page. The real site classes replace the
 * placeholders that extend this; it is also handy as a base for tiny sites.
 */
public class PlaceholderSite implements Site {
	private final String host;
	private final String name;
	private final String description;
	private final String iconName;
	private final String logoName;
	private final int themeColor;
	private final List<String> keywords;

	/**
	 * @param iconName favicon name in {@code textures/gui/icons/}
	 * @param logoName wordmark name in {@code textures/gui/sites/} (without .png)
	 */
	public PlaceholderSite(String host, String name, String description, String iconName, String logoName, int themeColor, List<String> keywords) {
		this.host = host;
		this.name = name;
		this.description = description;
		this.iconName = iconName;
		this.logoName = logoName;
		this.themeColor = themeColor;
		this.keywords = keywords;
	}

	@Override
	public String host() {
		return host;
	}

	@Override
	public String name() {
		return name;
	}

	@Override
	public String description() {
		return description;
	}

	@Override
	public Identifier favicon() {
		return Icons.icon(iconName);
	}

	@Override
	public int themeColor() {
		return themeColor;
	}

	/** Wordmark logo texture ({@code laptopcraft:textures/gui/sites/<logo>.png}). */
	public Identifier logo() {
		return Identifier.fromNamespaceAndPath("laptopcraft", "textures/gui/sites/" + logoName + ".png");
	}

	@Override
	public WebPage createPage(WebUrl url) {
		return new ComingSoonPage(this, url);
	}

	@Override
	public List<String> keywords() {
		return keywords;
	}
}
