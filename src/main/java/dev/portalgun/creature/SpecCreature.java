package dev.portalgun.creature;

import dev.portalgun.content.ContentSpec;
import dev.portalgun.registry.ModCreatures;
import dev.portalgun.registry.ModItems;
import java.util.List;
import net.minecraft.core.BlockPos;
import net.minecraft.core.particles.BlockParticleOption;
import net.minecraft.core.particles.DustParticleOptions;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.util.Mth;
import net.minecraft.world.Difficulty;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.MoverType;
import net.minecraft.world.entity.PathfinderMob;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.ai.control.FlyingMoveControl;
import net.minecraft.world.entity.ai.control.SmoothSwimmingLookControl;
import net.minecraft.world.entity.ai.control.SmoothSwimmingMoveControl;
import net.minecraft.world.entity.ai.goal.AvoidEntityGoal;
import net.minecraft.world.entity.ai.goal.FloatGoal;
import net.minecraft.world.entity.ai.goal.LeapAtTargetGoal;
import net.minecraft.world.entity.ai.goal.LookAtPlayerGoal;
import net.minecraft.world.entity.ai.goal.MeleeAttackGoal;
import net.minecraft.world.entity.ai.goal.PanicGoal;
import net.minecraft.world.entity.ai.goal.RandomLookAroundGoal;
import net.minecraft.world.entity.ai.goal.RandomStrollGoal;
import net.minecraft.world.entity.ai.goal.RandomSwimmingGoal;
import net.minecraft.world.entity.ai.goal.RangedAttackGoal;
import net.minecraft.world.entity.ai.goal.TemptGoal;
import net.minecraft.world.entity.ai.goal.WaterAvoidingRandomStrollGoal;
import net.minecraft.world.entity.ai.goal.target.HurtByTargetGoal;
import net.minecraft.world.entity.ai.goal.target.NearestAttackableTargetGoal;
import net.minecraft.world.entity.ai.navigation.AmphibiousPathNavigation;
import net.minecraft.world.entity.ai.navigation.FlyingPathNavigation;
import net.minecraft.world.entity.ai.navigation.PathNavigation;
import net.minecraft.world.entity.ai.navigation.WallClimberNavigation;
import net.minecraft.world.entity.ai.navigation.WaterBoundPathNavigation;
import net.minecraft.world.entity.monster.RangedAttackMob;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.pathfinder.PathType;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import org.jspecify.annotations.Nullable;

/**
 * One class for every spec-driven creature. Movement, goals, attacks and abilities come from the
 * {@link ContentSpec.CreatureSpec} registered for this entity type (see {@link ModCreatures}).
 */
public class SpecCreature extends PathfinderMob implements RangedAttackMob {
	private static final EntityDataAccessor<Integer> DATA_SWELL = SynchedEntityData.defineId(SpecCreature.class, EntityDataSerializers.INT);
	private static final EntityDataAccessor<Byte> DATA_FLAGS = SynchedEntityData.defineId(SpecCreature.class, EntityDataSerializers.BYTE);
	private static final EntityDataAccessor<Integer> DATA_BURROW = SynchedEntityData.defineId(SpecCreature.class, EntityDataSerializers.INT);
	public static final int FLAG_SHIELD = 1;
	public static final int FLAG_CHARGE = 2;
	public static final int FLAG_CLIMB = 4;
	public static final int FUSE = 30;
	public static final int BURROW_TIME = 50;

	/** Explosions caused by creatures (orbs, bursting blobs) never break blocks and spare other spec creatures. */
	public static final net.minecraft.world.level.ExplosionDamageCalculator SPARE_CREATURES = new net.minecraft.world.level.ExplosionDamageCalculator() {
		@Override
		public boolean shouldDamageEntity(net.minecraft.world.level.Explosion explosion, Entity entity) {
			return !(entity instanceof SpecCreature) && super.shouldDamageEntity(explosion, entity);
		}
	};

