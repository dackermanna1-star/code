package com.extremesports.server;

import com.extremesports.ExtremeSports;
import com.extremesports.entity.SportEquipmentEntity;
import com.extremesports.network.Payloads;
import com.extremesports.registry.ModCriteria;
import com.extremesports.sport.EquipmentKind;
import com.extremesports.sport.SportType;
import com.extremesports.trick.ComboEntry;
import com.extremesports.trick.ComboScorer;
import com.extremesports.trick.LandingQuality;
import com.extremesports.trick.TrickCategory;
import com.extremesports.trick.TrickDef;
import com.extremesports.trick.Tricks;
import java.util.List;
import net.fabricmc.fabric.api.networking.v1.PlayerLookup;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.util.Mth;
import net.minecraft.world.phys.Vec3;

/**
 * Validates combos reported by clients against server observations, scores them deterministically and
 * updates stats, challenges, unlocks and advancements.
 */
public final class ScoreService {
	private ScoreService() {
	}

	public static void handleCombo(ServerPlayer player, Payloads.Combo payload) {
		ServerRideTracker tracker = ServerRideTracker.get(player);
		long now = player.level().getGameTime();
		SportType sport = currentSport(player, tracker, now);
		List<ComboEntry> entries = payload.entries();
		if (sport == null || entries.isEmpty() || now - tracker.lastComboTick < 3) {
			reject(player, "no active ride or rate limited");
			return;
		}
		String problem = validate(entries, sport, tracker);
		tracker.lastComboTick = now;
		if (problem != null) {
			ExtremeSports.LOGGER.warn("Rejected combo from {}: {}", player.getPlainTextName(), problem);
			tracker.resetCounters();
			reject(player, problem);
			return;
		}
		PlayerSportData data = PlayerSportData.get(player);
		boolean landed = payload.landed();
		ComboScorer.Result result = ComboScorer.score(entries, tracker.history, data.preset().scoreMultiplier, landed);
		tracker.resetCounters();
		int total = landed ? result.total() : 0;

		if (landed) {
			recordStats(player, data, entries, result);
		}
		ChallengeManager.onCombo(player, entries, landed ? result : null);
		saveAndAnnounce(player, data);
		ServerPlayNetworking.send(player, new Payloads.ComboScored(total, result.multiplier(), result.basePoints(), landed, true));
	}

	private static void reject(ServerPlayer player, String reason) {
		ServerPlayNetworking.send(player, new Payloads.ComboScored(0, 1, 0, false, false));
	}

	static SportType currentSport(ServerPlayer player, ServerRideTracker tracker, long now) {
		if (player.getVehicle() instanceof SportEquipmentEntity entity) {
			return entity.sport();
		}
		return now - tracker.lastRideTick < 60 ? tracker.sport : null;
	}

	/** Returns a description of the problem, or null if the combo is plausible. */
	public static String validateForTest(List<ComboEntry> entries, SportType sport, ServerRideTracker tracker) {
		return validate(entries, sport, tracker);
	}

	static String validate(List<ComboEntry> entries, SportType sport, ServerRideTracker tracker) {
		if (entries.size() > 64) {
			return "too many entries";
		}
		float topSpeed = 0.0F;
		float spinRate = 0.0F;
		for (EquipmentKind kind : EquipmentKind.values()) {
			if (kind.sport() == sport) {
				topSpeed = Math.max(topSpeed, kind.handling().topSpeed());
				spinRate = Math.max(spinRate, kind.handling().spinRate());
			}
		}
		spinRate *= 1.25F * 1.25F;
		int claimedAir = 0;
		int airCount = 0;
		int claimedGrind = 0;
		int grindCount = 0;
		for (ComboEntry entry : entries) {
			if (entry.tricks().size() != entry.multiples().size()) {
				return "malformed entry";
			}
			for (int i = 0; i < entry.tricks().size(); i++) {
				TrickDef def = Tricks.byId(entry.tricks().get(i));
				if (def == null || def.sport() != sport) {
					return "unknown or wrong-sport trick " + entry.tricks().get(i);
				}
				boolean allowed = switch (entry.kind()) {
					case AIR -> def.category() == TrickCategory.OLLIE || def.category() == TrickCategory.FLIP
						|| def.category() == TrickCategory.WHIP || def.category() == TrickCategory.GRAB;
					case GRIND -> def.category() == TrickCategory.GRIND;
					case MANUAL -> def.category() == TrickCategory.MANUAL;
				};
				if (!allowed) {
					return "trick " + def.id() + " not allowed in " + entry.kind();
				}
			}
			switch (entry.kind()) {
				case AIR -> {
					claimedAir += entry.ticks();
					airCount++;
					if (entry.spin() % 180 != 0 || entry.spin() < 0 || entry.spin() > 1440) {
						return "bad spin";
					}
					if (entry.spin() > entry.ticks() * spinRate + 180) {
						return "spin too fast";
					}
					float minTicks = 0.0F;
					for (int i = 0; i < entry.tricks().size(); i++) {
						TrickDef def = Tricks.byId(entry.tricks().get(i));
						if (def != null && def.isAirTrick()) {
							minTicks += def.duration() / 1.25F * entry.multiples().get(i) * 0.6F;
						}
					}
					if (minTicks > entry.ticks() + 4) {
						return "tricks too fast for the air time";
					}
					if (entry.holdTicks() > entry.ticks() + 2) {
						return "grab longer than air";
					}
				}
				case GRIND -> {
					claimedGrind += entry.ticks();
					grindCount++;
					if (entry.distance() > entry.ticks() * topSpeed * 1.25F + 1.0F) {
						return "grind too fast";
					}
				}
				case MANUAL -> {
					if (entry.ticks() > tracker.ridingTicks + 20) {
						return "manual longer than ride";
					}
				}
			}
		}
		if (claimedAir > tracker.airTicks * 1.3F + 12 * airCount + 12) {
			return "air time not observed (" + claimedAir + " claimed, " + tracker.airTicks + " seen)";
		}
		if (claimedGrind > (tracker.grindTicks + tracker.airTicks) * 1.3F + 12 * grindCount + 12) {
			return "grind time not observed";
		}
		return null;
	}

