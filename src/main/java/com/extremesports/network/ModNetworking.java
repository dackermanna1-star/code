package com.extremesports.network;

import com.extremesports.entity.SportEquipmentEntity;
import com.extremesports.item.EquipmentItem;
import com.extremesports.registry.ModBlocks;
import com.extremesports.registry.ModDataComponents;
import com.extremesports.server.ChallengeManager;
import com.extremesports.server.PlayerSportData;
import com.extremesports.server.ScoreService;
import com.extremesports.server.Unlocks;
import com.extremesports.sport.EquipmentConfig;
import com.extremesports.sport.EquipmentKind;
import com.extremesports.sport.PartCatalog;
import com.extremesports.sport.PhysicsPreset;
import com.extremesports.trick.Tricks;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import net.fabricmc.fabric.api.networking.v1.PayloadTypeRegistry;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

public final class ModNetworking {
	private ModNetworking() {
	}

	public static void init() {
		PayloadTypeRegistry.playC2S().register(Payloads.RiderState.TYPE, Payloads.widen(Payloads.RiderState.CODEC));
		PayloadTypeRegistry.playC2S().register(Payloads.Combo.TYPE, Payloads.widen(Payloads.Combo.CODEC));
		PayloadTypeRegistry.playC2S().register(Payloads.Bail.TYPE, Payloads.widen(Payloads.Bail.CODEC));
		PayloadTypeRegistry.playC2S().register(Payloads.WorkshopApply.TYPE, Payloads.widen(Payloads.WorkshopApply.CODEC));
		PayloadTypeRegistry.playC2S().register(Payloads.Settings.TYPE, Payloads.widen(Payloads.Settings.CODEC));
		PayloadTypeRegistry.playC2S().register(Payloads.ChallengeAction.TYPE, Payloads.widen(Payloads.ChallengeAction.CODEC));
		PayloadTypeRegistry.playC2S().register(Payloads.Remount.TYPE, Payloads.widen(Payloads.Remount.CODEC));
		PayloadTypeRegistry.playS2C().register(Payloads.ComboScored.TYPE, Payloads.widen(Payloads.ComboScored.CODEC));
		PayloadTypeRegistry.playS2C().register(Payloads.BailAnim.TYPE, Payloads.widen(Payloads.BailAnim.CODEC));
		PayloadTypeRegistry.playS2C().register(Payloads.OpenWorkshop.TYPE, Payloads.widen(Payloads.OpenWorkshop.CODEC));
		PayloadTypeRegistry.playS2C().register(Payloads.ChallengeState.TYPE, Payloads.widen(Payloads.ChallengeState.CODEC));
		PayloadTypeRegistry.playS2C().register(Payloads.Unlocked.TYPE, Payloads.widen(Payloads.Unlocked.CODEC));

		ServerPlayNetworking.registerGlobalReceiver(Payloads.RiderState.TYPE, (payload, context) -> handleRiderState(context.player(), payload));
		ServerPlayNetworking.registerGlobalReceiver(Payloads.Combo.TYPE, (payload, context) -> ScoreService.handleCombo(context.player(), payload));
		ServerPlayNetworking.registerGlobalReceiver(Payloads.Bail.TYPE, (payload, context) -> ScoreService.handleBail(context.player(), payload));
		ServerPlayNetworking.registerGlobalReceiver(Payloads.WorkshopApply.TYPE, (payload, context) -> handleWorkshop(context.player(), payload));
		ServerPlayNetworking.registerGlobalReceiver(Payloads.Settings.TYPE, (payload, context) -> handleSettings(context.player(), payload));
		ServerPlayNetworking.registerGlobalReceiver(Payloads.ChallengeAction.TYPE, (payload, context) -> ChallengeManager.handleAction(context.player(), payload));
		ServerPlayNetworking.registerGlobalReceiver(Payloads.Remount.TYPE, (payload, context) -> handleRemount(context.player()));
	}

