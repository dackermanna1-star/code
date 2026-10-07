package com.laptopcraft.block.decor;

import com.laptopcraft.content.DecorContent;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityDimensions;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.entity.vehicle.DismountHelper;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

/**
 * Invisible, tiny vehicle that lets a player sit on a {@link SeatBlock} (gaming chair, bean bags). It removes itself as
 * soon as nobody sits on it or the furniture is gone.
 */
public class SeatEntity extends Entity {
	public SeatEntity(EntityType<? extends SeatEntity> type, Level level) {
		super(type, level);
		this.noPhysics = true;
	}

	/** Seats {@code player} on the furniture at {@code pos} (server side). Returns false if someone already sits there. */
	public static boolean sit(Level level, BlockPos pos, Player player, double seatHeight) {
		if (player.isPassenger() || player.isShiftKeyDown()) {
			return false;
		}
		if (!level.getEntitiesOfClass(SeatEntity.class, new AABB(pos)).isEmpty()) {
			return false;
		}
		SeatEntity seat = new SeatEntity(DecorContent.SEAT, level);
		seat.setPos(pos.getX() + 0.5, pos.getY() + seatHeight, pos.getZ() + 0.5);
		level.addFreshEntity(seat);
		return player.startRiding(seat);
	}

	@Override
	public void tick() {
		super.tick();
		if (this.level() instanceof ServerLevel && (this.getPassengers().isEmpty() || !(seatState().getBlock() instanceof SeatBlock))) {
			this.discard();
		}
	}

	private BlockState seatState() {
		return this.level().getBlockState(this.blockPosition());
	}

	@Override
	protected Vec3 getPassengerAttachmentPoint(Entity passenger, EntityDimensions dimensions, float partialTick) {
		return Vec3.ZERO;
	}

	@Override
	public Vec3 getDismountLocationForPassenger(LivingEntity passenger) {
		BlockPos pos = this.blockPosition();
		BlockState state = seatState();
		Direction front = state.hasProperty(FacingDecorBlock.FACING) ? state.getValue(FacingDecorBlock.FACING) : Direction.NORTH;
		for (Direction dir : new Direction[]{front, front.getClockWise(), front.getCounterClockWise(), front.getOpposite()}) {
			Vec3 spot = DismountHelper.findSafeDismountLocation(passenger.getType(), this.level(), pos.relative(dir), true);
			if (spot != null) {
				return spot;
			}
		}
		return new Vec3(this.getX(), pos.getY() + 1.0, this.getZ());
	}

	@Override
	protected void defineSynchedData(SynchedEntityData.Builder builder) {
	}

	@Override
	protected void readAdditionalSaveData(ValueInput input) {
	}

	@Override
	protected void addAdditionalSaveData(ValueOutput output) {
	}

	@Override
	public boolean hurtServer(ServerLevel level, DamageSource damageSource, float amount) {
		return false;
	}
}
