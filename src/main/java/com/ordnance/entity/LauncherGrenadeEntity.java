package com.ordnance.entity;

import com.ordnance.ClientBridge;
import com.ordnance.config.ConfigManager;
import com.ordnance.config.OrdnanceConfig;
import com.ordnance.explosion.ExplosionProfile;
import com.ordnance.explosion.OrdnanceExplosion;
import com.ordnance.network.OrdnanceNetworking;
import com.ordnance.registry.ModEntities;
import com.ordnance.registry.ModItems;
import com.ordnance.registry.ModSounds;
import com.ordnance.weapon.ExplosiveItem;
import com.ordnance.weapon.FireMode;
import net.minecraft.entity.Entity;
import net.minecraft.entity.EntityType;
import net.minecraft.entity.LivingEntity;
import net.minecraft.entity.data.DataTracker;
import net.minecraft.entity.data.TrackedData;
import net.minecraft.entity.data.TrackedDataHandlerRegistry;
import net.minecraft.item.Item;
import net.minecraft.item.ItemStack;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.storage.ReadView;
import net.minecraft.storage.WriteView;
import net.minecraft.util.hit.EntityHitResult;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.World;

/**
 * 40 mm launcher round on a ballistic arc. In impact mode it detonates on the first hit once armed (inside the
 * arming distance it bounces off as a dud and falls back to a short timer); in timed mode it bounces until the fuse
 * expires. Smoke rounds vent smoke instead of exploding.
 */
public class LauncherGrenadeEntity extends OrdnanceProjectileEntity {
	private static final TrackedData<Boolean> EMITTING = DataTracker.registerData(LauncherGrenadeEntity.class, TrackedDataHandlerRegistry.BOOLEAN);
	private FireMode mode = FireMode.IMPACT;
	private int fuse = 200;
	private int emitTicks;

	public LauncherGrenadeEntity(EntityType<? extends LauncherGrenadeEntity> type, World world) {
		super(type, world);
	}

	public LauncherGrenadeEntity(World world, LivingEntity shooter, ItemStack round, FireMode mode) {
		this(ModEntities.LAUNCHER_GRENADE, world);
		this.setOwner(shooter);
		this.setPosition(shooter.getX(), shooter.getEyeY() - 0.12, shooter.getZ());
		this.setItem(round);
		this.mode = mode;
		this.fuse = mode == FireMode.TIMED ? ConfigManager.get().weapons.grenadeLauncher.timedFuseTicks : 200;
	}

	@Override
	protected Item getDefaultItem() {
		return ModItems.GRENADE_40MM_HE;
	}

	@Override
	protected void initDataTracker(DataTracker.Builder builder) {
		super.initDataTracker(builder);
		builder.add(EMITTING, false);
	}

	public ExplosionProfile profile() {
		return this.getStack().getItem() instanceof ExplosiveItem explosive ? explosive.profile() : ExplosionProfile.HE_40MM;
	}

	public boolean isEmitting() {
		return this.dataTracker.get(EMITTING);
	}

	private boolean isArmed() {
		return this.distanceTravelled >= ConfigManager.get().weapons.grenadeLauncher.armingDistance;
	}