	private ContentSpec.CreatureSpec spec;
	private int oldSwell;
	private int splitGeneration;
	private int abilityCooldown;
	private int shieldTicks;
	private int auraTicks;
	private int swarmCooldown;

	public SpecCreature(EntityType<? extends SpecCreature> type, Level level) {
		super(type, level);
		ContentSpec.CreatureSpec s = this.spec();
		this.xpReward = s.xp;
		switch (s.movement) {
			case "flying", "floating" -> {
				this.moveControl = new FlyingMoveControl(this, s.movement.equals("floating") ? 8 : 20, true);
				this.setNoGravity(true);
				this.setPathfindingMalus(PathType.DANGER_FIRE, -1.0F);
				this.setPathfindingMalus(PathType.WATER, -1.0F);
				this.setPathfindingMalus(PathType.WATER_BORDER, 16.0F);
			}
			case "swimming" -> {
				this.moveControl = new SmoothSwimmingMoveControl(this, 85, 10, 0.1F, 0.5F, true);
				this.lookControl = new SmoothSwimmingLookControl(this, 10);
				this.setPathfindingMalus(PathType.WATER, 0.0F);
			}
			case "amphibious" -> this.setPathfindingMalus(PathType.WATER, 0.0F);
			case "hopping" -> this.moveControl = new CreatureControls.HopMoveControl(this);
			default -> {
			}
		}
		if (s.fireImmune) {
			this.setPathfindingMalus(PathType.LAVA, 8.0F);
			this.setPathfindingMalus(PathType.DANGER_FIRE, 0.0F);
			this.setPathfindingMalus(PathType.DAMAGE_FIRE, 0.0F);
		}
	}

	public final ContentSpec.CreatureSpec spec() {
		if (this.spec == null) {
			this.spec = ModCreatures.spec(this.getType());
		}
		return this.spec;
	}

	public boolean has(String ability) {
		return this.spec().abilities.contains(ability);
	}

	public String movement() {
		return this.spec().movement;
	}

	public boolean isAirborneKind() {
		String m = this.movement();
		return m.equals("flying") || m.equals("floating");
	}

	// ------------------------------------------------------------------------------------------- data
	@Override
	protected void defineSynchedData(SynchedEntityData.Builder builder) {
		super.defineSynchedData(builder);
		builder.define(DATA_SWELL, 0);
		builder.define(DATA_FLAGS, (byte) 0);
		builder.define(DATA_BURROW, 0);
	}

	public int getSwellTicks() {
		return this.entityData.get(DATA_SWELL);
	}

	public float getSwell(float partialTick) {
		return Mth.lerp(partialTick, (float) this.oldSwell, (float) this.getSwellTicks()) / (FUSE - 2);
	}

	public boolean flag(int f) {
		return (this.entityData.get(DATA_FLAGS) & f) != 0;
	}

	public void setFlag(int f, boolean on) {
		byte b = this.entityData.get(DATA_FLAGS);
		this.entityData.set(DATA_FLAGS, (byte) (on ? b | f : b & ~f));
	}

	public int getBurrowTicks() {
		return this.entityData.get(DATA_BURROW);
	}

	public void setSwellTicks(int t) {
		this.entityData.set(DATA_SWELL, t);
	}

	@Override
	protected void addAdditionalSaveData(ValueOutput out) {
		super.addAdditionalSaveData(out);
		out.putInt("SplitGeneration", this.splitGeneration);
	}

	@Override
	protected void readAdditionalSaveData(ValueInput in) {
		super.readAdditionalSaveData(in);
		this.splitGeneration = in.getIntOr("SplitGeneration", 0);
	}

	// ------------------------------------------------------------------------------------------- navigation / goals
	@Override
	protected PathNavigation createNavigation(Level level) {
		ContentSpec.CreatureSpec s = this.spec();
		switch (s.movement) {
			case "flying", "floating" -> {
				FlyingPathNavigation nav = new FlyingPathNavigation(this, level);
				nav.setCanOpenDoors(false);
				nav.setCanFloat(true);
				return nav;
			}
			case "swimming" -> {
				return new WaterBoundPathNavigation(this, level);
			}
			case "amphibious" -> {
				return new AmphibiousPathNavigation(this, level);
			}
			default -> {
				if (s.abilities.contains("climb")) {
					return new WallClimberNavigation(this, level);
				}
				return super.createNavigation(level);
			}
		}
	}

