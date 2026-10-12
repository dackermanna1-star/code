package com.extremesports.entity;

import com.extremesports.physics.RideController;
import com.extremesports.physics.RideInput;
import com.extremesports.registry.ModDataComponents;
import com.extremesports.registry.ModItems;
import com.extremesports.server.PlayerSportData;
import com.extremesports.server.ServerRideTracker;
import com.extremesports.sport.EquipmentConfig;
import com.extremesports.sport.EquipmentKind;
import com.extremesports.sport.EquipmentStats;
import com.extremesports.sport.PhysicsPreset;
import com.extremesports.sport.SportType;
import java.util.UUID;
import java.util.function.Consumer;
import java.util.function.Function;
import net.minecraft.core.UUIDUtil;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.Mth;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.InterpolationHandler;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import org.jspecify.annotations.Nullable;

/**
 * A rideable piece of sports equipment. While ridden, the rider's client simulates it (like vanilla boats)
 * and the server validates movement and scoring; when empty the server lets it roll to a stop.
 */
public class SportEquipmentEntity extends Entity {
	// Animation flag bits synced from the rider's client
	public static final int FLAG_CROUCH = 1;
	public static final int FLAG_PUSHING = 1 << 1;
	public static final int FLAG_BRAKING = 1 << 2;
	public static final int FLAG_POWERSLIDE = 1 << 3;
	public static final int FLAG_GRINDING = 1 << 4;
	public static final int FLAG_MANUAL = 1 << 5;
	public static final int FLAG_AIRBORNE = 1 << 6;
	public static final int FLAG_FAKIE = 1 << 7;
	public static final int FLAG_PEDALING = 1 << 8;
	public static final int FLAG_BACKWARD = 1 << 9;
	public static final int FLAG_STRIDE_SIDE = 1 << 10;
	public static final int FLAG_CHARGING = 1 << 11;

	/** The equipment item this entity was placed from; carries the kind, customization and custom name. */
	private static final EntityDataAccessor<ItemStack> DATA_ITEM = SynchedEntityData.defineId(SportEquipmentEntity.class, EntityDataSerializers.ITEM_STACK);
	private static final EntityDataAccessor<Byte> DATA_PRESET = SynchedEntityData.defineId(SportEquipmentEntity.class, EntityDataSerializers.BYTE);
	private static final EntityDataAccessor<Boolean> DATA_GOOFY = SynchedEntityData.defineId(SportEquipmentEntity.class, EntityDataSerializers.BOOLEAN);
	private static final EntityDataAccessor<Integer> DATA_ANIM_FLAGS = SynchedEntityData.defineId(SportEquipmentEntity.class, EntityDataSerializers.INT);
	/** Packed bytes: lean, balance, crouch, stroke phase. */
	private static final EntityDataAccessor<Integer> DATA_ANIM_PACK = SynchedEntityData.defineId(SportEquipmentEntity.class, EntityDataSerializers.INT);
	/** Low 16 bits: trick index + 1; high bits: trick sequence (detects re-triggers). */
	private static final EntityDataAccessor<Integer> DATA_TRICK = SynchedEntityData.defineId(SportEquipmentEntity.class, EntityDataSerializers.INT);
	/** Low 12 bits: grab index + 1, next 12 bits: grind/manual index + 1, top bits: trick multiple. */
	private static final EntityDataAccessor<Integer> DATA_HELD = SynchedEntityData.defineId(SportEquipmentEntity.class, EntityDataSerializers.INT);
	/** Landing event: sequence << 4 | quality ordinal. */
	private static final EntityDataAccessor<Integer> DATA_LANDING = SynchedEntityData.defineId(SportEquipmentEntity.class, EntityDataSerializers.INT);

	/** Client hook supplying the local rider's input (set by the client initializer). */
	public static Function<SportEquipmentEntity, RideInput> clientInput = entity -> RideInput.NONE;
	/** Client hook called after each simulated tick so the client can sync animation state and attach events. */
	public static Consumer<SportEquipmentEntity> clientAfterTick = entity -> {
	};

	public final RideController ride = new RideController(this);
	private final InterpolationHandler interpolation = new InterpolationHandler(this, 3);
	private @Nullable EquipmentConfig cachedConfig;
	private @Nullable EquipmentStats cachedStats;
	private @Nullable UUID owner;
	/** Set before a forced dismount so {@link #removePassenger} knows not to auto-pickup. */
	public boolean bailDismount;
	/** Test hook: drives the simulation server-side with a fixed input. */
	public @Nullable RideInput testInput;
	public boolean testRiderPresent;

