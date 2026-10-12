package com.chaosunleashed.core;

/** Lifecycle of every event: WARNING -> ACTIVE -> AFTERMATH -> END. */
public enum EventPhase {
	WARNING("Warning"),
	ACTIVE("Active"),
	AFTERMATH("Aftermath"),
	END("Ended");

	private final String label;

	EventPhase(String label) {
		this.label = label;
	}

	public String label() {
		return this.label;
	}

	public static EventPhase byOrdinal(int ordinal) {
		EventPhase[] values = values();
		return ordinal >= 0 && ordinal < values.length ? values[ordinal] : END;
	}
}
