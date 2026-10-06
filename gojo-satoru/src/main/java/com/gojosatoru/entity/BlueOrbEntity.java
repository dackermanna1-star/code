package com.gojosatoru.entity;

import com.gojosatoru.GojoRegistry;
import com.gojosatoru.particle.GlowParticleOptions;
import com.gojosatoru.power.Ability;
import com.gojosatoru.power.Fx;
import com.gojosatoru.power.GojoEffects;
import com.gojosatoru.power.GojoPowers;
import com.gojosatoru.power.GojoState;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.core.BlockPos;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.util.RandomSource;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.ExperienceOrb;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.item.FallingBlockEntity;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.Vec3;

/**
 * Lapse: Blue. A point of infinite attraction that follows the caster's aim while the key is held,
 * dragging in mobs, items and chunks of terrain, then implodes when released.
 */
public class BlueOrbEntity extends CursedOrbEntity {
    private static final EntityDataAccessor<Float> DATA_SCALE = SynchedEntityData.defineId(BlueOrbEntity.class, EntityDataSerializers.FLOAT);

    public static final double PULL_RADIUS = 9.0;
    private static final int MIN_LIFE = 30;
    private static final int MAX_LIFE = 160;
    private static final int COLLAPSE_TICKS = 10;
    private static final double RIP_RADIUS = 4.0;

    private int life;
    private int collapse = -1;
    private final List<FallingBlockEntity> ripped = new ArrayList<>();

    public BlueOrbEntity(EntityType<? extends BlueOrbEntity> type, Level level) {
        super(type, level);
    }

    public static void cast(ServerPlayer player, GojoState state) {
        if (state.blue != null && state.blue.isAlive()) {
            return;
        }
        if (!GojoPowers.trySpend(player, state, Ability.BLUE)) {
            return;
        }
        ServerLevel level = player.level();
        BlueOrbEntity orb = new BlueOrbEntity(GojoRegistry.BLUE, level);
        orb.setOwner(player);
        Vec3 start = handPoint(player, 1.5);
        orb.setPos(start.x, start.y, start.z);
        level.addFreshEntity(orb);
        state.blue = orb;
        state.blueHeld = true;
        player.swing(net.minecraft.world.InteractionHand.MAIN_HAND, true);
        GojoEffects.castName(player, Ability.BLUE);
        GojoEffects.sound(level, start, SoundEvents.BEACON_POWER_SELECT, 1.5F, 0.6F);
        GojoEffects.sound(level, start, SoundEvents.CONDUIT_ACTIVATE, 1.2F, 1.5F);
    }

    @Override
    protected void defineSynchedData(SynchedEntityData.Builder builder) {
        builder.define(DATA_SCALE, 0.0F);
    }

    public float getScale() {
        return this.entityData.get(DATA_SCALE);
    }

    public boolean isCollapsing() {
        return this.collapse >= 0;
    }

    /** Collapses right away (used when Gojo reverts, dies or leaves). */
    public void forceCollapse() {
        if (this.collapse < 0) {
            this.collapse = COLLAPSE_TICKS - 2;
        }
    }

    // ----------------------------------------------------------------------------------- server ---

