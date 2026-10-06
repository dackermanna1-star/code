package com.gojosatoru.entity;

import com.gojosatoru.GojoRegistry;
import com.gojosatoru.particle.GlowParticleOptions;
import com.gojosatoru.power.Ability;
import com.gojosatoru.power.Fx;
import com.gojosatoru.power.GojoEffects;
import com.gojosatoru.power.GojoPowers;
import com.gojosatoru.power.GojoState;
import net.minecraft.core.BlockPos;
import net.minecraft.core.particles.BlockParticleOption;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.ExperienceOrb;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.boss.enderdragon.EndCrystal;
import net.minecraft.world.entity.boss.enderdragon.EnderDragonPart;
import net.minecraft.world.entity.decoration.HangingEntity;
import net.minecraft.world.entity.item.FallingBlockEntity;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.item.PrimedTnt;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.entity.projectile.Projectile;
import net.minecraft.world.entity.vehicle.VehicleEntity;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.Vec3;

/**
 * Imaginary Technique: Purple. Blue and Red are summoned on either side, spiral together and
 * collide; the resulting mass of imaginary energy erases everything along its path.
 */
public class HollowPurpleEntity extends CursedOrbEntity {
    private static final EntityDataAccessor<Integer> DATA_PHASE = SynchedEntityData.defineId(HollowPurpleEntity.class, EntityDataSerializers.INT);
    private static final EntityDataAccessor<Integer> DATA_CHARGE = SynchedEntityData.defineId(HollowPurpleEntity.class, EntityDataSerializers.INT);
    private static final EntityDataAccessor<Float> DATA_RADIUS = SynchedEntityData.defineId(HollowPurpleEntity.class, EntityDataSerializers.FLOAT);

    public static final int PHASE_CHARGING = 0;
    public static final int PHASE_FIRED = 1;
    public static final int PHASE_FADING = 2;

    public static final int MERGE_AT = 30;
    public static final int CHARGE_TICKS = 44;
    public static final float MAX_RADIUS = 3.5F;
    private static final double SPEED = 1.3;
    private static final int MAX_FLIGHT = 90;
    private static final int FADE_TICKS = 12;

    private int charge;
    private int flight;
    private int fade;

    public HollowPurpleEntity(EntityType<? extends HollowPurpleEntity> type, Level level) {
        super(type, level);
    }

    public static void cast(ServerPlayer player, GojoState state) {
        if (state.purple != null && state.purple.isAlive()) {
            return;
        }
        if (!GojoPowers.trySpend(player, state, Ability.PURPLE)) {
            return;
        }
        ServerLevel level = player.level();
        HollowPurpleEntity purple = new HollowPurpleEntity(GojoRegistry.HOLLOW_PURPLE, level);
        purple.setOwner(player);
        purple.followOwner(player);
        level.addFreshEntity(purple);
        state.purple = purple;
        GojoPowers.revealSixEyes(player, CHARGE_TICKS + 50);
        player.addEffect(new MobEffectInstance(MobEffects.SLOWNESS, CHARGE_TICKS, 3, true, false, false));
        player.swing(InteractionHand.MAIN_HAND, true);
        GojoEffects.castName(player, Ability.PURPLE);
        GojoEffects.sound(level, purple.position(), SoundEvents.WARDEN_SONIC_CHARGE, 2.0F, 0.6F);
        GojoEffects.sound(level, purple.position(), SoundEvents.BEACON_POWER_SELECT, 2.0F, 0.5F);
    }

    /**
     * Where the blue ({@code sign = -1}) or red ({@code sign = 1}) orb sits relative to the merge point
     * while charging. Shared by the server-independent client particles and the renderer.
     */
    public static Vec3 chargeOffset(float charge, float yRot, float xRot, int sign) {
        float t = Mth.clamp(charge / MERGE_AT, 0.0F, 1.0F);
        double distance = 2.0 * (1.0 - t * t);
        double angle = charge * 0.2;
        Vec3 look = Vec3.directionFromRotation(xRot, yRot);
        Vec3 right = look.cross(new Vec3(0.0, 1.0, 0.0));
        right = right.lengthSqr() < 1.0E-4 ? new Vec3(1.0, 0.0, 0.0) : right.normalize();
        Vec3 up = right.cross(look).normalize();
        Vec3 radial = right.scale(Math.cos(angle)).add(up.scale(Math.sin(angle)));
        return radial.scale(sign * distance);
    }

