package com.extremesports.client;

import com.extremesports.client.anim.BailAnimations;
import com.extremesports.client.camera.CameraEffects;
import com.extremesports.client.fx.RideFx;
import com.extremesports.entity.SportEquipmentEntity;
import com.extremesports.network.Payloads;
import com.extremesports.physics.GrindSegment;
import com.extremesports.physics.RideController;
import com.extremesports.physics.RideEvents;
import com.extremesports.registry.ModSounds;
import com.extremesports.trick.BailReason;
import com.extremesports.trick.ComboEntry;
import com.extremesports.trick.ComboScorer;
import com.extremesports.trick.LandingQuality;
import com.extremesports.trick.TrickDef;
import java.util.List;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.minecraft.client.Minecraft;
import net.minecraft.network.chat.Component;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.phys.Vec3;

/**
 * Reactions to the local rider's simulation: feedback (sound, particles, camera, HUD) and server reports
 * (finished combos and bails).
 */
public final class ClientRideEvents implements RideEvents {
	public static final ClientRideEvents INSTANCE = new ClientRideEvents();

	private ClientRideEvents() {
	}

	private static SportEquipmentEntity entity() {
		Minecraft mc = Minecraft.getInstance();
		return mc.player != null && mc.player.getVehicle() instanceof SportEquipmentEntity entity ? entity : null;
	}

	private static long now() {
		Minecraft mc = Minecraft.getInstance();
		return mc.level == null ? 0 : mc.level.getGameTime();
	}

	private static void ui(SoundEvent sound, float volume, float pitch) {
		Minecraft mc = Minecraft.getInstance();
		if (mc.player != null) {
			mc.player.level().playLocalSound(mc.player.getX(), mc.player.getY(), mc.player.getZ(), sound, SoundSource.PLAYERS, volume, pitch, false);
		}
	}

	@Override
	public void onPop(RideController ride, boolean nollie) {
		SportEquipmentEntity entity = entity();
		if (entity != null) {
			RideFx.pop(entity);
		}
	}

	@Override
	public void onPush(RideController ride) {
		SportEquipmentEntity entity = entity();
		if (entity != null) {
			RideFx.push(entity);
		}
	}

	@Override
	public void onTrickStart(RideController ride, TrickDef trick, int multiple) {
		SportEquipmentEntity entity = entity();
		if (entity != null) {
			RideFx.trick(entity, trick);
		}
		ClientSportsState.trickLabel = TrickNames.trick(trick.id(), multiple);
		ClientSportsState.trickTime = now();
	}

	@Override
	public void onGrabStart(RideController ride, TrickDef grab) {
		ClientSportsState.trickLabel = TrickNames.trick(grab.id(), 1);
		ClientSportsState.trickTime = now();
	}

	@Override
	public void onLand(RideController ride, LandingQuality quality, float impact, ComboEntry entry, boolean scored) {
		SportEquipmentEntity entity = entity();
		if (entity != null) {
			RideFx.land(entity, impact, quality);
		}
		CameraEffects.impulse(Math.min(1.0F, impact * 1.8F));
		if (!scored) {
			return;
		}
		ClientSportsState.landing = quality;
		ClientSportsState.landingTime = now();
		if (quality == LandingQuality.PERFECT) {
			ui(ModSounds.UI_PERFECT, 0.5F, 1.0F);
		}
		PracticeTips.onLand(ride, quality, entry);
	}

	@Override
	public void onBail(RideController ride, BailReason reason) {
		SportEquipmentEntity entity = entity();
		if (entity == null) {
			return;
		}
		Vec3 velocity = entity.getDeltaMovement();
		ClientPlayNetworking.send(new Payloads.Bail(reason.ordinal(), (float) velocity.x, (float) velocity.y, (float) velocity.z));
		RideFx.bail(entity);
		CameraEffects.impulse(1.0F);
		ClientSportsState.landing = LandingQuality.BAIL;
		ClientSportsState.landingTime = now();
		ClientSportsState.bail = reason;
		ClientSportsState.bailTime = now();
		ui(ModSounds.UI_FAIL, 0.5F, 1.0F);
		Minecraft mc = Minecraft.getInstance();
		if (mc.player != null) {
			BailAnimations.start(mc.player, entity.getYRot());
		}
		PracticeTips.onBail(reason);
	}

	@Override
	public void onGrindStart(RideController ride, TrickDef grind, GrindSegment segment) {
		ClientSportsState.trickLabel = TrickNames.trick(grind.id(), 1);
		ClientSportsState.trickTime = now();
	}

	@Override
	public void onManualStart(RideController ride, TrickDef manual) {
		ClientSportsState.trickLabel = TrickNames.trick(manual.id(), 1);
		ClientSportsState.trickTime = now();
	}

	@Override
	public void onComboUpdate(RideController ride, List<ComboEntry> entries) {
		ClientSportsState.combo = List.copyOf(entries);
		SportEquipmentEntity entity = entity();
		float preset = entity != null ? entity.preset().scoreMultiplier : 1.0F;
		ClientSportsState.comboPrediction = ComboScorer.score(entries, ClientSportsState.predictionHistory, preset, false);
	}

	@Override
	public void onComboEnd(RideController ride, List<ComboEntry> entries, boolean landed) {
		ClientPlayNetworking.send(new Payloads.Combo(List.copyOf(entries), landed));
		SportEquipmentEntity entity = entity();
		float preset = entity != null ? entity.preset().scoreMultiplier : 1.0F;
		ComboScorer.Result result = ComboScorer.score(entries, ClientSportsState.predictionHistory, preset, landed);
		ClientSportsState.finishedCombo = List.copyOf(entries);
		ClientSportsState.finishedLanded = landed;
		ClientSportsState.finishedScore = landed ? result.total() : 0;
		ClientSportsState.finishedMultiplier = result.multiplier();
		ClientSportsState.finishedTime = now();
		ClientSportsState.combo = List.of();
		if (landed && result.total() > 0) {
			ui(ModSounds.UI_TRICK, 0.45F, 1.0F + Math.min(0.4F, result.multiplier() * 0.04F));
		}
	}

	@Override
	public void onWallBonk(RideController ride, float impact) {
		SportEquipmentEntity entity = entity();
		if (entity != null) {
			RideFx.bonk(entity, impact);
		}
		CameraEffects.impulse(Math.min(0.6F, impact * 2.0F));
	}

	@Override
	public void onBrake(RideController ride, boolean powerslide) {
		SportEquipmentEntity entity = entity();
		if (entity != null) {
			RideFx.brake(entity, powerslide);
		}
	}

	public static Component bailText(BailReason reason) {
		return Component.translatable(reason.translationKey());
	}
}