    @Override
    protected void serverTick(ServerLevel level) {
        ServerPlayer owner = this.owner();
        this.life++;
        if (this.collapse >= 0) {
            this.tickCollapse(level, owner);
            return;
        }
        GojoState state = owner == null ? null : GojoPowers.state(owner);
        boolean ownerOk = owner != null && owner.isAlive() && owner.level() == level && GojoPowers.isGojo(owner)
                && state != null && state.blue == this;
        if (!ownerOk || this.life > MAX_LIFE || (!state.blueHeld && this.life > MIN_LIFE)) {
            this.startCollapse(level);
            return;
        }
        if (!owner.getAbilities().instabuild) {
            state.energy -= 1.2F;
            if (state.energy <= 0.0F) {
                state.energy = 0.0F;
                this.startCollapse(level);
                return;
            }
        }
        this.entityData.set(DATA_SCALE, Math.min(1.0F, this.getScale() + 0.08F));

        Vec3 target = aimPoint(owner, 13.0, 1.8);
        Vec3 step = target.subtract(this.position()).scale(0.3);
        if (step.length() > 1.4) {
            step = step.normalize().scale(1.4);
        }
        Vec3 next = this.position().add(step);
        this.setPos(next.x, next.y, next.z);

        this.pull(level, owner, 1.0);
        if (this.life % 8 == 0) {
            DamageSource source = GojoRegistry.damage(level, GojoRegistry.BLUE_DAMAGE, this, owner);
            for (LivingEntity victim : level.getEntitiesOfClass(LivingEntity.class, this.getBoundingBox().inflate(2.0),
                    e -> e.isAlive() && e != owner && e.position().distanceTo(this.position()) < 2.6)) {
                victim.hurtServer(level, source, 4.0F);
            }
        }
        if (this.life > 6 && this.life % 2 == 0 && GojoRegistry.blockDestruction(level)) {
            this.ripBlocks(level);
        }
        if (this.life % 25 == 1) {
            GojoEffects.sound(level, this.position(), SoundEvents.BEACON_AMBIENT, 2.0F, 1.6F);
        }
    }

    private void pull(ServerLevel level, ServerPlayer owner, double power) {
        Vec3 center = this.position();
        for (Entity entity : level.getEntities(this, this.getBoundingBox().inflate(PULL_RADIUS),
                e -> e != owner && e.isAlive() && !e.isSpectator() && !(e instanceof CursedOrbEntity))) {
            Vec3 to = center.subtract(entity.position().add(0.0, entity.getBbHeight() * 0.5, 0.0));
            double distance = to.length();
            if (distance > PULL_RADIUS || distance < 0.05) {
                continue;
            }
            double falloff = 1.0 - distance / PULL_RADIUS;
            double strength;
            if (entity instanceof ItemEntity || entity instanceof ExperienceOrb) {
                strength = 0.3;
            } else if (entity instanceof FallingBlockEntity) {
                strength = 0.28;
            } else {
                strength = 0.12 + 0.3 * falloff;
            }
            Vec3 dir = to.normalize();
            Vec3 swirl = dir.cross(new Vec3(0.0, 1.0, 0.0)).scale(0.12 * falloff);
            Vec3 velocity = entity.getDeltaMovement().scale(0.72).add(dir.scale(strength * power * (0.6 + falloff))).add(swirl);
            if (distance < 1.0) {
                velocity = velocity.scale(0.4);
            }
            entity.setDeltaMovement(velocity);
            entity.hurtMarked = true;
            entity.resetFallDistance();
            if (entity instanceof FallingBlockEntity block && distance < 0.9 && this.ripped.remove(block)) {
                this.crush(level, block);
            }
        }
    }

    private void ripBlocks(ServerLevel level) {
        RandomSource random = this.random;
        Vec3 center = this.position();
        for (int i = 0; i < 4; i++) {
            Vec3 offset = randomUnit(random).scale(random.nextDouble() * RIP_RADIUS);
            BlockPos pos = BlockPos.containing(center.add(offset));
            BlockState state = level.getBlockState(pos);
            if (state.isAir() || state.hasBlockEntity() || !state.getFluidState().isEmpty() || state.is(GojoRegistry.VOID_BARRIER)) {
                continue;
            }
            float hardness = state.getDestroySpeed(level, pos);
            if (hardness < 0.0F || hardness > 30.0F) {
                continue;
            }
            FallingBlockEntity block = FallingBlockEntity.fall(level, pos, state);
            block.disableDrop();
            block.dropItem = false;
            block.setDeltaMovement(0.0, 0.25, 0.0);
            this.ripped.add(block);
        }
        this.ripped.removeIf(block -> !block.isAlive());
    }

    private void crush(ServerLevel level, FallingBlockEntity block) {
        level.levelEvent(2001, block.blockPosition(), Block.getId(block.getBlockState()));
        block.discard();
    }