    @Override
    protected void defineSynchedData(SynchedEntityData.Builder builder) {
        builder.define(DATA_PHASE, PHASE_CHARGING);
        builder.define(DATA_CHARGE, 0);
        builder.define(DATA_RADIUS, 0.0F);
    }

    public int getPhase() {
        return this.entityData.get(DATA_PHASE);
    }

    public int getCharge() {
        return this.entityData.get(DATA_CHARGE);
    }

    public float getRadius() {
        return this.entityData.get(DATA_RADIUS);
    }

    /** Called when Gojo reverts or dies mid-charge. A purple that is already flying keeps going. */
    public void cancelIfCharging() {
        if (this.getPhase() == PHASE_CHARGING) {
            this.discard();
        }
    }

    private void followOwner(ServerPlayer owner) {
        Vec3 look = owner.getLookAngle();
        Vec3 pos = owner.getEyePosition().add(look.scale(4.2)).add(0.0, -0.1, 0.0);
        this.setPos(pos.x, pos.y, pos.z);
        this.setYRot(owner.getYRot());
        this.setXRot(owner.getXRot());
    }

    // ----------------------------------------------------------------------------------- server ---

    @Override
    protected void serverTick(ServerLevel level) {
        ServerPlayer owner = this.owner();
        switch (this.getPhase()) {
            case PHASE_CHARGING -> this.tickCharge(level, owner);
            case PHASE_FIRED -> this.tickFlight(level, owner);
            default -> this.tickFade(level);
        }
    }

    private void tickCharge(ServerLevel level, ServerPlayer owner) {
        if (owner == null || !owner.isAlive() || owner.level() != level || !GojoPowers.isGojo(owner)) {
            this.discard();
            return;
        }
        this.charge++;
        this.entityData.set(DATA_CHARGE, this.charge);
        this.followOwner(owner);
        if (this.charge == 14) {
            GojoEffects.sound(level, this.position(), SoundEvents.AMETHYST_BLOCK_RESONATE, 2.0F, 0.5F);
        }
        if (this.charge == MERGE_AT) {
            this.entityData.set(DATA_RADIUS, 1.0F);
            GojoEffects.send(level, Fx.PURPLE_MERGE, this.position(), owner.getLookAngle(), 1.0F, 96.0);
            GojoEffects.sound(level, this.position(), SoundEvents.AMETHYST_BLOCK_CHIME, 3.0F, 0.5F);
            GojoEffects.sound(level, this.position(), SoundEvents.BEACON_ACTIVATE, 2.0F, 0.7F);
        }
        if (this.charge > MERGE_AT) {
            float grow = (this.charge - MERGE_AT) / (float) (CHARGE_TICKS - MERGE_AT);
            this.entityData.set(DATA_RADIUS, Mth.lerp(grow, 1.0F, MAX_RADIUS * 0.6F));
        }
        if (this.charge >= CHARGE_TICKS) {
            this.fire(level, owner);
        }
    }

    private void fire(ServerLevel level, ServerPlayer owner) {
        Vec3 dir = owner.getLookAngle();
        this.setDeltaMovement(dir.scale(SPEED));
        this.entityData.set(DATA_PHASE, PHASE_FIRED);
        this.entityData.set(DATA_RADIUS, MAX_RADIUS);
        GojoEffects.send(level, Fx.PURPLE_FIRE, this.position(), dir, 1.0F, 160.0);
        GojoEffects.sound(level, this.position(), SoundEvents.WARDEN_SONIC_BOOM, 4.0F, 0.5F);
        GojoEffects.sound(level, this.position(), SoundEvents.GENERIC_EXPLODE, 4.0F, 0.5F);
        GojoEffects.sound(level, this.position(), SoundEvents.LIGHTNING_BOLT_THUNDER, 3.0F, 1.3F);
        owner.setDeltaMovement(owner.getDeltaMovement().add(dir.scale(-0.7)));
        owner.hurtMarked = true;
        GojoState state = GojoPowers.state(owner);
        if (state.purple == this) {
            state.purple = null;
        }
    }

