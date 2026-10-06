package com.gojosatoru.power;

import com.gojosatoru.GojoRegistry;
import java.util.Iterator;
import java.util.Map;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.tags.DamageTypeTags;
import net.minecraft.util.Mth;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.damagesource.DamageTypes;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.monster.Enemy;
import net.minecraft.world.entity.projectile.Projectile;
import net.minecraft.world.phys.Vec3;

/**
 * Infinity: the space around Gojo never quite ends, so nothing reaches him. Damage is cancelled,
 * projectiles slow to a stop in mid-air and monsters are held at arm's length.
 */
public final class InfinityHandler {
    private static final double PROJECTILE_RANGE = 4.5;
    private static final double STOP_DISTANCE = 1.3;

    private InfinityHandler() {
    }

    public static boolean allowDamage(LivingEntity entity, DamageSource source, float amount) {
        if (!(entity instanceof ServerPlayer player)) {
            return true;
        }
        GojoForm form = GojoPowers.form(player);
        if (!form.transformed() || !form.infinity()) {
            return true;
        }
        if (source.is(DamageTypeTags.BYPASSES_INVULNERABILITY) || source.is(DamageTypes.STARVE)) {
            return true;
        }
        // Another sorcerer's Hollow Purple tears straight through Infinity.
        if (source.is(GojoRegistry.PURPLE_DAMAGE) && source.getEntity() != player) {
            return true;
        }
        GojoState state = GojoPowers.state(player);
        float cost = 5.0F + amount * 1.5F;
        if (!player.getAbilities().instabuild) {
            if (state.energy < cost) {
                return true; // out of cursed energy: Infinity falters
            }
            state.energy -= cost;
        }

        ServerLevel level = player.level();
        Vec3 center = player.position().add(0.0, player.getBbHeight() * 0.55, 0.0);
        Vec3 dir;
        Entity direct = source.getDirectEntity();
        if (direct != null && direct != player) {
            dir = direct.position().add(0.0, direct.getBbHeight() * 0.5, 0.0).subtract(center);
        } else if (source.getSourcePosition() != null) {
            dir = source.getSourcePosition().subtract(center);
        } else if (source.is(DamageTypeTags.IS_FALL)) {
            dir = new Vec3(0.0, -1.0, 0.0);
        } else {
            dir = new Vec3(0.0, 0.0, 0.0);
        }
        dir = dir.lengthSqr() < 1.0E-4 ? new Vec3(0.0, -1.0, 0.0) : dir.normalize();

        Vec3 contact = center.add(dir.scale(source.is(DamageTypeTags.IS_FALL) ? 1.0 : 0.9));
        GojoEffects.send(level, Fx.INFINITY_BLOCK, contact, dir, 1.0F, 48.0);
        if (state.ticks - state.lastInfinitySound > 4) {
            state.lastInfinitySound = state.ticks;
            GojoEffects.sound(level, contact, SoundEvents.AMETHYST_BLOCK_HIT, 1.2F, 1.8F);
            GojoEffects.sound(level, contact, SoundEvents.AMETHYST_BLOCK_CHIME, 0.6F, 2.0F);
        }
        if (direct instanceof LivingEntity attacker && attacker != player && attacker.distanceTo(player) < 5.0F) {
            Vec3 push = attacker.position().subtract(player.position()).multiply(1.0, 0.0, 1.0);
            if (push.lengthSqr() > 1.0E-4) {
                attacker.setDeltaMovement(attacker.getDeltaMovement().add(push.normalize().scale(0.9)).add(0.0, 0.25, 0.0));
                attacker.hurtMarked = true;
            }
        }
        if (source.is(DamageTypeTags.IS_FIRE)) {
            player.clearFire();
        }
        return false;
    }

    public static void tick(ServerPlayer player, GojoState state, GojoForm form) {
        ServerLevel level = player.level();
        if (form.infinity() && player.isAlive()) {
            Vec3 center = player.position().add(0.0, player.getBbHeight() * 0.55, 0.0);
            for (Projectile projectile : level.getEntitiesOfClass(Projectile.class, player.getBoundingBox().inflate(PROJECTILE_RANGE + 1.0),
                    p -> p.isAlive() && p.getOwner() != player)) {
                Vec3 toPlayer = center.subtract(projectile.position());
                double distance = toPlayer.length();
                boolean alreadyFrozen = state.frozen.containsKey(projectile.getId());
                Vec3 velocity = projectile.getDeltaMovement();
                if (distance > PROJECTILE_RANGE || (!alreadyFrozen && velocity.dot(toPlayer) <= 0.0)) {
                    continue;
                }
                double k = Mth.clamp((distance - STOP_DISTANCE) / (PROJECTILE_RANGE - STOP_DISTANCE), 0.0, 1.0);
                projectile.setDeltaMovement(velocity.scale(k * k * 0.55));
                projectile.setNoGravity(true);
                if (distance < STOP_DISTANCE) {
                    projectile.setPos(center.subtract(toPlayer.normalize().scale(STOP_DISTANCE)));
                }
                projectile.hurtMarked = true;
                if (!alreadyFrozen) {
                    state.frozen.put(projectile.getId(), projectile);
                    GojoEffects.send(level, Fx.INFINITY_BLOCK, projectile.position(), toPlayer.normalize().scale(-1.0), 0.6F, 48.0);
                    GojoEffects.sound(level, projectile.position(), SoundEvents.AMETHYST_BLOCK_CHIME, 0.8F, 1.9F);
                }
            }
            for (Mob mob : level.getEntitiesOfClass(Mob.class, player.getBoundingBox().inflate(1.3), m -> m instanceof Enemy && m.isAlive())) {
                Vec3 away = mob.position().subtract(player.position()).multiply(1.0, 0.0, 1.0);
                if (away.lengthSqr() < 1.0E-4) {
                    away = new Vec3(1.0, 0.0, 0.0);
                }
                mob.setDeltaMovement(mob.getDeltaMovement().add(away.normalize().scale(0.3)).add(0.0, 0.04, 0.0));
                mob.hurtMarked = true;
            }
        }
        Iterator<Map.Entry<Integer, Projectile>> it = state.frozen.entrySet().iterator();
        while (it.hasNext()) {
            Projectile projectile = it.next().getValue();
            if (!projectile.isAlive() || !form.infinity() || !form.transformed() || projectile.level() != level
                    || projectile.distanceToSqr(player) > 36.0) {
                projectile.setNoGravity(false);
                it.remove();
            }
        }
    }

    public static void releaseAll(GojoState state) {
        for (Projectile projectile : state.frozen.values()) {
            projectile.setNoGravity(false);
        }
        state.frozen.clear();
    }
}
