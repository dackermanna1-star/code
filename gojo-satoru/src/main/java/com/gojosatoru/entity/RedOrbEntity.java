package com.gojosatoru.entity;

import com.gojosatoru.GojoRegistry;
import com.gojosatoru.particle.GlowParticleOptions;
import com.gojosatoru.power.Ability;
import com.gojosatoru.power.Fx;
import com.gojosatoru.power.GojoEffects;
import com.gojosatoru.power.GojoPowers;
import com.gojosatoru.power.GojoState;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.util.RandomSource;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.projectile.ProjectileUtil;
import net.minecraft.world.level.ClipContext;
import net.minecraft.world.level.Explosion;
import net.minecraft.world.level.ExplosionDamageCalculator;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.EntityHitResult;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;

/**
 * Cursed Technique Reversal: Red. Charges at the fingertip for a moment, then flies out and
 * detonates into a wave of pure repulsion that hurls everything away.
 */
public class RedOrbEntity extends CursedOrbEntity {
    private static final EntityDataAccessor<Float> DATA_SCALE = SynchedEntityData.defineId(RedOrbEntity.class, EntityDataSerializers.FLOAT);
    private static final EntityDataAccessor<Boolean> DATA_FLYING = SynchedEntityData.defineId(RedOrbEntity.class, EntityDataSerializers.BOOLEAN);

    private static final int CHARGE_TICKS = 8;
    private static final double SPEED = 2.6;
    private static final int MAX_FLIGHT = 28;
    private static final double BLAST_RADIUS = 7.5;

    /** The blast hurls entities itself, so the vanilla explosion only breaks blocks. */
    private static final ExplosionDamageCalculator BLOCKS_ONLY = new ExplosionDamageCalculator() {
        @Override
        public boolean shouldDamageEntity(Explosion explosion, Entity entity) {
            return false;
        }

        @Override
        public float getKnockbackMultiplier(Entity entity) {
            return 0.0F;
        }
    };

    private int age;
    private int flight;

    public RedOrbEntity(EntityType<? extends RedOrbEntity> type, Level level) {
        super(type, level);
    }

    public static void cast(ServerPlayer player, GojoState state) {
        if (!GojoPowers.trySpend(player, state, Ability.RED)) {
            return;
        }
        ServerLevel level = player.level();
        RedOrbEntity orb = new RedOrbEntity(GojoRegistry.RED, level);
        orb.setOwner(player);
        Vec3 start = handPoint(player, 1.1);
        orb.setPos(start.x, start.y, start.z);
        level.addFreshEntity(orb);
        player.swing(InteractionHand.MAIN_HAND, true);
        GojoEffects.castName(player, Ability.RED);
        GojoEffects.sound(level, start, SoundEvents.RESPAWN_ANCHOR_CHARGE, 1.5F, 1.4F);
        GojoEffects.sound(level, start, SoundEvents.WARDEN_SONIC_CHARGE, 0.8F, 2.0F);
    }

    @Override
    protected void defineSynchedData(SynchedEntityData.Builder builder) {
        builder.define(DATA_SCALE, 0.0F);
        builder.define(DATA_FLYING, false);
    }

    public float getScale() {
        return this.entityData.get(DATA_SCALE);
    }

    public boolean isFlying() {
        return this.entityData.get(DATA_FLYING);
    }

    // ----------------------------------------------------------------------------------- server ---

    @Override
    protected void serverTick(ServerLevel level) {
        ServerPlayer owner = this.owner();
        this.age++;
        if (!this.isFlying()) {
            if (owner == null || !owner.isAlive() || owner.level() != level || !GojoPowers.isGojo(owner)) {
                this.discard();
                return;
            }
            Vec3 hand = handPoint(owner, 1.1);
            this.setPos(hand.x, hand.y, hand.z);
            this.entityData.set(DATA_SCALE, Math.min(1.0F, this.age / (float) CHARGE_TICKS));
            if (this.age >= CHARGE_TICKS) {
                Vec3 velocity = owner.getLookAngle().scale(SPEED);
                this.setDeltaMovement(velocity);
                this.entityData.set(DATA_FLYING, true);
                GojoEffects.send(level, Fx.RED_FIRE, this.position(), velocity.normalize(), 1.0F, 64.0);
                GojoEffects.sound(level, this.position(), SoundEvents.WARDEN_SONIC_BOOM, 1.0F, 1.7F);
                GojoEffects.sound(level, this.position(), SoundEvents.FIRECHARGE_USE, 1.2F, 0.6F);
            }
            return;
        }

        Vec3 from = this.position();
        Vec3 velocity = this.getDeltaMovement();
        Vec3 to = from.add(velocity);
        BlockHitResult blockHit = level.clip(new ClipContext(from, to, ClipContext.Block.COLLIDER, ClipContext.Fluid.NONE, this));
        if (blockHit.getType() != HitResult.Type.MISS) {
            to = blockHit.getLocation();
        }
        AABB sweep = this.getBoundingBox().expandTowards(velocity).inflate(1.0);
        EntityHitResult entityHit = ProjectileUtil.getEntityHitResult(level, this, from, to, sweep,
                e -> e.isAlive() && e.isPickable() && !e.isSpectator() && !this.isOwner(e) && !(e instanceof CursedOrbEntity), 0.6F);
        if (entityHit != null) {
            this.detonate(level, owner, entityHit.getLocation());
            return;
        }
        if (blockHit.getType() != HitResult.Type.MISS) {
            this.detonate(level, owner, blockHit.getLocation().subtract(velocity.normalize().scale(0.4)));
            return;
        }
        this.setPos(to.x, to.y, to.z);
        if (++this.flight > MAX_FLIGHT) {
            this.detonate(level, owner, this.position());
        }
    }