    private void tickFlight(ServerLevel level, ServerPlayer owner) {
        this.flight++;
        Vec3 next = this.position().add(this.getDeltaMovement());
        this.setPos(next.x, next.y, next.z);
        this.erase(level, owner, this.getRadius());
        if (this.flight % 12 == 0) {
            GojoEffects.sound(level, this.position(), SoundEvents.BEACON_AMBIENT, 4.0F, 0.5F);
        }
        BlockPos pos = this.blockPosition();
        if (this.flight >= MAX_FLIGHT || !level.isLoaded(pos) || pos.getY() < level.getMinY() - 16 || pos.getY() > level.getMaxY() + 32) {
            this.entityData.set(DATA_PHASE, PHASE_FADING);
        }
    }

    private void tickFade(ServerLevel level) {
        this.fade++;
        this.entityData.set(DATA_RADIUS, MAX_RADIUS * Math.max(0.0F, 1.0F - this.fade / (float) FADE_TICKS));
        Vec3 next = this.position().add(this.getDeltaMovement().scale(0.5));
        this.setPos(next.x, next.y, next.z);
        if (this.fade >= FADE_TICKS) {
            GojoEffects.send(level, Fx.PURPLE_END, this.position(), 1.0F);
            this.discard();
        }
    }

    private void erase(ServerLevel level, ServerPlayer owner, float radius) {
        Vec3 center = this.position();
        DamageSource source = GojoRegistry.damage(level, GojoRegistry.PURPLE_DAMAGE, this, owner);
        for (Entity entity : level.getEntities(this, this.getBoundingBox().inflate(radius + 1.5),
                e -> e.isAlive() && !this.isOwner(e) && !(e instanceof CursedOrbEntity))) {
            double reach = radius + entity.getBbWidth() * 0.5 + 0.5;
            if (entity.position().add(0.0, entity.getBbHeight() * 0.5, 0.0).distanceTo(center) > reach) {
                continue;
            }
            if (entity instanceof Player player && (player.isCreative() || player.isSpectator())) {
                continue;
            }
            if (entity instanceof LivingEntity || entity instanceof EnderDragonPart || entity instanceof EndCrystal) {
                entity.hurtServer(level, source, 100.0F);
            } else if (!entity.isInvulnerable() && (entity instanceof ItemEntity || entity instanceof ExperienceOrb
                    || entity instanceof Projectile || entity instanceof FallingBlockEntity || entity instanceof PrimedTnt
                    || entity instanceof HangingEntity || entity instanceof VehicleEntity)) {
                entity.discard();
            }
        }
        if (!GojoRegistry.blockDestruction(level)) {
            return;
        }
        RandomSource random = this.random;
        int r = Mth.ceil(radius);
        double r2 = radius * radius;
        BlockPos origin = BlockPos.containing(center);
        BlockPos.MutableBlockPos pos = new BlockPos.MutableBlockPos();
        int shown = 0;
        for (int dx = -r; dx <= r; dx++) {
            for (int dy = -r; dy <= r; dy++) {
                for (int dz = -r; dz <= r; dz++) {
                    if (dx * dx + dy * dy + dz * dz > r2) {
                        continue;
                    }
                    pos.set(origin.getX() + dx, origin.getY() + dy, origin.getZ() + dz);
                    BlockState state = level.getBlockState(pos);
                    if (state.isAir() || state.getDestroySpeed(level, pos) < 0.0F) {
                        continue;
                    }
                    level.setBlock(pos, Blocks.AIR.defaultBlockState(),
                            Block.UPDATE_ALL | Block.UPDATE_SUPPRESS_DROPS | Block.UPDATE_SKIP_BLOCK_ENTITY_SIDEEFFECTS);
                    if (shown < 6 && state.getFluidState().isEmpty() && random.nextInt(5) == 0) {
                        shown++;
                        level.sendParticles(new BlockParticleOption(ParticleTypes.BLOCK, state),
                                pos.getX() + 0.5, pos.getY() + 0.5, pos.getZ() + 0.5, 4, 0.3, 0.3, 0.3, 0.15);
                    }
                }
            }
        }
    }

    // ----------------------------------------------------------------------------------- client ---

