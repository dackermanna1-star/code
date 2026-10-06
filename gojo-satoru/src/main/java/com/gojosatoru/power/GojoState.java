package com.gojosatoru.power;

import com.gojosatoru.entity.BlueOrbEntity;
import com.gojosatoru.entity.HollowPurpleEntity;
import java.util.HashMap;
import java.util.Map;
import net.minecraft.world.entity.projectile.Projectile;
import org.jspecify.annotations.Nullable;

/** Server-only runtime state for one player. Cursed energy refills on login, so none of this is saved. */
public final class GojoState {
    public static final float MAX_ENERGY = 1000.0F;

    public float energy = MAX_ENERGY;
    public final int[] cooldowns = new int[Ability.values().length];
    @Nullable
    public BlueOrbEntity blue;
    public boolean blueHeld;
    @Nullable
    public HollowPurpleEntity purple;
    /** Projectiles currently stopped by Infinity, keyed by entity id. */
    public final Map<Integer, Projectile> frozen = new HashMap<>();
    /** Ticks left before the blindfold goes back on. */
    public int sixEyesTicks;
    public boolean helpShown;
    public int lastInfinitySound;
    public int ticks;
}