	// Client-side bookkeeping for animation (holds a client-only RideAnimState)
	public @Nullable Object clientAnim;
	public int mountedAtTick = -100;
	public float clientWheelAngle;
	public float clientWheelAngleO;
	private Vec3 lastTickPos = Vec3.ZERO;
	public float observedSpeed;
	public int clientLandingSeq = -1;
	public int clientTrickSeq = -1;
	public int clientTrickStartTick;
	public int clientLandingTick = -100;

	public SportEquipmentEntity(EntityType<? extends SportEquipmentEntity> type, Level level) {
		super(type, level);
		this.blocksBuilding = false;
	}

	// ------------------------------------------------------------------ data

	@Override
	protected void defineSynchedData(SynchedEntityData.Builder builder) {
		builder.define(DATA_ITEM, ItemStack.EMPTY);
		builder.define(DATA_PRESET, (byte) PhysicsPreset.BALANCED.ordinal());
		builder.define(DATA_GOOFY, false);
		builder.define(DATA_ANIM_FLAGS, 0);
		builder.define(DATA_ANIM_PACK, 0);
		builder.define(DATA_TRICK, 0);
		builder.define(DATA_HELD, 0);
		builder.define(DATA_LANDING, 0);
	}

	@Override
	public void onSyncedDataUpdated(EntityDataAccessor<?> accessor) {
		super.onSyncedDataUpdated(accessor);
		if (DATA_ITEM.equals(accessor)) {
			cachedConfig = null;
			cachedStats = null;
		}
	}

	public EquipmentKind kind() {
		ItemStack stack = entityData.get(DATA_ITEM);
		return stack.getItem() instanceof com.extremesports.item.EquipmentItem equipment ? equipment.kind() : EquipmentKind.STREET_BOARD;
	}

	public SportType sport() {
		return kind().sport();
	}

	public EquipmentConfig config() {
		if (cachedConfig == null) {
			cachedConfig = com.extremesports.item.EquipmentItem.config(entityData.get(DATA_ITEM));
		}
		return cachedConfig;
	}

	/** Sets the source item (copied, count 1); kind and customization follow from it. */
	public void setItem(ItemStack stack) {
		ItemStack copy = stack.copyWithCount(1);
		entityData.set(DATA_ITEM, copy);
		cachedConfig = null;
		cachedStats = null;
	}

	public void setConfig(EquipmentConfig config) {
		ItemStack stack = entityData.get(DATA_ITEM).copy();
		stack.set(ModDataComponents.EQUIPMENT_CONFIG, config);
		setItem(stack);
	}

	public EquipmentStats stats() {
		if (cachedStats == null) {
			cachedStats = EquipmentStats.compute(kind(), config());
		}
		return cachedStats;
	}

	public PhysicsPreset preset() {
		return PhysicsPreset.values()[Mth.clamp(entityData.get(DATA_PRESET), 0, PhysicsPreset.values().length - 1)];
	}

	public void setPreset(PhysicsPreset preset) {
		entityData.set(DATA_PRESET, (byte) preset.ordinal());
	}

	public boolean isGoofy() {
		return entityData.get(DATA_GOOFY);
	}

	public void setGoofy(boolean goofy) {
		entityData.set(DATA_GOOFY, goofy);
	}

	public int animFlags() {
		return entityData.get(DATA_ANIM_FLAGS);
	}

	public int animPack() {
		return entityData.get(DATA_ANIM_PACK);
	}

	public int trickData() {
		return entityData.get(DATA_TRICK);
	}

	public int heldData() {
		return entityData.get(DATA_HELD);
	}

	public int landingData() {
		return entityData.get(DATA_LANDING);
	}

	/** Server-side: store animation state reported by the rider's client so other players see it. */
	public void applyAnimState(int flags, int pack, int trick, int held, int landing) {
		entityData.set(DATA_ANIM_FLAGS, flags);
		entityData.set(DATA_ANIM_PACK, pack);
		entityData.set(DATA_TRICK, trick);
		entityData.set(DATA_HELD, held);
		entityData.set(DATA_LANDING, landing);
	}

	public void setOwner(@Nullable UUID owner) {
		this.owner = owner;
	}

	public @Nullable UUID owner() {
		return owner;
	}