	private static void handleRiderState(ServerPlayer player, Payloads.RiderState payload) {
		if (!(player.getVehicle() instanceof SportEquipmentEntity entity) || entity.getId() != payload.entityId()) {
			return;
		}
		int trickIndex = (payload.trick() & 0xFFFF) - 1;
		if (trickIndex >= Tricks.all().size()) {
			return;
		}
		entity.applyAnimState(payload.flags(), payload.pack(), payload.trick(), payload.held(), payload.landing());
	}

	/** Workshop each player last opened; survival players must still be standing at it to apply changes. */
	private static final Map<UUID, BlockPos> OPEN_WORKSHOPS = new ConcurrentHashMap<>();

	public static void openedWorkshop(ServerPlayer player, BlockPos pos) {
		OPEN_WORKSHOPS.put(player.getUUID(), pos.immutable());
	}

	public static void forget(ServerPlayer player) {
		OPEN_WORKSHOPS.remove(player.getUUID());
	}

	private static boolean nearWorkshop(ServerPlayer player) {
		BlockPos pos = OPEN_WORKSHOPS.get(player.getUUID());
		return pos != null && player.level().getBlockState(pos).is(ModBlocks.SKATE_WORKSHOP)
			&& player.distanceToSqr(Vec3.atCenterOf(pos)) <= 8.0 * 8.0;
	}

	private static void handleWorkshop(ServerPlayer player, Payloads.WorkshopApply payload) {
		int slot = payload.slot();
		if (slot < 0 || slot >= player.getInventory().getContainerSize()) {
			return;
		}
		ItemStack stack = player.getInventory().getItem(slot);
		if (!(stack.getItem() instanceof EquipmentItem equipment)) {
			return;
		}
		EquipmentKind kind = equipment.kind();
		EquipmentConfig config = payload.config().sanitized(kind);
		PlayerSportData data = PlayerSportData.get(player);
		boolean creative = player.isCreative();
		if (!creative && !nearWorkshop(player)) {
			player.displayClientMessage(Component.translatable("screen.extremesports.need_workshop"), true);
			return;
		}
		// Refuse locked parts
		for (var entry : PartCatalog.slots(kind.sport()).entrySet()) {
			PartCatalog.Option option = entry.getValue().option(config.part(kind.sport(), entry.getKey()));
			if (!Unlocks.isUnlocked(data, option.unlock(), creative)) {
				player.displayClientMessage(Component.translatable("message.extremesports.part_locked"), true);
				return;
			}
		}
		stack.set(ModDataComponents.EQUIPMENT_CONFIG, config);
		player.getInventory().setChanged();
	}

	private static void handleSettings(ServerPlayer player, Payloads.Settings payload) {
		PlayerSportData data = PlayerSportData.get(player);
		data.setSettings(PhysicsPreset.byId(payload.preset()), payload.goofy(), payload.autoPickup());
		PlayerSportData.save(player, data);
		if (player.getVehicle() instanceof SportEquipmentEntity entity) {
			entity.setPreset(data.preset());
			entity.setGoofy(data.goofy());
		}
	}

	private static void handleRemount(ServerPlayer player) {
		if (player.isPassenger() || player.isSpectator()) {
			return;
		}
		AABB area = player.getBoundingBox().inflate(24.0);
		List<SportEquipmentEntity> nearby = player.level().getEntitiesOfClass(SportEquipmentEntity.class, area,
			entity -> !entity.isVehicle() && (entity.owner() == null || entity.owner().equals(player.getUUID())));
		SportEquipmentEntity best = null;
		double bestDistance = Double.MAX_VALUE;
		for (SportEquipmentEntity entity : nearby) {
			double distance = entity.distanceToSqr(player);
			if (distance < bestDistance) {
				bestDistance = distance;
				best = entity;
			}
		}
		if (best == null) {
			player.displayClientMessage(Component.translatable("message.extremesports.no_equipment_nearby"), true);
			return;
		}
		best.setDeltaMovement(net.minecraft.world.phys.Vec3.ZERO);
		best.ride.contact = com.extremesports.physics.RideController.Contact.AIR;
		best.snapTo(player.getX(), player.getY(), player.getZ(), player.getYRot(), 0.0F);
		Entity vehicle = best;
		player.startRiding(vehicle);
	}
}
