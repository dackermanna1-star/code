package com.gojosatoru.power;

/** Visual effects the server can ask clients to play. Order matters: it is the network id. */
public enum Fx {
    TRANSFORM,
    REVERT,
    INFINITY_BLOCK,
    BLUE_COLLAPSE,
    RED_FIRE,
    RED_IMPACT,
    PURPLE_MERGE,
    PURPLE_FIRE,
    PURPLE_END,
    TELEPORT_OUT,
    TELEPORT_IN,
    DOMAIN_OPEN,
    DOMAIN_CLOSE,
    OVERLOAD,
    CAST_NAME,
    HEAL;

    private static final Fx[] VALUES = values();

    public static Fx byId(int id) {
        return id >= 0 && id < VALUES.length ? VALUES[id] : TRANSFORM;
    }
}
