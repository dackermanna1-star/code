package net.abyssaldescent.item.relic;

/** Every relic effect. Relics are active from the hotbar or off-hand; at most a configured number apply at once. */
public enum RelicKind {
	/** +1 heart. */
	GRAVEDUST_LOCKET,
	/** Reveals false walls and traps nearby; immunity to blindness and darkness. */
	VIGIL_CANDLE,
	/** Kills may restore health; deal more damage when wounded. */
	CRACKED_PHYLACTERY,
	/** Bleeding you inflict lasts longer and bleeding foes take more damage from you. */
	BLOOD_SIGIL,
	/** Undead near you are slowed and deal less damage to you. */
	HOLLOW_CROWN
}