    private void detonate(ServerLevel level, ServerPlayer owner, Vec3 at) {
        DamageSource source = GojoRegistry.damage(level, GojoRegistry.RED_DAMAGE, this, owner);
        for (Entity entity : level.getEntities(this, new AABB(at, at).inflate(BLAST_RADIUS),
                e -> e.isAlive() && !e.isSpectator() && !this.isOwner(e) && !(e instanceof CursedOrbEntity))) {
            Vec3 offset = entity.position().add(0.0, entity.getBbHeight() * 0.5, 0.0).subtract(at);
            double distance = offset.length();
            if (distance > BLAST_RADIUS) {
                continue;
            }
            double falloff = 1.0 - distance / BLAST_RADIUS;
            if (entity instanceof LivingEntity living) {
                living.hurtServer(level, source, (float) (6.0 + 24.0 * falloff));
            }
            Vec3 dir = distance < 0.01 ? new Vec3(0.0, 1.0, 0.0) : offset.normalize();
            double power = 1.0 + 3.4 * falloff;
            entity.setDeltaMovement(entity.getDeltaMovement().add(dir.scale(power)).add(0.0, 0.35 + 0.5 * falloff, 0.0));
            entity.hurtMarked = true;
        }
        Level.ExplosionInteraction interaction = GojoRegistry.blockDestruction(level)
                ? Level.ExplosionInteraction.TNT : Level.ExplosionInteraction.NONE;
        level.explode(this, source, BLOCKS_ONLY, at.x, at.y, at.z, 4.0F, false, interaction);
        GojoEffects.send(level, Fx.RED_IMPACT, at, Vec3.ZERO, 1.0F, 128.0);
        GojoEffects.sound(level, at, SoundEvents.WARDEN_SONIC_BOOM, 2.5F, 0.8F);
        GojoEffects.sound(level, at, SoundEvents.TRIDENT_THUNDER, 1.5F, 1.4F);
        this.discard();
    }

    // ----------------------------------------------------------------------------------- client ---

    @Override
    protected void clientTick() {
        RandomSource random = this.random;
        Vec3 center = this.position();
        float scale = this.getScale();
        if (!this.isFlying()) {
            // charging: energy rushing into the fingertip
            for (int i = 0; i < 4; i++) {
                Vec3 dir = randomUnit(random);
                double radius = 0.8 + random.nextDouble() * 1.2;
                int life = 5 + random.nextInt(3);
                this.particle(new GlowParticleOptions(GlowParticleOptions.DOT, random.nextBoolean() ? 0xFF2A1A : 0xFF7A50, 0.9F,
                        0.08F + random.nextFloat() * 0.08F, life, 1.0F), center.add(dir.scale(radius)), dir.scale(-radius / life));
            }
            if (random.nextInt(2) == 0) {
                Vec3 dir = randomUnit(random);
                this.particle(GlowParticleOptions.spark(0xFFD0C0, 0.15F + 0.1F * scale, 4), center.add(dir.scale(0.3 * scale)), dir.scale(0.06));
            }
            return;
        }
        Vec3 velocity = this.getDeltaMovement();
        Vec3 back = velocity.lengthSqr() > 1.0E-4 ? velocity.normalize().scale(-1.0) : Vec3.ZERO;
        for (int i = 0; i < 8; i++) {
            Vec3 pos = center.add(back.scale(random.nextDouble() * 2.4)).add(randomUnit(random).scale(0.25));
            int color = switch (random.nextInt(3)) {
                case 0 -> 0xFF1E14;
                case 1 -> 0xFF5A2A;
                default -> 0xFFB090;
            };
            this.particle(new GlowParticleOptions(GlowParticleOptions.DOT, color, 0.8F, 0.25F + random.nextFloat() * 0.25F,
                    8 + random.nextInt(6), 0.85F), pos, randomUnit(random).scale(0.03));
        }
        Vec3 dir = randomUnit(random);
        this.particle(GlowParticleOptions.spark(0xFFE0D0, 0.3F, 4), center.add(dir.scale(0.5)), dir.scale(0.12));
    }
}
