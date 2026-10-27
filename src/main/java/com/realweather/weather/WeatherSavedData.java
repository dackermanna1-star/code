package com.realweather.weather;

import com.mojang.serialization.Codec;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.world.level.saveddata.SavedData;
import net.minecraft.world.level.saveddata.SavedDataType;

/**
 * Persists the weather simulation with the overworld's data storage ({@code data/realweather.dat}).
 */
public final class WeatherSavedData extends SavedData {
	public static final Codec<WeatherSavedData> CODEC = CompoundTag.CODEC.xmap(WeatherSavedData::fromTag, WeatherSavedData::toTag);
	// Fabric API accepts a null DataFixTypes for mod data that needs no vanilla data fixing.
	@SuppressWarnings("DataFlowIssue")
	public static final SavedDataType<WeatherSavedData> TYPE = new SavedDataType<>("realweather", WeatherSavedData::new, CODEC, null);

	private final WeatherState state = new WeatherState();
	private boolean fresh = true;

	public WeatherState state() {
		return this.state;
	}

	/** True when no saved state existed and the simulator should seed it from the vanilla weather. */
	public boolean isFresh() {
		return this.fresh;
	}

	public void markInitialized() {
		this.fresh = false;
		this.setDirty();
	}

	private static WeatherSavedData fromTag(CompoundTag tag) {
		WeatherSavedData data = new WeatherSavedData();
		data.state.load(tag);
		data.fresh = false;
		return data;
	}

	private CompoundTag toTag() {
		return this.state.save(new CompoundTag());
	}
}