	@Override
	protected void registerGoals() {
		ContentSpec.CreatureSpec s = this.spec();
		String mv = s.movement;
		boolean swim = mv.equals("swimming");
		boolean air = mv.equals("flying") || mv.equals("floating");
		if (!swim && !mv.equals("amphibious")) {
			this.goalSelector.addGoal(0, new FloatGoal(this));
		}
		boolean fights = (s.behavior.equals("hostile") || s.behavior.equals("neutral")) && !s.attack.equals("none");
		if (!fights) {
			this.goalSelector.addGoal(1, new PanicGoal(this, air ? 1.6 : 1.5));
		}
		if (s.behavior.equals("skittish")) {
			this.goalSelector.addGoal(2, new AvoidEntityGoal<>(this, Player.class, 10.0F, 1.1, 1.5,
				e -> !(e instanceof Player p && this.isTemptItem(p.getMainHandItem()))));
		}
		if (fights) {
			if (s.abilities.contains("leap") && !air) {
				this.goalSelector.addGoal(2, new LeapAtTargetGoal(this, 0.4F));
			}
			if (s.abilities.contains("charge") && !air && !swim) {
				this.goalSelector.addGoal(2, new CreatureGoals.ChargeGoal(this));
			}
			switch (s.attack) {
				case "ranged" -> {
					ContentSpec.Ranged r = s.ranged != null ? s.ranged : new ContentSpec.Ranged();
					int cd = Math.max(10, r.cooldown);
					this.goalSelector.addGoal(3, new RangedAttackGoal(this, 1.0, cd, cd + cd / 2, 16.0F));
				}
				case "explode" -> this.goalSelector.addGoal(3, new CreatureGoals.SwellGoal(this));
				default -> this.goalSelector.addGoal(3, new MeleeAttackGoal(this, air ? 1.3 : 1.2, false));
			}
		}
		if (s.tempt != null) {
			this.goalSelector.addGoal(4, new TemptGoal(this, 1.15, this::isTemptItem, false));
		}
		if (air) {
			this.goalSelector.addGoal(6, new CreatureGoals.AirWanderGoal(this, mv.equals("floating")));
		} else if (swim) {
			this.goalSelector.addGoal(6, new RandomSwimmingGoal(this, 1.0, 10));
		} else if (mv.equals("amphibious")) {
			this.goalSelector.addGoal(6, new RandomStrollGoal(this, 1.0));
		} else {
			this.goalSelector.addGoal(6, new WaterAvoidingRandomStrollGoal(this, 1.0));
		}
		this.goalSelector.addGoal(7, new LookAtPlayerGoal(this, Player.class, 8.0F));
		this.goalSelector.addGoal(8, new RandomLookAroundGoal(this));
		if (fights) {
			HurtByTargetGoal hurt = new HurtByTargetGoal(this) {
				@Override
				protected void alertOther(net.minecraft.world.entity.Mob other, LivingEntity target) {
					// only rally creatures of the same kind (all spec creatures share one Java class)
					if (other.getType() == SpecCreature.this.getType()) {
						super.alertOther(other, target);
					}
				}
			};
			if (s.abilities.contains("swarm")) {
				hurt.setAlertOthers();
			}
			this.targetSelector.addGoal(1, hurt);
			if (s.behavior.equals("hostile")) {
				this.targetSelector.addGoal(2, new NearestAttackableTargetGoal<>(this, Player.class, true));
			}
		}
	}

	public boolean isTemptItem(ItemStack stack) {
		String t = this.spec().tempt;
		return t != null && !stack.isEmpty() && stack.getItemHolder().unwrapKey().map(k -> k.identifier().toString().equals(t)).orElse(false);
	}