	public boolean hasRider() {
		return getControllingPassenger() != null || testRiderPresent;
	}

	// ------------------------------------------------------------------ ticking

	@Override
	public void tick() {
		super.tick();
		Vec3 previous = lastTickPos;
		clientWheelAngleO = clientWheelAngle;
		boolean simulate = isLocalInstanceAuthoritative() || testInput != null;
		if (simulate) {
			interpolation.cancel();
			RideInput input = RideInput.NONE;
			if (testInput != null) {
				input = testInput;
			} else if (level().isClientSide() && getControllingPassenger() instanceof Player) {
				input = clientInput.apply(this);
			}
			ride.tick(input);
			if (level().isClientSide()) {
				clientAfterTick.accept(this);
			}
		} else {
			interpolation.interpolate();
			setDeltaMovement(Vec3.ZERO);
		}
		Vec3 now = position();
		observedSpeed = previous == Vec3.ZERO ? 0.0F : (float) Math.sqrt(Math.pow(now.x - previous.x, 2) + Math.pow(now.z - previous.z, 2));
		if (!simulate) {
			clientWheelAngle += observedSpeed / kind().handling().wheelRadius();
		}
		lastTickPos = now;

		if (!level().isClientSide()) {
			serverTick();
		}
	}

	private void serverTick() {
		if (getY() < level().getMinY() - 32) {
			discard();
			return;
		}
		if (getControllingPassenger() instanceof ServerPlayer player) {
			ServerRideTracker.get(player).sample(this);
		} else if (isInWater() && testInput == null) {
			Vec3 v = getDeltaMovement();
			setDeltaMovement(v.x * 0.9, Math.min(v.y + 0.06, 0.08), v.z * 0.9);
		}
	}

	@Override
	public @Nullable InterpolationHandler getInterpolation() {
		return interpolation;
	}

	@Override
	public float maxUpStep() {
		if (ride.contact == RideController.Contact.GROUND) {
			return preset().stepHeight;
		}
		return 0.0F;
	}

	@Override
	public boolean isFlyingVehicle() {
		// Big airs are part of the sport; don't let the anti-fly check kick riders.
		return true;
	}

	/** Whether a standing rider fits at the given board position (ride-through park blocks are ignored). */
	public boolean riderSpaceFree(Vec3 pos) {
		float stand = kind().standHeight();
		AABB box = new AABB(pos.x - 0.24, pos.y + stand + 0.2, pos.z - 0.24, pos.x + 0.24, pos.y + stand + 1.75, pos.z + 0.24);
		return level().noCollision(this, box);
	}

	// ------------------------------------------------------------------ riding

	/** Client option: rotate the rider's camera with the board when steering with the keyboard. */
	public static boolean cameraFollowsSteering = true;

	@Override
	protected void positionRider(Entity passenger, Entity.MoveFunction moveFunction) {
		moveFunction.accept(passenger, getX(), getY() + kind().standHeight(), getZ());
		if (level().isClientSide() && passenger == getControllingPassenger() && isLocalInstanceAuthoritative()) {
			float delta = ride.yawSteerDelta;
			ride.yawSteerDelta = 0.0F;
			if (cameraFollowsSteering && delta != 0.0F) {
				passenger.setYRot(passenger.getYRot() + delta);
				passenger.setYHeadRot(passenger.getYHeadRot() + delta);
			}
		}
	}

	@Override
	public @Nullable LivingEntity getControllingPassenger() {
		return getFirstPassenger() instanceof Player player ? player : null;
	}

	@Override
	protected boolean canAddPassenger(Entity passenger) {
		return getPassengers().isEmpty() && passenger instanceof Player;
	}

	@Override
	protected void addPassenger(Entity passenger) {
		super.addPassenger(passenger);
		ride.reset();
		mountedAtTick = tickCount;
		if (!level().isClientSide() && passenger instanceof ServerPlayer player) {
			PlayerSportData data = PlayerSportData.get(player);
			setPreset(data.preset());
			setGoofy(data.goofy());
			if (owner == null) {
				owner = player.getUUID();
			}
			ServerRideTracker.get(player).onMount(this);
		}
		if (passenger instanceof Player player) {
			setYRot(player.getYRot());
		}
	}