	private static void recordStats(ServerPlayer player, PlayerSportData data, List<ComboEntry> entries, ComboScorer.Result result) {
		data.combosLanded++;
		data.totalScore += result.total();
		data.bestCombo = Math.max(data.bestCombo, result.total());
		data.bestTrick = Math.max(data.bestTrick, result.bestEntryPoints());
		int distinct = data.landedTricks.size();
		for (ComboEntry entry : entries) {
			for (String trick : entry.tricks()) {
				data.tricksLanded++;
				data.landedTricks.add(trick);
				ModCriteria.SPORT.trigger(player, "trick:" + trick, 1);
			}
			switch (entry.kind()) {
				case AIR -> {
					if (entry.quality() == LandingQuality.PERFECT) {
						data.perfectLandings++;
					}
					data.biggestSpin = Math.max(data.biggestSpin, entry.spin());
					ModCriteria.SPORT.trigger(player, "spin", entry.spin());
				}
				case GRIND -> {
					data.grindsLanded++;
					data.longestGrind = Math.max(data.longestGrind, entry.distance());
					ModCriteria.SPORT.trigger(player, "grind", Mth.floor(entry.distance()));
				}
				case MANUAL -> {
					data.longestManual = Math.max(data.longestManual, entry.ticks());
					ModCriteria.SPORT.trigger(player, "manual", entry.ticks());
				}
			}
		}
		ModCriteria.SPORT.trigger(player, "combo", result.total());
		ModCriteria.SPORT.trigger(player, "multiplier", result.multiplier());
		ModCriteria.SPORT.trigger(player, "perfect", data.perfectLandings);
		if (data.landedTricks.size() != distinct) {
			ModCriteria.SPORT.trigger(player, "variety", data.landedTricks.size());
		}
	}

	/** Saves data, unlocking anything newly earned and notifying the player. */
	public static void saveAndAnnounce(ServerPlayer player, PlayerSportData data) {
		ServerRideTracker tracker = ServerRideTracker.get(player);
		if (tracker.pendingDistance > 0.0) {
			data.distance += tracker.pendingDistance;
			tracker.pendingDistance = 0.0;
			ModCriteria.SPORT.trigger(player, "distance", Mth.floor(data.distance));
		}
		for (String unlock : Unlocks.refresh(data)) {
			ServerPlayNetworking.send(player, new Payloads.Unlocked(unlock));
		}
		ModCriteria.SPORT.trigger(player, "unlocks", data.unlocked.size());
		PlayerSportData.save(player, data);
	}

	public static void handleBail(ServerPlayer player, Payloads.Bail payload) {
		if (!(player.getVehicle() instanceof SportEquipmentEntity entity)) {
			return;
		}
		Vec3 velocity = new Vec3(Mth.clamp(payload.vx(), -1.2F, 1.2F), Mth.clamp(payload.vy(), -1.5F, 1.0F), Mth.clamp(payload.vz(), -1.2F, 1.2F));
		entity.bailDismount = true;
		player.stopRiding();
		entity.setDeltaMovement(velocity.scale(0.8));
		entity.ride.contact = com.extremesports.physics.RideController.Contact.AIR;
		PlayerSportData data = PlayerSportData.get(player);
		data.bails++;
		ModCriteria.SPORT.trigger(player, "bail", data.bails);
		saveAndAnnounce(player, data);
		Vec3 thrown = new Vec3(velocity.x * 0.7, Math.max(0.25, velocity.y * 0.3 + 0.25), velocity.z * 0.7);
		Payloads.BailAnim anim = new Payloads.BailAnim(player.getId(), payload.reason(), (float) thrown.x, (float) thrown.y, (float) thrown.z);
		ServerPlayNetworking.send(player, anim);
		for (ServerPlayer watcher : PlayerLookup.tracking(player)) {
			if (watcher != player) {
				ServerPlayNetworking.send(watcher, anim);
			}
		}
		ChallengeManager.onBail(player);
	}
}