	// ------------------------------------------------------------------------------------------- movement
	@Override
	public void travel(Vec3 input) {
		String mv = this.movement();
		if ((mv.equals("flying") || mv.equals("floating")) && this.getBurrowTicks() == 0) {
			this.travelFlying(input, this.getSpeed());
			return;
		}
		if (mv.equals("swimming") && this.isInWater()) {
			this.moveRelative(this.getSpeed(), input);
			this.move(MoverType.SELF, this.getDeltaMovement());
			this.setDeltaMovement(this.getDeltaMovement().scale(0.9));
			if (this.getTarget() == null) {
				this.setDeltaMovement(this.getDeltaMovement().add(0.0, -0.005, 0.0));
			}
			return;
		}
		super.travel(input);
	}

	@Override
	public void jumpFromGround() {
		super.jumpFromGround();
		if (this.movement().equals("hopping") && this.zza > 0.0F) {
			float yaw = this.getYRot() * Mth.DEG_TO_RAD;
			double push = Math.min(0.6, 0.12 + this.getAttributeValue(Attributes.MOVEMENT_SPEED) * 1.1);
			this.setDeltaMovement(this.getDeltaMovement().add(-Mth.sin(yaw) * push, 0.05, Mth.cos(yaw) * push));
		}
	}

	@Override
	public boolean canBreatheUnderwater() {
		String mv = this.movement();
		return mv.equals("swimming") || mv.equals("amphibious") || super.canBreatheUnderwater();
	}

	@Override
	public boolean isPushedByFluid() {
		return !this.movement().equals("swimming");
	}

	@Override
	public boolean onClimbable() {
		return this.flag(FLAG_CLIMB) || super.onClimbable();
	}

	@Override
	public boolean causeFallDamage(double distance, float multiplier, DamageSource source) {
		if (this.isAirborneKind() || this.movement().equals("hopping")) {
			return false;
		}
		return super.causeFallDamage(distance, multiplier, source);
	}

	@Override
	protected void checkFallDamage(double dy, boolean onGround, BlockState state, BlockPos pos) {
		if (!this.isAirborneKind()) {
			super.checkFallDamage(dy, onGround, state, pos);
		}
	}

	@Override
	public boolean removeWhenFarAway(double distance) {
		String cat = this.spec().category;
		return !cat.equals("creature") && !this.hasCustomName();
	}

	@Override
	public int getMaxSpawnClusterSize() {
		return Math.max(1, this.spec().group);
	}

	@Override
	public int getMaxHeadXRot() {
		return this.isAirborneKind() ? 20 : 40;
	}

	// ------------------------------------------------------------------------------------------- ticking
	@Override
	public void baseTick() {
		int air = this.getAirSupply();
		super.baseTick();
		if (this.movement().equals("swimming") && this.isAlive() && !this.level().isClientSide()) {
			if (this.isInWater() || this.isInWaterOrRain()) {
				this.setAirSupply(300);
			} else {
				this.setAirSupply(air - 1);
				if (this.getAirSupply() <= -20) {
					this.setAirSupply(0);
					if (this.level() instanceof ServerLevel sl) {
						this.hurtServer(sl, this.damageSources().dryOut(), 2.0F);
					}
				}
			}
		}
	}

	@Override
	public void tick() {
		this.oldSwell = this.getSwellTicks();
		super.tick();
		if (this.level().isClientSide()) {
			this.clientEffects();
			return;
		}
		if (this.has("climb")) {
			this.setFlag(FLAG_CLIMB, this.horizontalCollision);
		}
	}

