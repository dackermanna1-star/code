package com.gojosatoru.power;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import io.netty.buffer.ByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;

/**
 * Synced to every client so they can draw the right skin and effects.
 *
 * @param transformed the player is Gojo
 * @param infinity    Infinity is switched on
 * @param sixEyes     the blindfold is off (during Hollow Purple and Infinite Void); never saved
 */
public record GojoForm(boolean transformed, boolean infinity, boolean sixEyes) {
    public static final GojoForm NONE = new GojoForm(false, true, false);

    public static final Codec<GojoForm> CODEC = RecordCodecBuilder.create(i -> i.group(
            Codec.BOOL.fieldOf("transformed").forGetter(GojoForm::transformed),
            Codec.BOOL.optionalFieldOf("infinity", true).forGetter(GojoForm::infinity)
    ).apply(i, (transformed, infinity) -> new GojoForm(transformed, infinity, false)));

    public static final StreamCodec<ByteBuf, GojoForm> STREAM_CODEC = StreamCodec.composite(
            ByteBufCodecs.BOOL, GojoForm::transformed,
            ByteBufCodecs.BOOL, GojoForm::infinity,
            ByteBufCodecs.BOOL, GojoForm::sixEyes,
            GojoForm::new);

    public GojoForm withTransformed(boolean value) {
        return new GojoForm(value, this.infinity, value && this.sixEyes);
    }

    public GojoForm withInfinity(boolean value) {
        return new GojoForm(this.transformed, value, this.sixEyes);
    }

    public GojoForm withSixEyes(boolean value) {
        return new GojoForm(this.transformed, this.infinity, value);
    }
}
