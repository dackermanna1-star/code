package dev.portalgun.world.feature;

import dev.portalgun.PortalGunMod;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/** Features must never crash world generation; unexpected errors are logged once per feature type. */
public final class FeatureErrors {
	private static final Set<String> REPORTED = ConcurrentHashMap.newKeySet();

	private FeatureErrors() {
	}

	public static void report(String feature, RuntimeException e) {
		if (REPORTED.add(feature)) {
			PortalGunMod.LOGGER.error("Feature portalgun:{} failed (further errors are suppressed)", feature, e);
		}
	}
}