	@Override
	protected void removePassenger(Entity passenger) {
		super.removePassenger(passenger);
		ride.reset();
		applyAnimState(0, 0, entityData.get(DATA_TRICK), 0, entityData.get(DATA_LANDING));
		if (!level().isClientSide() && passenger instanceof ServerPlayer player) {
			ServerRideTracker.get(player).onDismount(this);
			boolean bail = bailDismount;
			bailDismount = false;
			if (!bail && isAlive() && PlayerSportData.get(player).autoPickup()) {
				pickUp(player);
			}
		}
	}

	@Override
	public Vec3 getDismountLocationForPassenger(LivingEntity passenger) {
		Vec3 base = new Vec3(getX(), getY() + 0.05, getZ());
		if (level().noCollision(passenger, passenger.getBoundingBox().move(base.subtract(passenger.position())))) {
			return base;
		}
		return super.getDismountLocationForPassenger(passenger);
	}

	@Override
	public InteractionResult interact(Player player, InteractionHand hand) {
		if (player.isSecondaryUseActive()) {
			if (!level().isClientSide() && !isVehicle()) {
				pickUp(player);
			}
			return InteractionResult.SUCCESS;
		}
		if (isVehicle()) {
			return InteractionResult.PASS;
		}
		if (!level().isClientSide()) {
			return player.startRiding(this) ? InteractionResult.SUCCESS : InteractionResult.PASS;
		}
		return InteractionResult.SUCCESS;
	}

	@Override
	public boolean skipAttackInteraction(Entity attacker) {
		if (attacker instanceof Player player && !isVehicle()) {
			if (!level().isClientSide()) {
				pickUp(player);
			}
			return true;
		}
		return true;
	}

	/** Returns the equipment (with its customization) to the player's inventory. */
	public void pickUp(Player player) {
		if (!isAlive() || level().isClientSide()) {
			return;
		}
		ItemStack stack = toItemStack();
		if (!player.getInventory().add(stack) && level() instanceof ServerLevel serverLevel) {
			spawnAtLocation(serverLevel, stack);
		}
		level().playSound(null, getX(), getY(), getZ(), SoundEvents.ITEM_PICKUP, SoundSource.PLAYERS, 0.4F, 1.2F);
		discard();
	}

	public ItemStack toItemStack() {
		ItemStack stack = entityData.get(DATA_ITEM);
		return stack.isEmpty() ? new ItemStack(ModItems.forKind(kind())) : stack.copy();
	}

	@Override
	public ItemStack getPickResult() {
		return toItemStack();
	}

	// ------------------------------------------------------------------ misc entity behaviour

	@Override
	public boolean hurtServer(ServerLevel level, DamageSource source, float amount) {
		if (source.getEntity() instanceof Player player && !isVehicle()) {
			pickUp(player);
			return true;
		}
		if (source.is(net.minecraft.tags.DamageTypeTags.IS_FIRE) || source.is(net.minecraft.tags.DamageTypeTags.IS_EXPLOSION)) {
			if (!isVehicle()) {
				spawnAtLocation(level, toItemStack());
				discard();
			}
			return true;
		}
		return false;
	}

	@Override
	public boolean causeFallDamage(double distance, float multiplier, DamageSource source) {
		return false;
	}

	@Override
	public boolean canUsePortal(boolean allowPassengers) {
		return false;
	}

	@Override
	protected Entity.MovementEmission getMovementEmission() {
		return Entity.MovementEmission.NONE;
	}

	@Override
	public boolean isPickable() {
		return !isVehicle() && isAlive();
	}

	@Override
	public float getPickRadius() {
		return 0.42F;
	}

	@Override
	public boolean canBeCollidedWith(@Nullable Entity entity) {
		return false;
	}

	@Override
	public boolean isPushable() {
		return false;
	}

	@Override
	public boolean isAttackable() {
		return true;
	}

	@Override
	protected double getDefaultGravity() {
		return 0.0;
	}

	// ------------------------------------------------------------------ persistence

	@Override
	protected void readAdditionalSaveData(ValueInput input) {
		input.read("item", ItemStack.CODEC).ifPresent(this::setItem);
		input.read("owner", UUIDUtil.CODEC).ifPresent(uuid -> owner = uuid);
	}

	@Override
	protected void addAdditionalSaveData(ValueOutput output) {
		ItemStack stack = entityData.get(DATA_ITEM);
		if (!stack.isEmpty()) {
			output.store("item", ItemStack.CODEC, stack);
		}
		if (owner != null) {
			output.store("owner", UUIDUtil.CODEC, owner);
		}
	}
}