    @Override
    protected void clientTick() {
        RandomSource random = this.random;
        Vec3 center = this.position();
        int phase = this.getPhase();
        if (phase == PHASE_CHARGING) {
            float charge = this.getCharge();
            if (charge < MERGE_AT) {
                Vec3 blue = center.add(chargeOffset(charge, this.getYRot(), this.getXRot(), -1));
                Vec3 red = center.add(chargeOffset(charge, this.getYRot(), this.getXRot(), 1));
                for (int i = 0; i < 3; i++) {
                    Vec3 dir = randomUnit(random);
                    double rad = 0.9 + random.nextDouble() * 0.9;
                    this.particle(new GlowParticleOptions(GlowParticleOptions.DOT, random.nextBoolean() ? 0x3C7DFF : 0xA8DCFF, 0.9F,
                            0.1F + random.nextFloat() * 0.08F, 6, 1.0F), blue.add(dir.scale(rad)), dir.scale(-rad / 6.0));
                    Vec3 dir2 = randomUnit(random);
                    this.particle(new GlowParticleOptions(GlowParticleOptions.DOT, random.nextBoolean() ? 0xFF2A1A : 0xFF8A60, 0.9F,
                            0.1F + random.nextFloat() * 0.08F, 6, 0.8F), red.add(dir2.scale(0.25)), dir2.scale(0.12));
                }
                // the arc of energy between them
                if (this.tickCount % 2 == 0) {
                    for (int i = 0; i <= 6; i++) {
                        double t = i / 6.0;
                        Vec3 p = blue.lerp(red, t).add(randomUnit(random).scale(0.12));
                        this.particle(new GlowParticleOptions(GlowParticleOptions.DOT, 0xB070FF, 0.6F, 0.08F, 3, 1.0F), p, Vec3.ZERO);
                    }
                }
            } else {
                float radius = this.getRadius();
                for (int i = 0; i < 6; i++) {
                    Vec3 dir = randomUnit(random);
                    double rad = radius * (1.4 + random.nextDouble());
                    this.particle(new GlowParticleOptions(GlowParticleOptions.DOT, random.nextBoolean() ? 0x9A3CFF : 0xE0B0FF, 0.9F,
                            0.15F + random.nextFloat() * 0.15F, 7, 1.0F), center.add(dir.scale(rad)), dir.scale(-rad / 7.0));
                }
            }
            return;
        }

        float radius = this.getRadius();
        if (radius < 0.1F) {
            return;
        }
        Vec3 velocity = this.getDeltaMovement();
        Vec3 forward = velocity.lengthSqr() > 1.0E-4 ? velocity.normalize() : new Vec3(0.0, 0.0, 1.0);
        Vec3 right = forward.cross(new Vec3(0.0, 1.0, 0.0));
        right = right.lengthSqr() < 1.0E-4 ? new Vec3(1.0, 0.0, 0.0) : right.normalize();
        Vec3 up = right.cross(forward).normalize();

        // glowing shell shedding imaginary mass
        for (int i = 0; i < 12; i++) {
            Vec3 dir = randomUnit(random);
            Vec3 pos = center.add(dir.scale(radius * (0.9 + random.nextDouble() * 0.25)));
            int color = switch (random.nextInt(4)) {
                case 0 -> 0x7A2CFF;
                case 1 -> 0xB45CFF;
                case 2 -> 0xE6C8FF;
                default -> 0x5A3CFF;
            };
            this.particle(new GlowParticleOptions(GlowParticleOptions.DOT, color, 0.8F, 0.35F + random.nextFloat() * 0.45F,
                    10 + random.nextInt(10), 0.9F), pos, dir.scale(0.06).subtract(forward.scale(0.1)));
        }
        // a blue and red double helix left behind in its wake
        for (int strand = 0; strand < 2; strand++) {
            double angle = this.tickCount * 0.55 + strand * Math.PI;
            Vec3 offset = right.scale(Math.cos(angle)).add(up.scale(Math.sin(angle))).scale(radius * 1.15);
            int color = strand == 0 ? 0x3C8CFF : 0xFF3A2A;
            for (int k = 0; k < 2; k++) {
                Vec3 pos = center.add(offset).subtract(forward.scale(k * 0.6));
                this.particle(new GlowParticleOptions(GlowParticleOptions.DOT, color, 0.9F, 0.35F, 24, 1.0F), pos, Vec3.ZERO);
            }
        }
        if (random.nextInt(2) == 0) {
            Vec3 dir = randomUnit(random);
            this.particle(GlowParticleOptions.spark(0xF4E4FF, 0.5F, 5), center.add(dir.scale(radius * 1.05)), dir.scale(0.2));
        }
    }
}
