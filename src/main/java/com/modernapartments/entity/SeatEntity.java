package com.modernapartments.entity;

import com.modernapartments.block.FurnitureBlock;
import com.modernapartments.registry.ModEntities;
import java.util.List;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.entity.vehicle.DismountHelper;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.material.PushReaction;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

/** Invisible vehicle that lets players sit on chairs, sofas, benches and toilets. */
public class SeatEntity extends Entity {
	public SeatEntity(EntityType<? extends SeatEntity> type, Level level) {
		super(type, level);
		this.noPhysics = true;
	}

	/** Seats the player on the furniture at {@code pos}; returns false if it is occupied. */
	public static boolean trySit(Level level, BlockPos pos, Player player, float seatHeight) {
		if (player.isPassenger() || player.isShiftKeyDown()) {
			return false;
		}
		List<SeatEntity> existing = level.getEntitiesOfClass(SeatEntity.class, new AABB(pos));
		for (SeatEntity seat : existing) {
			if (seat.isVehicle()) {
				return false;
			}
			seat.discard();
		}
		SeatEntity seat = ModEntities.SEAT.create(level, EntitySpawnReason.TRIGGERED);
		if (seat == null) {
			return false;
		}
		BlockState state = level.getBlockState(pos);
		float yaw = state.hasProperty(FurnitureBlock.FACING) ? state.getValue(FurnitureBlock.FACING).toYRot() : player.getYRot();
		seat.snapTo(pos.getX() + 0.5, pos.getY() + seatHeight, pos.getZ() + 0.5, yaw, 0);
		level.addFreshEntity(seat);
		if (!player.startRiding(seat)) {
			seat.discard();
			return false;
		}
		player.setYRot(yaw);
		player.setYHeadRot(yaw);
		return true;
	}

	@Override
	public void tick() {
		super.tick();
		if (!level().isClientSide()) {
			BlockState state = level().getBlockState(BlockPos.containing(getX(), getY() - 0.1, getZ()));
			if (!isVehicle() || state.isAir()) {
				discard();
			}
		}
	}

	@Override
	public Vec3 getDismountLocationForPassenger(LivingEntity passenger) {
		BlockPos base = BlockPos.containing(getX(), getY() - 0.1, getZ());
		Direction front = Direction.fromYRot(getYRot());
		Direction[] order = {front, front.getClockWise(), front.getCounterClockWise(), front.getOpposite()};
		for (Direction d : order) {
			for (int dy = 0; dy <= 1; dy++) {
				Vec3 spot = DismountHelper.findSafeDismountLocation(passenger.getType(), level(), base.relative(d).above(dy), true);
				if (spot != null) {
					return spot;
				}
			}
		}
		Vec3 above = DismountHelper.findSafeDismountLocation(passenger.getType(), level(), base.above(), true);
		return above != null ? above : super.getDismountLocationForPassenger(passenger);
	}

	@Override
	protected void defineSynchedData(net.minecraft.network.syncher.SynchedEntityData.Builder builder) {
	}

	@Override
	protected void readAdditionalSaveData(ValueInput input) {
	}

	@Override
	protected void addAdditionalSaveData(ValueOutput output) {
	}

	@Override
	public boolean hurtServer(ServerLevel level, DamageSource source, float amount) {
		return false;
	}

	@Override
	public PushReaction getPistonPushReaction() {
		return PushReaction.IGNORE;
	}

	@Override
	public boolean isPickable() {
		return false;
	}

	@Override
	protected boolean canAddPassenger(Entity passenger) {
		return getPassengers().isEmpty();
	}
}
