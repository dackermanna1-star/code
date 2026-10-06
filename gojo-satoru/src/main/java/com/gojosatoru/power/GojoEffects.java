package com.gojosatoru.power;

import com.gojosatoru.network.GojoNetwork.EffectPayload;
import net.fabricmc.fabric.api.networking.v1.PlayerLookup;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.minecraft.core.Holder;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.phys.Vec3;

/** Server-side helpers for sounds and client effects. */
public final class GojoEffects {
    private GojoEffects() {
    }

    public static void send(ServerLevel level, Fx fx, Vec3 pos, Vec3 dir, float scale, double range) {
        EffectPayload payload = new EffectPayload(fx.ordinal(), pos, dir, scale);
        for (ServerPlayer player : PlayerLookup.around(level, pos, range)) {
            ServerPlayNetworking.send(player, payload);
        }
    }

    public static void send(ServerLevel level, Fx fx, Vec3 pos, float scale) {
        send(level, fx, pos, Vec3.ZERO, scale, 96.0);
    }

    /** Shows the technique's name on the caster's screen. */
    public static void castName(ServerPlayer player, Ability ability) {
        ServerPlayNetworking.send(player, new EffectPayload(Fx.CAST_NAME.ordinal(), player.position(), Vec3.ZERO, ability.ordinal()));
    }

    public static void sound(ServerLevel level, Vec3 pos, SoundEvent sound, float volume, float pitch) {
        level.playSound(null, pos.x, pos.y, pos.z, sound, SoundSource.PLAYERS, volume, pitch);
    }

    public static void sound(ServerLevel level, Vec3 pos, Holder<SoundEvent> sound, float volume, float pitch) {
        level.playSound(null, pos.x, pos.y, pos.z, sound, SoundSource.PLAYERS, volume, pitch);
    }
}