	@Override
	public void tick() {
		super.tick();
		World world = this.getEntityWorld();
		Vec3d velocity = this.getVelocity();
		double drag = this.isTouchingWater() ? 0.8 : 0.993;
		velocity = velocity.multiply(drag).add(0.0, -0.035, 0.0);
		this.setVelocity(velocity);

		if (!world.isClient() && !this.isEmitting() && this.mode == FireMode.IMPACT) {
			Vec3d start = this.getEntityPos();
			EntityHitResult entityHit = this.findEntityHit(start, start.add(velocity));
			if (entityHit != null) {
				if (this.isArmed()) {
					this.setPosition(entityHit.getPos());
					this.detonate(velocity);
					return;
				}

				this.bluntHit(entityHit.getEntity(), velocity);
			}
		}

		Collision collision = this.moveWithCollisions();
		if (collision.any() && !this.isEmitting()) {
			if (!world.isClient() && this.mode == FireMode.IMPACT && this.isArmed()) {
				this.detonate(collision.motion());
				return;
			}

			double impact = collision.impactSpeed();
			this.bounce(collision, 0.3, 0.6);
			if (!world.isClient()) {
				if (this.mode == FireMode.IMPACT) {
					this.fuse = Math.min(this.fuse, 60);
				}

				if (impact > 0.1) {
					this.playSound(ModSounds.GRENADE_BOUNCE, (float)Math.min(1.0, impact * 1.6), 0.75F + this.random.nextFloat() * 0.2F);
				}
			}
		} else if (collision.any()) {
			this.bounce(collision, 0.2, 0.5);
		}

		this.updateRotationFromVelocity();
		this.updateSpin((float)this.getVelocity().length() * 25.0F);
		if (world.isClient()) {
			ClientBridge.get().entityTick(this);
			return;
		}

		if (this.isEmitting()) {
			if (--this.emitTicks <= 0) {
				this.discard();
			} else if (this.emitTicks % 40 == 0) {
				world.playSound(null, this.getX(), this.getY(), this.getZ(), ModSounds.SMOKE_HISS, SoundCategory.NEUTRAL, 0.6F, 1.1F);
			}

			return;
		}

		if (this.isOnFire() || this.isInLava()) {
			this.fuse = Math.min(this.fuse, 10);
		}

		if (--this.fuse <= 0) {
			this.detonate(this.getVelocity());
		}
	}

	private void bluntHit(Entity target, Vec3d velocity) {
		ServerWorld world = (ServerWorld)this.getEntityWorld();
		target.damage(world, this.getDamageSources().thrown(this, this.getOwner()), 4.0F);
		this.setVelocity(velocity.multiply(-0.15, 0.2, -0.15));
		this.fuse = Math.min(this.fuse, 60);
	}

	private void detonate(Vec3d direction) {
		ServerWorld world = (ServerWorld)this.getEntityWorld();
		ExplosionProfile profile = this.profile();
		OrdnanceConfig.Warhead warhead = profile.warhead();
		if (profile.style().isSmoke()) {
			this.dataTracker.set(EMITTING, true);
			this.emitTicks = warhead.smokeTicks > 0 ? warhead.smokeTicks : 300;
			this.setVelocity(this.getVelocity().multiply(0.2));
			world.playSound(null, this.getX(), this.getY(), this.getZ(), ModSounds.SMOKE_POP, SoundCategory.NEUTRAL, 1.0F, 1.1F);
			OrdnanceNetworking.sendExplosion(world, this.getEntityPos(), profile, warhead.visualScale, new Vec3d(0.0, 1.0, 0.0), this.random.nextLong());
			return;
		}

		Vec3d back = direction.lengthSquared() > 1.0E-6 ? direction.normalize().multiply(-0.2) : Vec3d.ZERO;
		OrdnanceExplosion.detonate(world, this.getEntityPos().add(back).add(0.0, 0.1, 0.0), profile, this, this.getOwner(), direction);
		this.discard();
	}

	@Override
	protected void writeCustomData(WriteView view) {
		super.writeCustomData(view);
		view.put("Mode", FireMode.CODEC, this.mode);
		view.putInt("Fuse", this.fuse);
		view.putInt("EmitTicks", this.emitTicks);
		view.putBoolean("Emitting", this.isEmitting());
	}

	@Override
	protected void readCustomData(ReadView view) {
		super.readCustomData(view);
		this.mode = view.read("Mode", FireMode.CODEC).orElse(FireMode.IMPACT);
		this.fuse = view.getInt("Fuse", 200);
		this.emitTicks = view.getInt("EmitTicks", 0);
		this.dataTracker.set(EMITTING, view.getBoolean("Emitting", false));
	}
}