	private void clientEffects() {
		ContentSpec.CreatureSpec s = this.spec();
		if (this.getBurrowTicks() > 0) {
			BlockState below = this.level().getBlockState(this.blockPosition().below());
			if (!below.isAir()) {
				for (int i = 0; i < 4; i++) {
					this.level().addParticle(new BlockParticleOption(ParticleTypes.BLOCK, below), this.getRandomX(0.8), this.getY() + 0.1,
						this.getRandomZ(0.8), 0, 0.15, 0);
				}
			}
		}
		if ((s.emissive || s.abilities.contains("glow_aura")) && this.random.nextInt(8) == 0) {
			int col = parseColor(s.ranged != null ? s.ranged.color : null, 0xFFE9A0);
			this.level().addParticle(new DustParticleOptions(col, 0.8F), this.getRandomX(0.7), this.getRandomY(), this.getRandomZ(0.7), 0, 0.02, 0);
		}
		if (s.abilities.contains("fire_trail") && this.walkAnimation.speed() > 0.1F && this.random.nextInt(3) == 0) {
			this.level().addParticle(ParticleTypes.FLAME, this.getRandomX(0.5), this.getY() + 0.1, this.getRandomZ(0.5), 0, 0.02, 0);
		}
		if (this.flag(FLAG_SHIELD) && this.random.nextInt(3) == 0) {
			this.level().addParticle(ParticleTypes.ENCHANTED_HIT, this.getRandomX(1.0), this.getRandomY(), this.getRandomZ(1.0), 0, 0, 0);
		}
	}

	public static int parseColor(@Nullable String hex, int fallback) {
		if (hex == null) {
			return fallback;
		}
		try {
			String h = hex.startsWith("#") ? hex.substring(1) : hex;
			if (h.length() == 8) {
				h = h.substring(2);
			}
			return Integer.parseInt(h, 16);
		} catch (NumberFormatException e) {
			return fallback;
		}
	}

	@Override
	protected void customServerAiStep(ServerLevel level) {
		super.customServerAiStep(level);
		ContentSpec.CreatureSpec s = this.spec();
		if (this.abilityCooldown > 0) {
			this.abilityCooldown--;
		}
		if (this.swarmCooldown > 0) {
			this.swarmCooldown--;
		}
		// regeneration
		if (s.abilities.contains("regen") && this.tickCount % 40 == 0 && this.getHealth() < this.getMaxHealth() && this.hurtTime == 0) {
			this.heal(this.getTarget() == null ? 2.0F : 0.5F);
		}
		// shield
		if (this.shieldTicks > 0 && --this.shieldTicks == 0) {
			this.setFlag(FLAG_SHIELD, false);
		}
		// glow aura
		if (s.abilities.contains("glow_aura") && ++this.auraTicks >= 40) {
			this.auraTicks = 0;
			boolean hostile = s.behavior.equals("hostile");
			for (Player p : level.getEntitiesOfClass(Player.class, this.getBoundingBox().inflate(8.0))) {
				if (hostile) {
					p.addEffect(new MobEffectInstance(MobEffects.GLOWING, 120, 0, true, true), this);
				} else {
					p.addEffect(new MobEffectInstance(MobEffects.NIGHT_VISION, 300, 0, true, true), this);
				}
			}
		}
		// burrow
		int burrow = this.getBurrowTicks();
		if (burrow > 0) {
			this.entityData.set(DATA_BURROW, burrow - 1);
			this.getNavigation().stop();
			this.setDeltaMovement(0, Math.min(0, this.getDeltaMovement().y), 0);
			if (burrow == BURROW_TIME / 2) {
				LivingEntity t = this.getTarget();
				if (t != null) {
					Vec3 d = t.position().subtract(this.position()).multiply(1, 0, 1);
					Vec3 dst = d.lengthSqr() > 9 ? this.position().add(d.normalize().scale(Math.min(10, d.length() - 2))) : this.position();
					this.randomTeleport(dst.x, t.getY(), dst.z, false);
				} else {
					this.randomTeleport(this.getX() + (this.random.nextDouble() - 0.5) * 12, this.getY(), this.getZ() + (this.random.nextDouble() - 0.5) * 12, false);
				}
			}
			if (burrow == 1) {
				this.setDeltaMovement(0, 0.5, 0);
				this.playSound(SoundEvents.ROOTED_DIRT_BREAK, 1.0F, 0.6F);
			}
		} else if (s.abilities.contains("burrow") && this.getTarget() != null && this.abilityCooldown == 0 && this.onGround()
			&& this.random.nextInt(120) == 0) {
			this.startBurrow();
		}
		// blink: short hops toward the target (wraiths)
		if (s.abilities.contains("blink") && this.getTarget() != null && this.abilityCooldown == 0 && this.random.nextInt(60) == 0) {
			LivingEntity t = this.getTarget();
			double dist = this.distanceTo(t);
			if (dist > 5 && dist < 24) {
				Vec3 dir = t.position().subtract(this.position()).normalize().scale(Math.min(6, dist - 3));
				if (this.blinkTo(this.getX() + dir.x, this.getY() + dir.y, this.getZ() + dir.z)) {
					this.abilityCooldown = 60;
				}
			}
		}
		// teleporting stalkers close the distance when far from their target
		if (s.abilities.contains("teleport") && this.getTarget() != null && this.abilityCooldown == 0 && this.random.nextInt(100) == 0
			&& this.distanceToSqr(this.getTarget()) > 144) {
			LivingEntity t = this.getTarget();
			Vec3 dir = this.position().subtract(t.position()).normalize().scale(4);
			if (this.blinkTo(t.getX() + dir.x + (this.random.nextDouble() - 0.5) * 4, t.getY(), t.getZ() + dir.z + (this.random.nextDouble() - 0.5) * 4)) {
				this.abilityCooldown = 100;
			}
		}
		// swarm: hostile kin join in on our target
		if (s.abilities.contains("swarm") && this.getTarget() != null && this.swarmCooldown == 0) {
			this.swarmCooldown = 100;
			this.alertKin(level, this.getTarget());
		}
	}