    private void startCollapse(ServerLevel level) {
        this.collapse = 0;
        GojoEffects.sound(level, this.position(), SoundEvents.BEACON_DEACTIVATE, 1.5F, 1.8F);
    }

    private void tickCollapse(ServerLevel level, ServerPlayer owner) {
        this.collapse++;
        this.entityData.set(DATA_SCALE, Math.max(0.15F, 1.0F - this.collapse / (float) COLLAPSE_TICKS));
        if (owner != null) {
            this.pull(level, owner, 2.2);
        }
        if (this.collapse < COLLAPSE_TICKS) {
            return;
        }
        Vec3 center = this.position();
        DamageSource source = GojoRegistry.damage(level, GojoRegistry.BLUE_DAMAGE, this, owner);
        for (LivingEntity victim : level.getEntitiesOfClass(LivingEntity.class, this.getBoundingBox().inflate(5.0),
                e -> e.isAlive() && e != owner)) {
            double distance = victim.position().add(0.0, victim.getBbHeight() * 0.5, 0.0).distanceTo(center);
            if (distance < 5.0) {
                victim.hurtServer(level, source, (float) (6.0 + 14.0 * (1.0 - distance / 5.0)));
                victim.setDeltaMovement(victim.getDeltaMovement().scale(0.2));
                victim.hurtMarked = true;
            }
        }
        for (FallingBlockEntity block : this.ripped) {
            if (block.isAlive()) {
                this.crush(level, block);
            }
        }
        this.ripped.clear();
        GojoEffects.send(level, Fx.BLUE_COLLAPSE, center, 1.0F);
        GojoEffects.sound(level, center, SoundEvents.GENERIC_EXPLODE, 2.0F, 1.5F);
        GojoEffects.sound(level, center, SoundEvents.BREEZE_WIND_CHARGE_BURST, 2.0F, 0.5F);
        if (owner != null && GojoPowers.state(owner).blue == this) {
            GojoPowers.state(owner).blue = null;
        }
        this.discard();
    }

    // ----------------------------------------------------------------------------------- client ---

    @Override
    protected void clientTick() {
        float scale = this.getScale();
        if (scale < 0.05F) {
            return;
        }
        RandomSource random = this.random;
        Vec3 center = this.position();
        int[] colors = {0x2E6BFF, 0x59A8FF, 0x9FDCFF, 0xFFFFFF};
        for (int i = 0; i < 11; i++) {
            Vec3 dir = randomUnit(random);
            double radius = (2.0 + random.nextDouble() * 4.5) * scale;
            Vec3 pos = center.add(dir.scale(radius));
            int life = 10 + random.nextInt(8);
            Vec3 tangent = dir.cross(new Vec3(0.0, 1.0, 0.0)).scale(0.06);
            Vec3 velocity = dir.scale(-radius / life).add(tangent);
            int color = colors[random.nextInt(colors.length)];
            this.particle(new GlowParticleOptions(GlowParticleOptions.DOT, color, 0.9F, 0.16F + random.nextFloat() * 0.22F, life, 1.0F),
                    pos, velocity);
        }
        // a thin accretion ring spinning around the core
        double spin = this.tickCount * 0.45;
        for (int i = 0; i < 3; i++) {
            double a = spin + i * (Math.PI * 2.0 / 3.0);
            double r = 1.3 * scale;
            Vec3 pos = center.add(Math.cos(a) * r, Math.sin(a * 0.5) * 0.25, Math.sin(a) * r);
            this.particle(new GlowParticleOptions(GlowParticleOptions.SPARK, 0xBFE6FF, 1.0F, 0.18F * scale, 6, 1.0F), pos, Vec3.ZERO);
        }
        if (this.isCollapsing() || random.nextInt(3) == 0) {
            Vec3 dir = randomUnit(random);
            Vec3 pos = center.add(dir.scale(0.6 * scale));
            this.particle(GlowParticleOptions.spark(0xFFFFFF, 0.25F, 5), pos, dir.scale(0.05));
        }
    }
}
