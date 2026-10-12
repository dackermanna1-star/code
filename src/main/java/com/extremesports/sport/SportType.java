package com.extremesports.sport;

public enum SportType {
	SKATEBOARD("skateboard"),
	BMX("bmx"),
	SCOOTER("scooter"),
	SKATES("skates");

	private final String id;

	SportType(String id) {
		this.id = id;
	}

	public String id() {
		return id;
	}

	public String translationKey() {
		return "sport.extremesports." + id;
	}

	/** Riders stand sideways on skateboards; every other sport faces forward. */
	public boolean sidewaysStance() {
		return this == SKATEBOARD;
	}

	public static SportType byId(String id) {
		for (SportType type : values()) {
			if (type.id.equals(id)) {
				return type;
			}
		}
		return SKATEBOARD;
	}
}