	private void alertKin(ServerLevel level, LivingEntity target) {
		AABB box = this.getBoundingBox().inflate(16.0, 8.0, 16.0);
		for (SpecCreature kin : level.getEntitiesOfClass(SpecCreature.class, box, e -> e != this && e.getType() == this.getType())) {
			if (kin.getTarget() == null && !kin.isAlliedTo(target)) {
				kin.setTarget(target);
			}
		}
	}

	public void startBurrow() {
		if (this.getBurrowTicks() == 0) {
			this.entityData.set(DATA_BURROW, BURROW_TIME);
			this.abilityCooldown = 160;
			this.playSound(SoundEvents.ROOTED_DIRT_BREAK, 1.0F, 0.8F);
		}
	}

	public boolean blinkTo(double x, double y, double z) {
		for (int i = 0; i < 8; i++) {
			if (this.randomTeleport(x, y + this.random.nextInt(5) - 2, z, true)) {
				this.level().playSound(null, this.xo, this.yo, this.zo, SoundEvents.ENDERMAN_TELEPORT, this.getSoundSource(), 1.0F, 1.0F);
				this.playSound(SoundEvents.ENDERMAN_TELEPORT, 1.0F, 1.2F);
				return true;
			}
		}
		return false;
	}

	private boolean teleportRandomly() {
		double x = this.getX() + (this.random.nextDouble() - 0.5) * 16.0;
		double y = this.getY() + (this.random.nextInt(8) - 4);
		double z = this.getZ() + (this.random.nextDouble() - 0.5) * 16.0;
		return this.blinkTo(x, y, z);
	}

