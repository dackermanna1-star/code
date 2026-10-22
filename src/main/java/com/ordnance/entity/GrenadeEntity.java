package com.ordnance.entity;

import com.ordnance.ClientBridge;
import com.ordnance.config.ConfigManager;
import com.ordnance.explosion.ExplosionProfile;
import com.ordnance.explosion.OrdnanceExplosion;
import com.ordnance.network.OrdnanceNetworking;
import com.ordnance.registry.ModEntities;
import com.ordnance.registry.ModItems;
import com.ordnance.registry.ModSounds;
import com.ordnance.weapon.ExplosiveItem;
import net.minecraft.entity.EntityType;
import net.minecraft.entity.LivingEntity;
import net.minecraft.entity.damage.DamageSource;
import net.minecraft.entity.data.DataTracker;
import net.minecraft.entity.data.TrackedData;
import net.minecraft.entity.data.TrackedDataHandlerRegistry;
import net.minecraft.item.Item;
import net.minecraft.item.ItemStack;
import net.minecraft.registry.tag.DamageTypeTags;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.storage.ReadView;
import net.minecraft.storage.WriteView;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.World;

/**
 * Thrown hand grenade. Bounces and rolls with real restitution and friction, then detonates when its fuse burns
 * out. Smoke grenades instead start venting smoke for a while. Grenades caught in fire or blasts cook off early.
 */
public class GrenadeEntity extends OrdnanceProjectileEntity {
	private static final TrackedData<Boolean> EMITTING = DataTracker.registerData(GrenadeEntity.class, TrackedDataHandlerRegistry.BOOLEAN);
	private int fuse = 80;
	private int emitTicks;

	public GrenadeEntity(EntityType<? extends GrenadeEntity> type, World world) {
		super(type, world);
	}

	public GrenadeEntity(World world, LivingEntity thrower, ItemStack stack, int fuse) {
		this(ModEntities.GRENADE, world);
		this.setOwner(thrower);
		this.setPosition(thrower.getX(), thrower.getEyeY() - 0.15, thrower.getZ());
		this.setItem(stack);
		this.fuse = fuse;
	}

	@Override
	protected Item getDefaultItem() {
		return ModItems.FRAG_GRENADE;
	}

	@Override
	protected void initDataTracker(DataTracker.Builder builder) {
		super.initDataTracker(builder);
		builder.add(EMITTING, false);
	}

	public ExplosionProfile profile() {
		return this.getStack().getItem() instanceof ExplosiveItem explosive ? explosive.profile() : ExplosionProfile.FRAG_GRENADE;
	}

	public boolean isEmitting() {
		return this.dataTracker.get(EMITTING);
	}

	public int getFuse() {
		return this.fuse;
	}

	@Override
	public void tick() {
		super.tick();
		Vec3d velocity = this.getVelocity();
		double drag = this.isTouchingWater() ? 0.8 : 0.985;
		this.setVelocity(velocity.multiply(drag).add(0.0, -0.045, 0.0));
		Collision collision = this.moveWithCollisions();
		if (collision.any()) {
			double impact = collision.impactSpeed();
			this.bounce(collision, ConfigManager.get().weapons.grenades.bounciness, 0.72);
			if (!this.getEntityWorld().isClient() && impact > 0.1) {
				this.playSound(ModSounds.GRENADE_BOUNCE, (float)Math.min(1.0, impact * 2.0), 0.9F + this.random.nextFloat() * 0.3F);
			}
		}

		this.updateSpin((float)this.getVelocity().length() * 40.0F);
		if (this.getEntityWorld().isClient()) {
			ClientBridge.get().entityTick(this);
			return;
		}

		if (this.isEmitting()) {
			if (--this.emitTicks <= 0) {
				this.discard();
			} else if (this.emitTicks % 40 == 0) {
				this.getEntityWorld().playSound(null, this.getX(), this.getY(), this.getZ(), ModSounds.SMOKE_HISS, SoundCategory.NEUTRAL, 0.6F, 1.0F);
			}

			return;
		}

		if (this.isOnFire() || this.isInLava()) {
			this.fuse = Math.min(this.fuse, 15);
		}

		if (--this.fuse <= 0) {
			this.detonate();
		}
	}

	private void detonate() {
		ServerWorld world = (ServerWorld)this.getEntityWorld();
		ExplosionProfile profile = this.profile();
		if (profile.style().isSmoke()) {
			this.dataTracker.set(EMITTING, true);
			this.emitTicks = profile.warhead().smokeTicks > 0 ? profile.warhead().smokeTicks : ConfigManager.get().weapons.grenades.smokeDurationTicks;
			world.playSound(null, this.getX(), this.getY(), this.getZ(), ModSounds.SMOKE_POP, SoundCategory.NEUTRAL, 1.0F, 1.0F);
			OrdnanceNetworking.sendExplosion(world, this.getEntityPos(), profile, profile.warhead().visualScale, new Vec3d(0.0, 1.0, 0.0), this.random.nextLong());
			return;
		}

		OrdnanceExplosion.detonate(world, this.getEntityPos().add(0.0, 0.15, 0.0), profile, this, this.getOwner(), new Vec3d(0.0, -1.0, 0.0));
		this.discard();
	}

	@Override
	public boolean damage(ServerWorld world, DamageSource source, float amount) {
		if (source.isIn(DamageTypeTags.IS_EXPLOSION) && !this.isEmitting()) {
			this.fuse = Math.min(this.fuse, 2 + this.random.nextInt(4));
		}

		return false;
	}

	@Override
	protected void writeCustomData(WriteView view) {
		super.writeCustomData(view);
		view.putInt("Fuse", this.fuse);
		view.putInt("EmitTicks", this.emitTicks);
		view.putBoolean("Emitting", this.isEmitting());
	}

	@Override
	protected void readCustomData(ReadView view) {
		super.readCustomData(view);
		this.fuse = view.getInt("Fuse", 80);
		this.emitTicks = view.getInt("EmitTicks", 0);
		this.dataTracker.set(EMITTING, view.getBoolean("Emitting", false));
	}
}
