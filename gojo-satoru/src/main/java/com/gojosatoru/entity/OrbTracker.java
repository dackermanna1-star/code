package com.gojosatoru.entity;

import java.util.Collections;
import java.util.Iterator;
import java.util.Set;
import java.util.WeakHashMap;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.minecraft.server.level.ServerLevel;

/**
 * An orb that flies past the simulation distance stops ticking and would hang in the air forever,
 * so the tracker removes any orb whose position is no longer entity-ticking.
 */
public final class OrbTracker {
    private static final Set<CursedOrbEntity> ORBS = Collections.newSetFromMap(new WeakHashMap<>());

    private OrbTracker() {
    }

    public static void init() {
        ServerTickEvents.END_SERVER_TICK.register(server -> {
            Iterator<CursedOrbEntity> it = ORBS.iterator();
            while (it.hasNext()) {
                CursedOrbEntity orb = it.next();
                if (orb.isRemoved()) {
                    it.remove();
                } else if (orb.level() instanceof ServerLevel level && !level.isPositionEntityTicking(orb.blockPosition())) {
                    orb.discard();
                    it.remove();
                }
            }
        });
    }

    static void track(CursedOrbEntity orb) {
        ORBS.add(orb);
    }
}