	// ------------------------------------------------------------------------------------------- combat
	@Override
	public boolean hurtServer(ServerLevel level, DamageSource source, float amount) {
		ContentSpec.CreatureSpec s = this.spec();
		if (this.getBurrowTicks() > 0 && !source.is(net.minecraft.tags.DamageTypeTags.BYPASSES_INVULNERABILITY)) {
			return false;
		}
		if (this.flag(FLAG_SHIELD)) {
			amount *= 0.2F;
		}
		boolean result = super.hurtServer(level, source, amount);
		if (!result || !this.isAlive()) {
			return result;
		}
		Entity attacker = source.getEntity();
		if (s.abilities.contains("thorns") && source.getDirectEntity() instanceof LivingEntity le && le == attacker
			&& !source.is(net.minecraft.tags.DamageTypeTags.AVOIDS_GUARDIAN_THORNS)) {
			le.hurtServer(level, this.damageSources().thorns(this), 2.0F);
		}
		if (s.abilities.contains("ink") && attacker instanceof LivingEntity le2 && this.distanceToSqr(le2) < 25) {
			le2.addEffect(new MobEffectInstance(MobEffects.BLINDNESS, 60), this);
			level.sendParticles(ParticleTypes.SQUID_INK, this.getX(), this.getY(0.5), this.getZ(), 30, 0.5, 0.5, 0.5, 0.05);
		}
		if (s.abilities.contains("shield") && !this.flag(FLAG_SHIELD) && this.abilityCooldown == 0) {
			this.setFlag(FLAG_SHIELD, true);
			this.shieldTicks = 60;
			this.abilityCooldown = 200;
			this.playSound(SoundEvents.SHIELD_BLOCK.value(), 1.0F, 0.8F);
		}
		if (s.abilities.contains("teleport") && this.abilityCooldown == 0 && this.random.nextFloat() < 0.6F) {
			if (this.teleportRandomly()) {
				this.abilityCooldown = 40;
			}
		}
		if (s.abilities.contains("burrow") && this.getHealth() < this.getMaxHealth() * 0.5F && this.abilityCooldown == 0 && this.onGround()) {
			this.startBurrow();
		}
		if (s.abilities.contains("swarm") && attacker instanceof LivingEntity le3 && !(le3 instanceof Player p && p.isCreative())) {
			this.alertKin(level, le3);
		}
		return result;
	}

	@Override
	public boolean doHurtTarget(ServerLevel level, Entity target) {
		boolean hit = super.doHurtTarget(level, target);
		ContentSpec.CreatureSpec s = this.spec();
		if (hit && s.onHit != null && target instanceof LivingEntity le) {
			MobEffectInstance e = ModItems.effect(scaled(s.onHit, level.getDifficulty()));
			if (e != null && this.random.nextFloat() < s.onHit.chance) {
				le.addEffect(e, this);
			}
		}
		return hit;
	}

	public static ContentSpec.EffectSpec scaled(ContentSpec.EffectSpec e, Difficulty d) {
		ContentSpec.EffectSpec out = new ContentSpec.EffectSpec();
		out.id = e.id;
		out.amplifier = e.amplifier;
		out.chance = e.chance;
		float k = switch (d) {
			case EASY -> 0.5F;
			case HARD -> 1.5F;
			default -> 1.0F;
		};
		out.duration = Math.max(20, Math.round(e.duration * k));
		return out;
	}

	@Override
	public void performRangedAttack(LivingEntity target, float power) {
		if (!(this.level() instanceof ServerLevel level)) {
			return;
		}
		ContentSpec.Ranged r = this.spec().ranged != null ? this.spec().ranged : new ContentSpec.Ranged();
		int n = Math.max(1, Math.min(8, r.count));
		Vec3 eye = new Vec3(this.getX(), this.getEyeY() - 0.1, this.getZ());
		Vec3 aim = new Vec3(target.getX(), target.getY(0.5), target.getZ()).subtract(eye);
		for (int i = 0; i < n; i++) {
			float yawOff = n == 1 ? 0 : (i - (n - 1) / 2.0F) * Math.max(4.0F, r.spread);
			Vec3 dir = aim.yRot(yawOff * Mth.DEG_TO_RAD);
			CreatureOrb orb = new CreatureOrb(level, this, r);
			Vec3 start = eye.add(dir.normalize().scale(this.getBbWidth() * 0.6));
			orb.setPos(start.x, start.y, start.z);
			float inaccuracy = (float) (14 - level.getDifficulty().getId() * 4);
			orb.shoot(dir.x, dir.y + (r.gravity ? dir.horizontalDistance() * 0.15 : 0), dir.z, Math.max(0.3F, r.speed), Math.max(0.0F, inaccuracy) * 0.2F);
			orb.setHomingTarget(target);
			level.addFreshEntity(orb);
		}
		this.playSound(SoundEvents.BREEZE_SHOOT, 1.0F, 0.9F + this.random.nextFloat() * 0.3F);
		this.swing(net.minecraft.world.InteractionHand.MAIN_HAND);
	}

