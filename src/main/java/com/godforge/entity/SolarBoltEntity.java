package com.godforge.entity;

import com.godforge.destruction.CraterJob;
import com.godforge.destruction.DestructionManager;
import com.godforge.destruction.Palette;
import com.godforge.destruction.SurfaceJob;
import com.godforge.network.Fx;
import com.godforge.network.FxType;
import com.godforge.registry.FxParticleOptions;
import com.godforge.registry.ModDamageTypes;
import com.godforge.registry.ModParticles;
import com.godforge.registry.ModSounds;
import com.godforge.util.Combat;
import com.godforge.weapon.WeaponAccess;
import com.godforge.weapon.WeaponType;
import java.util.Comparator;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.monster.Enemy;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.EntityHitResult;
import net.minecraft.world.phys.Vec3;

/**
 * Sunforge stellar projectiles: 0 = blazing solar bolt, 1 = launched mini-sun (homing nova),
 * 2 = the charged unstable stellar core.
 */
public class SolarBoltEntity extends GfProjectile {
	public static final int BOLT = 0;
	public static final int NOVA = 1;
	public static final int CORE = 2;
	private float damage = 20.0F;
	private boolean exploded;
	private java.util.UUID holder;
	private int holdKeepAlive;

	public SolarBoltEntity(EntityType<? extends SolarBoltEntity> type, Level level) {
		super(type, level);
		this.maxAge = 120;
	}

	public void configure(int variant, float size, float damage, boolean terrain) {
		this.setVariant(variant);
		this.setSize(size);
		this.damage = damage;
		this.terrain = terrain;
		this.maxAge = variant == CORE ? 160 : 100;
	}

	/** Keeps the core hovering in front of its wielder while it charges. */
	public void hold(net.minecraft.world.entity.player.Player player) {
		this.holder = player.getUUID();
		this.holdKeepAlive = 3;
	}

	public void refreshHold(float size, float charge) {
		this.holdKeepAlive = 3;
		this.setSize(size);
		this.setCharge(charge);
	}

	public void release(Vec3 velocity) {
		this.holder = null;
		this.age = 0;
		this.setDeltaMovement(velocity);
	}

	public boolean isHeld() {
		return this.holder != null;
	}

	@Override
	protected boolean heldTick() {
		if (this.holder == null || !(this.level() instanceof ServerLevel level)) {
			return false;
		}
		net.minecraft.world.entity.player.Player player = level.getPlayerByUUID(this.holder);
		if (player == null || !player.isAlive() || --this.holdKeepAlive < 0) {
			// abandoned mid-charge: the unstable core destabilises where it hangs
			this.holder = null;
			this.setSize(Math.max(1.0F, this.size() * 0.5F));
			this.explode(level, this.position());
			return true;
		}
		Vec3 look = player.getLookAngle();
		Vec3 at = player.getEyePosition().add(look.scale(1.8 + this.size() * 0.6)).add(0, 0.6 + this.size() * 0.4, 0);
		this.setPos(at);
		this.setDeltaMovement(Vec3.ZERO);
		return true;
	}

	@Override
	protected double hitInflate() {
		return this.variant() == CORE ? this.size() * 0.4 : 0.4;
	}

	@Override
	protected Vec3 serverMove(ServerLevel level, Vec3 start, Vec3 end) {
		if (this.variant() == NOVA && this.age > 4) {
			// home in on the nearest hostile creature
			AABB box = this.getBoundingBox().inflate(24.0);
			LivingEntity target = level.getEntitiesOfClass(LivingEntity.class, box, e -> e instanceof Enemy && e.isAlive())
				.stream()
				.min(Comparator.comparingDouble(e -> e.distanceToSqr(this)))
				.orElse(null);
			if (target != null) {
				Vec3 motion = this.getDeltaMovement();
				Vec3 desired = target.getBoundingBox().getCenter().subtract(start).normalize().scale(motion.length());
				Vec3 steered = motion.scale(0.82).add(desired.scale(0.18));
				this.setDeltaMovement(steered);
				end = start.add(steered);
			}
		}
		return super.serverMove(level, start, end);
	}

