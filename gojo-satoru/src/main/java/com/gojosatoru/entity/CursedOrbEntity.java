package com.gojosatoru.entity;

import com.gojosatoru.particle.GlowParticleOptions;
import java.util.UUID;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.InterpolationHandler;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.ClipContext;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;
import org.jspecify.annotations.Nullable;

/**
 * Base for the cursed technique orbs. They are driven entirely by the server; the client only
 * interpolates their position and spawns particles. The entity position is the orb's center.
 */
public abstract class CursedOrbEntity extends Entity {
    private final InterpolationHandler interpolation = new InterpolationHandler(this, 2);
    @Nullable
    private UUID ownerId;
    @Nullable
    private ServerPlayer cachedOwner;

    protected CursedOrbEntity(EntityType<?> type, Level level) {
        super(type, level);
        this.noPhysics = true;
        this.setNoGravity(true);
    }

    public void setOwner(ServerPlayer owner) {
        this.ownerId = owner.getUUID();
        this.cachedOwner = owner;
    }

    @Nullable
    protected ServerPlayer owner() {
        if (this.cachedOwner != null && !this.cachedOwner.isRemoved()) {
            return this.cachedOwner;
        }
        if (this.ownerId != null && this.level() instanceof ServerLevel serverLevel) {
            this.cachedOwner = serverLevel.getServer().getPlayerList().getPlayer(this.ownerId);
            return this.cachedOwner;
        }
        return null;
    }

    protected boolean isOwner(Entity entity) {
        return this.ownerId != null && this.ownerId.equals(entity.getUUID());
    }

    @Override
    public void tick() {
        super.tick();
        if (!this.level().isClientSide() && this.tickCount == 1) {
            OrbTracker.track(this);
        }
        if (this.level().isClientSide()) {
            this.interpolation.interpolate();
            this.clientTick();
        } else {
            this.serverTick((ServerLevel) this.level());
        }
    }

    protected abstract void serverTick(ServerLevel level);

    protected abstract void clientTick();

    @Override
    public InterpolationHandler getInterpolation() {
        return this.interpolation;
    }

    @Override
    public boolean hurtServer(ServerLevel level, DamageSource source, float amount) {
        return false;
    }

    @Override
    public boolean isPickable() {
        return false;
    }

    @Override
    public boolean isPushable() {
        return false;
    }

    @Override
    public boolean shouldRenderAtSqrDistance(double distance) {
        return distance < 256.0 * 256.0;
    }

    @Override
    public boolean displayFireAnimation() {
        return false;
    }

    @Override
    protected void readAdditionalSaveData(ValueInput input) {
    }

    @Override
    protected void addAdditionalSaveData(ValueOutput output) {
    }

    // -------------------------------------------------------------------------------- helpers ---

    /**
     * Where the player is looking. If the ray hits a block, the point is pulled back toward the player
     * and lifted off the surface by {@code clearance} so the orb floats in front of it instead of sinking in.
     */
    protected static Vec3 aimPoint(Player player, double distance, double clearance) {
        Vec3 eye = player.getEyePosition();
        Vec3 look = player.getLookAngle();
        Vec3 end = eye.add(look.scale(distance));
        BlockHitResult hit = player.level().clip(new ClipContext(eye, end, ClipContext.Block.COLLIDER, ClipContext.Fluid.NONE, player));
        if (hit.getType() == HitResult.Type.MISS) {
            return end;
        }
        Vec3 point = hit.getLocation().add(hit.getDirection().getUnitVec3().scale(clearance));
        if (point.distanceTo(eye) < 2.0) {
            point = eye.add(look.scale(2.0));
        }
        return point;
    }

    /** A spot just in front of the player's right hand. */
    protected static Vec3 handPoint(Player player, double forward) {
        Vec3 look = player.getLookAngle();
        Vec3 right = look.cross(new Vec3(0.0, 1.0, 0.0));
        right = right.lengthSqr() < 1.0E-4 ? new Vec3(1.0, 0.0, 0.0) : right.normalize();
        return player.getEyePosition().add(look.scale(forward)).add(right.scale(0.35)).add(0.0, -0.3, 0.0);
    }

    protected static Vec3 randomUnit(net.minecraft.util.RandomSource random) {
        double z = random.nextDouble() * 2.0 - 1.0;
        double a = random.nextDouble() * Math.PI * 2.0;
        double r = Math.sqrt(1.0 - z * z);
        return new Vec3(r * Math.cos(a), z, r * Math.sin(a));
    }

    protected void particle(GlowParticleOptions options, Vec3 pos, Vec3 velocity) {
        this.level().addParticle(options, pos.x, pos.y, pos.z, velocity.x, velocity.y, velocity.z);
    }
}
