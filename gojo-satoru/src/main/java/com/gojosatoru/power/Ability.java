package com.gojosatoru.power;

import org.jspecify.annotations.Nullable;

/** Every technique, with its cursed energy cost and cooldown in ticks. */
public enum Ability {
    TRANSFORM(0, 20),
    INFINITY(0, 10),
    BLUE(120, 30),
    RED(150, 24),
    PURPLE(450, 160),
    DOMAIN(700, 900),
    TELEPORT(40, 8);

    public final int cost;
    public final int cooldown;

    Ability(int cost, int cooldown) {
        this.cost = cost;
        this.cooldown = cooldown;
    }

    @Nullable
    public static Ability byId(int id) {
        Ability[] values = values();
        return id >= 0 && id < values.length ? values[id] : null;
    }
}
