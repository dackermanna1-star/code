package com.extremesports.server;

import com.extremesports.registry.ModAttachments;
import com.extremesports.sport.PhysicsPreset;
import com.mojang.serialization.Codec;
import io.netty.buffer.ByteBuf;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.ListTag;
import net.minecraft.nbt.StringTag;
import net.minecraft.nbt.Tag;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.world.entity.player.Player;

/**
 * Per-player persistent sports data: settings, statistics, challenge records, landed tricks and unlocks.
 * Stored as a Fabric data attachment, copied on death and synced to the owning client.
 */
public final class PlayerSportData {
	public static final Codec<PlayerSportData> CODEC = CompoundTag.CODEC.xmap(PlayerSportData::fromTag, PlayerSportData::toTag);
	public static final StreamCodec<ByteBuf, PlayerSportData> STREAM_CODEC = ByteBufCodecs.COMPOUND_TAG.map(PlayerSportData::fromTag, PlayerSportData::toTag);

	private PhysicsPreset preset = PhysicsPreset.BALANCED;
	private boolean goofy;
	private boolean autoPickup = true;

	public int bestCombo;
	public long totalScore;
	public int combosLanded;
	public int tricksLanded;
	public int perfectLandings;
	public float longestGrind;
	public int longestManual;
	public double distance;
	public int bails;
	public int bestTrick;
	public int biggestSpin;
	public int grindsLanded;
	public final Map<String, Integer> challengeBest = new HashMap<>();
	public final Map<String, Integer> medals = new HashMap<>();
	public final Map<String, Integer> courseTimes = new HashMap<>();
	public final Set<String> landedTricks = new HashSet<>();
	public final Set<String> unlocked = new HashSet<>();

	public static PlayerSportData get(Player player) {
		PlayerSportData data = player.getAttached(ModAttachments.SPORT_DATA);
		return data == null ? new PlayerSportData() : data;
	}

	/** Stores a copy so the attachment system notices the change and syncs it to the client. */
	public static void save(Player player, PlayerSportData data) {
		player.setAttached(ModAttachments.SPORT_DATA, fromTag(data.toTag()));
	}

	public PhysicsPreset preset() {
		return preset;
	}

	public boolean goofy() {
		return goofy;
	}

	public boolean autoPickup() {
		return autoPickup;
	}

	public void setSettings(PhysicsPreset preset, boolean goofy, boolean autoPickup) {
		this.preset = preset;
		this.goofy = goofy;
		this.autoPickup = autoPickup;
	}

	public int medal(String challenge) {
		return medals.getOrDefault(challenge, 0);
	}

	public CompoundTag toTag() {
		CompoundTag tag = new CompoundTag();
		tag.putString("preset", preset.id());
		tag.putBoolean("goofy", goofy);
		tag.putBoolean("auto_pickup", autoPickup);
		tag.putInt("best_combo", bestCombo);
		tag.putLong("total_score", totalScore);
		tag.putInt("combos_landed", combosLanded);
		tag.putInt("tricks_landed", tricksLanded);
		tag.putInt("perfect_landings", perfectLandings);
		tag.putFloat("longest_grind", longestGrind);
		tag.putInt("longest_manual", longestManual);
		tag.putDouble("distance", distance);
		tag.putInt("bails", bails);
		tag.putInt("best_trick", bestTrick);
		tag.putInt("biggest_spin", biggestSpin);
		tag.putInt("grinds_landed", grindsLanded);
		tag.put("challenge_best", intMap(challengeBest));
		tag.put("medals", intMap(medals));
		tag.put("course_times", intMap(courseTimes));
		tag.put("landed_tricks", stringList(landedTricks));
		tag.put("unlocked", stringList(unlocked));
		return tag;
	}

	public static PlayerSportData fromTag(CompoundTag tag) {
		PlayerSportData data = new PlayerSportData();
		data.preset = PhysicsPreset.byId(tag.getStringOr("preset", "balanced"));
		data.goofy = tag.getBooleanOr("goofy", false);
		data.autoPickup = tag.getBooleanOr("auto_pickup", true);
		data.bestCombo = tag.getIntOr("best_combo", 0);
		data.totalScore = tag.getLongOr("total_score", 0L);
		data.combosLanded = tag.getIntOr("combos_landed", 0);
		data.tricksLanded = tag.getIntOr("tricks_landed", 0);
		data.perfectLandings = tag.getIntOr("perfect_landings", 0);
		data.longestGrind = tag.getFloatOr("longest_grind", 0.0F);
		data.longestManual = tag.getIntOr("longest_manual", 0);
		data.distance = tag.getDoubleOr("distance", 0.0);
		data.bails = tag.getIntOr("bails", 0);
		data.bestTrick = tag.getIntOr("best_trick", 0);
		data.biggestSpin = tag.getIntOr("biggest_spin", 0);
		data.grindsLanded = tag.getIntOr("grinds_landed", 0);
		readIntMap(tag.getCompoundOrEmpty("challenge_best"), data.challengeBest);
		readIntMap(tag.getCompoundOrEmpty("medals"), data.medals);
		readIntMap(tag.getCompoundOrEmpty("course_times"), data.courseTimes);
		readStrings(tag.getListOrEmpty("landed_tricks"), data.landedTricks);
		readStrings(tag.getListOrEmpty("unlocked"), data.unlocked);
		return data;
	}

	private static CompoundTag intMap(Map<String, Integer> map) {
		CompoundTag tag = new CompoundTag();
		map.forEach(tag::putInt);
		return tag;
	}

	private static void readIntMap(CompoundTag tag, Map<String, Integer> into) {
		for (String key : tag.keySet()) {
			into.put(key, tag.getIntOr(key, 0));
		}
	}

	private static ListTag stringList(Set<String> values) {
		ListTag list = new ListTag();
		for (String value : values) {
			list.add(StringTag.valueOf(value));
		}
		return list;
	}

	private static void readStrings(ListTag list, Set<String> into) {
		for (Tag tag : list) {
			tag.asString().ifPresent(into::add);
		}
	}
}