	public void explode() {
		if (this.level() instanceof ServerLevel level && this.isAlive()) {
			float power = (float) (this.spec().extra.getOrDefault("explode", 2.5F) * Math.max(0.6F, this.spec().scale));
			level.explode(this, null, SPARE_CREATURES, this.getX(), this.getY(0.5), this.getZ(), power, false, Level.ExplosionInteraction.NONE);
			this.dead = true;
			this.triggerOnDeathMobEffects(level, RemovalReason.KILLED);
			this.discard();
		}
	}

	@Override
	public void die(DamageSource source) {
		super.die(source);
		if (this.level() instanceof ServerLevel level && this.has("split") && this.splitGeneration < 1) {
			int n = 2 + this.random.nextInt(2);
			for (int i = 0; i < n; i++) {
				Entity e = this.getType().create(level, EntitySpawnReason.TRIGGERED);
				if (e instanceof SpecCreature child) {
					child.splitGeneration = this.splitGeneration + 1;
					child.getAttribute(Attributes.SCALE).setBaseValue(0.55);
					child.getAttribute(Attributes.MAX_HEALTH).setBaseValue(Math.max(2.0, this.getMaxHealth() * 0.35));
					child.setHealth(child.getMaxHealth());
					child.getAttribute(Attributes.ATTACK_DAMAGE).setBaseValue(this.getAttributeBaseValue(Attributes.ATTACK_DAMAGE) * 0.5);
					child.snapTo(this.getX() + (this.random.nextDouble() - 0.5), this.getY() + 0.2, this.getZ() + (this.random.nextDouble() - 0.5),
						this.random.nextFloat() * 360.0F, 0.0F);
					child.setDeltaMovement((this.random.nextDouble() - 0.5) * 0.3, 0.3, (this.random.nextDouble() - 0.5) * 0.3);
					if (this.isPersistenceRequired()) {
						child.setPersistenceRequired();
					}
					level.addFreshEntity(child);
				}
			}
		}
	}

	@Override
	protected boolean shouldDropLoot(ServerLevel level) {
		return this.splitGeneration == 0 && super.shouldDropLoot(level);
	}

	// ------------------------------------------------------------------------------------------- sounds
	@Override
	protected @Nullable SoundEvent getAmbientSound() {
		return ModCreatures.sound(this.spec().sounds.ambient);
	}

	@Override
	protected @Nullable SoundEvent getHurtSound(DamageSource source) {
		SoundEvent e = ModCreatures.sound(this.spec().sounds.hurt);
		return e != null ? e : SoundEvents.GENERIC_HURT;
	}

	@Override
	protected @Nullable SoundEvent getDeathSound() {
		SoundEvent e = ModCreatures.sound(this.spec().sounds.death);
		return e != null ? e : SoundEvents.GENERIC_DEATH;
	}

	@Override
	protected void playStepSound(BlockPos pos, BlockState state) {
		if (this.isAirborneKind()) {
			return;
		}
		SoundEvent e = ModCreatures.sound(this.spec().sounds.step);
		if (e != null) {
			this.playSound(e, 0.15F, this.getVoicePitch());
		} else {
			super.playStepSound(pos, state);
		}
	}

	@Override
	public float getVoicePitch() {
		float scaleK = (float) Math.sqrt(1.0 / Math.max(0.3, this.getScale()));
		return super.getVoicePitch() * this.spec().sounds.pitch * Mth.clamp(scaleK, 0.8F, 1.4F);
	}

	@Override
	protected float getSoundVolume() {
		return this.spec().sounds.volume * Mth.clamp(this.spec().scale, 0.6F, 2.0F);
	}

	@Override
	public int getAmbientSoundInterval() {
		return this.spec().behavior.equals("hostile") ? 100 : 160;
	}

	public List<String> abilities() {
		return this.spec().abilities;
	}
}
