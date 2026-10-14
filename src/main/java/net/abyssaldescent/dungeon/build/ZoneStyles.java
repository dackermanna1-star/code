package net.abyssaldescent.dungeon.build;

import java.util.EnumMap;
import java.util.Map;
import net.abyssaldescent.dungeon.build.forgotten.ForgottenHallsStyle;
import net.abyssaldescent.dungeon.zone.Zone;

public final class ZoneStyles {
	private static final Map<Zone, ZoneStyle> STYLES = new EnumMap<>(Zone.class);

	static {
		ForgottenHallsStyle forgotten = new ForgottenHallsStyle();
		for (Zone zone : Zone.values()) {
			// Zones without their own style yet are never generated (they are sealed), but keep a valid fallback.
			STYLES.put(zone, forgotten);
		}
	}

	private ZoneStyles() {
	}

	public static ZoneStyle forZone(Zone zone) {
		return STYLES.get(zone);
	}
}
