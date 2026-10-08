package dev.portalgun.creature;

import dev.portalgun.content.ContentSpec;
import dev.portalgun.registry.ModCreatures;
import dev.portalgun.registry.ModItems;
import net.minecraft.core.particles.DustParticleOptions;
import net.minecraft.core.particles.ParticleOptions;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.core.particles.SimpleParticleType;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.projectile.ThrowableProjectile;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.gamerules.GameRules;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.EntityHitResult;
import net.minecraft.world.phys.Vec3;
import org.jspecify.annotations.Nullable;

/** The glowing orb fired by ranged creatures. Colour/size are synced; damage and effects live on the server. */
public class CreatureOrb extends ThrowableProjectile {
	private static final EntityDataAccessor<Integer> DATA_COLOR = SynchedEntityData.defineId(CreatureOrb.class, EntityDataSerializers.INT);
	private static final EntityDataAccessor<Float> DATA_SIZE = SynchedEntityData.defineId(CreatureOrb.class, EntityDataSerializers.FLOAT);
	private static final int LIFETIME = 100;

	private float damage = 3.0F;
	private float explode;
	private float knockback;
	private float fire;
	private float homing;
	private boolean gravity;
	private ContentSpec.@Nullable EffectSpec effect;
	private @Nullable String particle;
	private @Nullable LivingEntity homingTarget;

	public CreatureOrb(EntityType<? extends CreatureOrb> type, Level level) {
		super(type, level);
	}

	public CreatureOrb(ServerLevel level, LivingEntity owner, ContentSpec.Ranged r) {
		super(ModCreatures.ORB, level);
		this.setOwner(owner);
		this.damage = r.damage;
		this.explode = r.explode;
		this.knockback = r.knockback;
		this.fire = r.fire;
		this.homing = r.homing;
		this.gravity = r.gravity;
		this.effect = r.effect;
		this.particle = r.particle;
		this.entityData.set(DATA_COLOR, SpecCreature.parseColor(r.color, 0x7CFF4A));
		this.entityData.set(DATA_SIZE, Math.max(0.1F, Math.min(1.5F, r.size)));
	}

	public void setHomingTarget(@Nullable LivingEntity target) {
		this.homingTarget = target;
	}

	@Override
	protected void defineSynchedData(SynchedEntityData.Builder builder) {
		builder.define(DATA_COLOR, 0x7CFF4A);
		builder.define(DATA_SIZE, 0.35F);
	}

	public int getColor() {
		return this.entityData.get(DATA_COLOR);
	}

	public float getSize() {
		return this.entityData.get(DATA_SIZE);
	}

	@Override
	protected double getDefaultGravity() {
		return this.gravity ? 0.03 : 0.0;
	}

	@Override
	public void tick() {
		super.tick();
		if (this.level().isClientSide()) {
			Vec3 v = this.getDeltaMovement();
			ParticleOptions trail = new DustParticleOptions(this.getColor(), 1.0F);
			for (int i = 0; i < 2; i++) {
				double t = i / 2.0;
				this.level().addParticle(trail, this.getX() - v.x * t, this.getY() + 0.1 - v.y * t, this.getZ() - v.z * t, 0, 0, 0);
			}
			return;
		}
		if (this.tickCount > LIFETIME) {
			this.burst();
			return;
		}
		if (this.homing > 0 && this.homingTarget != null && this.homingTarget.isAlive() && this.tickCount > 4) {
			Vec3 v = this.getDeltaMovement();
			Vec3 want = this.homingTarget.getEyePosition().subtract(this.position()).normalize().scale(v.length());
			this.setDeltaMovement(v.lerp(want, Math.min(1.0, this.homing * 0.12)));
		}
	}

	@Override
	protected void onHitEntity(EntityHitResult hit) {
		super.onHitEntity(hit);
		if (!(this.level() instanceof ServerLevel level)) {
			return;
		}
		Entity target = hit.getEntity();
		Entity owner = this.getOwner();
		LivingEntity ownerLiving = owner instanceof LivingEntity le ? le : null;
		if (target.hurtServer(level, this.damageSources().mobProjectile(this, ownerLiving), this.damage)) {
			if (target instanceof LivingEntity living) {
				if (this.effect != null) {
					MobEffectInstance e = ModItems.effect(SpecCreature.scaled(this.effect, level.getDifficulty()));
					if (e != null && this.random.nextFloat() < this.effect.chance) {
						living.addEffect(e, owner);
					}
				}
				if (this.fire > 0) {
					living.igniteForSeconds(this.fire);
				}
				if (this.knockback > 0) {
					Vec3 v = this.getDeltaMovement().multiply(1, 0, 1).normalize();
					living.knockback(this.knockback, -v.x, -v.z);
					living.hurtMarked = true;
				}
			}
		}
		this.burst();
	}

