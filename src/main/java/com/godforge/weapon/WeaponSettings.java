package com.godforge.weapon;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import io.netty.buffer.ByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;

/**
 * Per-item weapon parameters stored in the {@code godforge:settings} data component.
 * The meaning of each generic slot depends on the weapon (see {@link WeaponType#settings()}).
 */
public record WeaponSettings(int mode, int power, int width, int range, int color, int intensity, int size, int flags) {
	public static final int FLAG_NO_TERRAIN = 1;

	public static final WeaponSettings EMPTY = new WeaponSettings(0, 5, 2, 128, 0, 100, 100, 0);

	public static final Codec<WeaponSettings> CODEC = RecordCodecBuilder.create(
		instance -> instance.group(
				Codec.INT.optionalFieldOf("mode", 0).forGetter(WeaponSettings::mode),
				Codec.INT.optionalFieldOf("power", 5).forGetter(WeaponSettings::power),
				Codec.INT.optionalFieldOf("width", 2).forGetter(WeaponSettings::width),
				Codec.INT.optionalFieldOf("range", 128).forGetter(WeaponSettings::range),
				Codec.INT.optionalFieldOf("color", 0).forGetter(WeaponSettings::color),
				Codec.INT.optionalFieldOf("intensity", 100).forGetter(WeaponSettings::intensity),
				Codec.INT.optionalFieldOf("size", 100).forGetter(WeaponSettings::size),
				Codec.INT.optionalFieldOf("flags", 0).forGetter(WeaponSettings::flags)
			)
			.apply(instance, WeaponSettings::new)
	);

	public static final StreamCodec<ByteBuf, WeaponSettings> STREAM_CODEC = StreamCodec.composite(
		ByteBufCodecs.VAR_INT, WeaponSettings::mode,
		ByteBufCodecs.VAR_INT, WeaponSettings::power,
		ByteBufCodecs.VAR_INT, WeaponSettings::width,
		ByteBufCodecs.VAR_INT, WeaponSettings::range,
		ByteBufCodecs.VAR_INT, WeaponSettings::color,
		ByteBufCodecs.VAR_INT, WeaponSettings::intensity,
		ByteBufCodecs.VAR_INT, WeaponSettings::size,
		ByteBufCodecs.VAR_INT, WeaponSettings::flags,
		WeaponSettings::new
	);

	public enum Field {
		MODE,
		POWER,
		WIDTH,
		RANGE,
		COLOR,
		INTENSITY,
		SIZE,
		NO_TERRAIN
	}

	public int get(Field field) {
		return switch (field) {
			case MODE -> this.mode;
			case POWER -> this.power;
			case WIDTH -> this.width;
			case RANGE -> this.range;
			case COLOR -> this.color;
			case INTENSITY -> this.intensity;
			case SIZE -> this.size;
			case NO_TERRAIN -> (this.flags & FLAG_NO_TERRAIN) != 0 ? 1 : 0;
		};
	}

	public WeaponSettings with(Field field, int value) {
		return switch (field) {
			case MODE -> new WeaponSettings(value, this.power, this.width, this.range, this.color, this.intensity, this.size, this.flags);
			case POWER -> new WeaponSettings(this.mode, value, this.width, this.range, this.color, this.intensity, this.size, this.flags);
			case WIDTH -> new WeaponSettings(this.mode, this.power, value, this.range, this.color, this.intensity, this.size, this.flags);
			case RANGE -> new WeaponSettings(this.mode, this.power, this.width, value, this.color, this.intensity, this.size, this.flags);
			case COLOR -> new WeaponSettings(this.mode, this.power, this.width, this.range, value, this.intensity, this.size, this.flags);
			case INTENSITY -> new WeaponSettings(this.mode, this.power, this.width, this.range, this.color, value, this.size, this.flags);
			case SIZE -> new WeaponSettings(this.mode, this.power, this.width, this.range, this.color, this.intensity, value, this.flags);
			case NO_TERRAIN -> new WeaponSettings(
				this.mode, this.power, this.width, this.range, this.color, this.intensity, this.size,
				value != 0 ? this.flags | FLAG_NO_TERRAIN : this.flags & ~FLAG_NO_TERRAIN
			);
		};
	}

	public boolean terrainDisabled() {
		return (this.flags & FLAG_NO_TERRAIN) != 0;
	}

	/** Fraction helpers for percentage-style slots. */
	public float intensityFraction() {
		return this.intensity / 100.0F;
	}

	public float sizeFraction() {
		return this.size / 100.0F;
	}
}
