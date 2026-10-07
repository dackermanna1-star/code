package com.laptopcraft.client.os;

/** Start-menu groups. */
public enum AppCategory {
	SYSTEM("System"),
	PRODUCTIVITY("Productivity"),
	INTERNET("Internet"),
	GAMES("Games"),
	MEDIA("Media");

	private final String displayName;

	AppCategory(String displayName) {
		this.displayName = displayName;
	}

	/** Human readable name ("System", "Games"...). */
	public String displayName() {
		return displayName;
	}
}
