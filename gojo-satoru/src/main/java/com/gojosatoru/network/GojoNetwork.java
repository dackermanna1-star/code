package com.gojosatoru.network;

import com.gojosatoru.GojoMod;
import java.util.List;
import net.fabricmc.fabric.api.networking.v1.PayloadTypeRegistry;
import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.world.phys.Vec3;

public final class GojoNetwork {
    private GojoNetwork() {
    }

    public static void init() {
        PayloadTypeRegistry.playC2S().register(AbilityPayload.TYPE, AbilityPayload.CODEC);
        PayloadTypeRegistry.playS2C().register(StatsPayload.TYPE, StatsPayload.CODEC);
        PayloadTypeRegistry.playS2C().register(EffectPayload.TYPE, EffectPayload.CODEC);
        PayloadTypeRegistry.playS2C().register(DomainPayload.TYPE, DomainPayload.CODEC);
    }

    /** Client asks to use an ability. {@code pressed} is false when a held key (Blue) is let go. */
    public record AbilityPayload(int ability, boolean pressed) implements CustomPacketPayload {
        public static final Type<AbilityPayload> TYPE = new Type<>(GojoMod.id("ability"));
        public static final StreamCodec<RegistryFriendlyByteBuf, AbilityPayload> CODEC = StreamCodec.composite(
                ByteBufCodecs.VAR_INT, AbilityPayload::ability,
                ByteBufCodecs.BOOL, AbilityPayload::pressed,
                AbilityPayload::new);

        @Override
        public Type<AbilityPayload> type() {
            return TYPE;
        }
    }

    /** Cursed energy and cooldowns for the HUD. Cooldowns are indexed by {@code Ability.ordinal()}. */
    public record StatsPayload(int energy, int maxEnergy, List<Integer> cooldowns, boolean inDomain) implements CustomPacketPayload {
        public static final Type<StatsPayload> TYPE = new Type<>(GojoMod.id("stats"));
        public static final StreamCodec<RegistryFriendlyByteBuf, StatsPayload> CODEC = StreamCodec.composite(
                ByteBufCodecs.VAR_INT, StatsPayload::energy,
                ByteBufCodecs.VAR_INT, StatsPayload::maxEnergy,
                ByteBufCodecs.VAR_INT.apply(ByteBufCodecs.list()), StatsPayload::cooldowns,
                ByteBufCodecs.BOOL, StatsPayload::inDomain,
                StatsPayload::new);

        @Override
        public Type<StatsPayload> type() {
            return TYPE;
        }
    }

    /** A one-shot visual effect. The client turns it into particles, flashes and camera shake. */
    public record EffectPayload(int effect, Vec3 pos, Vec3 dir, float scale) implements CustomPacketPayload {
        public static final Type<EffectPayload> TYPE = new Type<>(GojoMod.id("effect"));
        public static final StreamCodec<RegistryFriendlyByteBuf, EffectPayload> CODEC = StreamCodec.composite(
                ByteBufCodecs.VAR_INT, EffectPayload::effect,
                Vec3.STREAM_CODEC, EffectPayload::pos,
                Vec3.STREAM_CODEC, EffectPayload::dir,
                ByteBufCodecs.FLOAT, EffectPayload::scale,
                EffectPayload::new);

        @Override
        public Type<EffectPayload> type() {
            return TYPE;
        }
    }

    /** Tells clients where an Infinite Void is, so they can fill it with stars. */
    public record DomainPayload(int id, Vec3 center, float radius, int ticksLeft, boolean active) implements CustomPacketPayload {
        public static final Type<DomainPayload> TYPE = new Type<>(GojoMod.id("domain"));
        public static final StreamCodec<RegistryFriendlyByteBuf, DomainPayload> CODEC = StreamCodec.composite(
                ByteBufCodecs.VAR_INT, DomainPayload::id,
                Vec3.STREAM_CODEC, DomainPayload::center,
                ByteBufCodecs.FLOAT, DomainPayload::radius,
                ByteBufCodecs.VAR_INT, DomainPayload::ticksLeft,
                ByteBufCodecs.BOOL, DomainPayload::active,
                DomainPayload::new);

        @Override
        public Type<DomainPayload> type() {
            return TYPE;
        }
    }
}