	@Override
	protected void onHitEntity(EntityHitResult hit) {
		if (this.level() instanceof ServerLevel level) {
			this.explode(level, hit.getLocation());
		}
	}

	@Override
	protected void onHitBlock(BlockHitResult hit) {
		if (this.level() instanceof ServerLevel level) {
			this.explode(level, hit.getLocation());
		}
	}

	@Override
	protected void onExpire(ServerLevel level) {
		this.explode(level, this.position());
	}

	private void explode(ServerLevel level, Vec3 at) {
		if (this.exploded) {
			return;
		}
		this.exploded = true;
		Entity owner = this.getOwner();
		int variant = this.variant();
		float radius = switch (variant) {
			case CORE -> this.size() * 1.25F;
			case NOVA -> 3.5F;
			default -> 2.6F;
		};
		DamageSource source = ModDamageTypes.source(level, WeaponType.SUNFORGE, this, owner);
		boolean terrain = this.terrain && WeaponAccess.terrainAllowed(level, owner, true, BlockPos.containing(at));
		if (terrain) {
			CraterJob.builder(level, BlockPos.containing(at), radius)
				.vertical(0.8)
				.noise(0.22)
				.lining(variant == CORE ? Palette.MOLTEN : Palette.SCORCHED, 1.2)
				.fire(0.5F)
				.submit();
			if (variant == CORE) {
				DestructionManager.submit(new SurfaceJob(level, BlockPos.containing(at), radius * 2.4, 2, (int) radius + 4, 0.25F, 0.2,
					(state, pos, layer) -> Palette.scorchSurface(state, pos, 4242L, false)).delayed(3));
			}
		}
		float dmg = variant == CORE ? this.damage * (1.5F + this.size() * 0.4F) : this.damage;
		Combat.sphere(level, source, owner, at, radius * 1.8, dmg, 1.0, variant == CORE ? 2.5 : 1.0, 0.6);
		for (Entity e : level.getEntities(this, new AABB(at, at).inflate(radius * 2.0), e -> e instanceof LivingEntity && e.isAlive())) {
			if (Combat.canAffect(level, owner, e)) {
				e.igniteForSeconds(variant == CORE ? 10.0F : 5.0F);
			}
		}
		if (variant == CORE) {
			Fx.send(level, FxType.SOLAR, at, Vec3.ZERO, radius * 1.6F, 0.0F, 0xFFB01F, 384);
			Impacts.shockwaves(level, at, 2, radius * 3.0, 5, 0xFF8A1F, this.damage, source, owner);
			Fx.flash(level, at, 0xFFE9A0, 0.8F, 18, radius * 12);
			Fx.shake(level, at, 1.4F, 35, radius * 12);
			Fx.sound(level, at, ModSounds.SOLAR_ERUPTION, 10.0F + radius, 1.1F);
		} else {
			Fx.send(level, FxType.EXPLOSION, at, Vec3.ZERO, radius, 0.0F, 0xFF9A1F, 192);
			Fx.sound(level, at, ModSounds.BIG_EXPLOSION, 3.0F, 1.4F);
		}
		this.discard();
	}

	@Override
	protected void clientTick(Vec3 start, Vec3 end) {
		Level level = this.level();
		float size = this.size();
		int count = this.variant() == CORE ? 10 : 4;
		for (int i = 0; i < count; i++) {
			Vec3 p = start.add(end.subtract(start).scale(this.random.nextDouble()))
				.add((this.random.nextDouble() - 0.5) * size, (this.random.nextDouble() - 0.5) * size, (this.random.nextDouble() - 0.5) * size);
			level.addParticle(
				FxParticleOptions.of(ModParticles.PLASMA, this.random.nextBoolean() ? 0xFFF2A0 : 0xFF8A1F, 0xB0200A, 0.15F + size * 0.12F, 12 + this.random.nextInt(8), -0.01F,
					FxParticleOptions.F_ADDITIVE | FxParticleOptions.F_SHRINK | FxParticleOptions.F_NO_PHYSICS),
				p.x, p.y, p.z, 0, 0.01, 0
			);
		}
	}
}