	@Override
	protected void onHitBlock(BlockHitResult hit) {
		super.onHitBlock(hit);
		if (!this.level().isClientSide()) {
			this.burst();
		}
	}

	@Override
	protected boolean canHitEntity(Entity entity) {
		Entity owner = this.getOwner();
		if (owner != null && (entity == owner || entity.getType() == owner.getType())) {
			return false;
		}
		return !(entity instanceof CreatureOrb) && super.canHitEntity(entity);
	}

	private void burst() {
		if (!(this.level() instanceof ServerLevel level) || this.isRemoved()) {
			return;
		}
		if (this.explode > 0) {
			level.explode(this, null, SpecCreature.SPARE_CREATURES, this.getX(), this.getY(), this.getZ(), this.explode,
				// ServerExplosion lights fires whenever asked, even with interaction NONE: respect mobGriefing like LargeFireball
				this.fire > 0 && level.getGameRules().get(GameRules.MOB_GRIEFING), Level.ExplosionInteraction.NONE);
		} else {
			level.sendParticles(new DustParticleOptions(this.getColor(), 1.4F), this.getX(), this.getY(), this.getZ(), 12, 0.2, 0.2, 0.2, 0.02);
			ParticleOptions extra = this.extraParticle();
			if (extra != null) {
				level.sendParticles(extra, this.getX(), this.getY(), this.getZ(), 8, 0.2, 0.2, 0.2, 0.05);
			}
			this.playSound(SoundEvents.AMETHYST_BLOCK_HIT, 0.8F, 1.4F);
		}
		this.discard();
	}

	private @Nullable ParticleOptions extraParticle() {
		if (this.particle == null) {
			return null;
		}
		Identifier id = Identifier.tryParse(this.particle);
		if (id == null) {
			return null;
		}
		return BuiltInRegistries.PARTICLE_TYPE.getOptional(id).filter(t -> t instanceof SimpleParticleType).map(t -> (ParticleOptions) t)
			.orElse(ParticleTypes.ELECTRIC_SPARK);
	}

	@Override
	protected void addAdditionalSaveData(ValueOutput out) {
		super.addAdditionalSaveData(out);
		out.putFloat("Damage", this.damage);
		out.putInt("Color", this.getColor());
		out.putFloat("Size", this.getSize());
		out.putFloat("Explode", this.explode);
		out.putFloat("Knockback", this.knockback);
		out.putFloat("Fire", this.fire);
		out.putFloat("Homing", this.homing);
		out.putBoolean("Gravity", this.gravity);
		if (this.particle != null) {
			out.putString("Particle", this.particle);
		}
		if (this.effect != null && this.effect.id != null) {
			ValueOutput e = out.child("Effect");
			e.putString("id", this.effect.id);
			e.putInt("duration", this.effect.duration);
			e.putInt("amplifier", this.effect.amplifier);
			e.putFloat("chance", this.effect.chance);
		}
	}

	@Override
	protected void readAdditionalSaveData(ValueInput in) {
		super.readAdditionalSaveData(in);
		this.damage = in.getFloatOr("Damage", 3.0F);
		this.entityData.set(DATA_COLOR, in.getIntOr("Color", 0x7CFF4A));
		this.entityData.set(DATA_SIZE, Math.max(0.1F, Math.min(1.5F, in.getFloatOr("Size", 0.35F))));
		this.explode = in.getFloatOr("Explode", 0.0F);
		this.knockback = in.getFloatOr("Knockback", 0.0F);
		this.fire = in.getFloatOr("Fire", 0.0F);
		this.homing = in.getFloatOr("Homing", 0.0F);
		this.gravity = in.getBooleanOr("Gravity", false);
		this.particle = in.getString("Particle").orElse(null);
		this.effect = in.child("Effect").flatMap(e -> e.getString("id").map(id -> {
			ContentSpec.EffectSpec spec = new ContentSpec.EffectSpec();
			spec.id = id;
			spec.duration = e.getIntOr("duration", 100);
			spec.amplifier = e.getIntOr("amplifier", 0);
			spec.chance = e.getFloatOr("chance", 1.0F);
			return spec;
		})).orElse(null);
	}
}
