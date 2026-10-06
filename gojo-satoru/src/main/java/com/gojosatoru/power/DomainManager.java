package com.gojosatoru.power;

import com.gojosatoru.GojoRegistry;
import com.gojosatoru.network.GojoNetwork.DomainPayload;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Iterator;
import java.util.List;
import java.util.UUID;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.fabricmc.fabric.api.networking.v1.PlayerLookup;
import net.fabricmc.fabric.api.networking.v1.ServerPlayConnectionEvents;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.minecraft.core.BlockPos;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import org.jspecify.annotations.Nullable;

/**
 * Domain Expansion: Infinite Void. A starry barrier closes around Gojo; everyone else inside is
 * flooded with infinite information and can't move, while Gojo's cursed energy flows three times faster.
 */
public final class DomainManager {
    public static final int RADIUS = 14;
    public static final int DURATION = 400;
    private static final int FORM_TICKS = 16;
    private static final int CLOSE_TICKS = 12;

    private static final List<Domain> DOMAINS = new ArrayList<>();
    private static int nextId = 1;

    private static final class Domain {
        final int id;
        final UUID owner;
        final ServerLevel level;
        final Vec3 center;
        final List<BlockPos> shell;
        final List<BlockPos> placed = new ArrayList<>();
        int placedIndex;
        int closeTotal;
        int age;
        int closing = -1;

        Domain(int id, UUID owner, ServerLevel level, Vec3 center, List<BlockPos> shell) {
            this.id = id;
            this.owner = owner;
            this.level = level;
            this.center = center;
            this.shell = shell;
        }

        boolean contains(Vec3 pos) {
            return pos.distanceTo(this.center) < RADIUS - 0.5;
        }
    }

    private DomainManager() {
    }

    public static void init() {
        ServerTickEvents.END_SERVER_TICK.register(DomainManager::tick);
        ServerLifecycleEvents.SERVER_STOPPING.register(server -> {
            for (Domain domain : DOMAINS) {
                for (BlockPos pos : domain.placed) {
                    removeBarrier(domain.level, pos);
                }
            }
            DOMAINS.clear();
        });
        ServerPlayConnectionEvents.JOIN.register((handler, sender, server) -> {
            ServerPlayer player = handler.player;
            for (Domain domain : DOMAINS) {
                if (domain.level == player.level() && domain.closing < 0) {
                    ServerPlayNetworking.send(player, payload(domain, true));
                }
            }
        });
    }

    @Nullable
    private static Domain find(UUID owner) {
        for (Domain domain : DOMAINS) {
            if (domain.owner.equals(owner)) {
                return domain;
            }
        }
        return null;
    }

    public static boolean hasDomain(ServerPlayer player) {
        return find(player.getUUID()) != null;
    }

    public static boolean insideOwnDomain(ServerPlayer player) {
        Domain domain = find(player.getUUID());
        return domain != null && domain.closing < 0 && domain.level == player.level() && domain.contains(player.position());
    }

    public static void toggle(ServerPlayer player, GojoState state) {
        Domain existing = find(player.getUUID());
        if (existing != null) {
            if (existing.closing < 0) {
                existing.closing = 0;
            }
            return;
        }
        if (!GojoPowers.trySpend(player, state, Ability.DOMAIN)) {
            return;
        }
        open(player);
    }

    public static void close(ServerPlayer player) {
        Domain domain = find(player.getUUID());
        if (domain != null && domain.closing < 0) {
            domain.closing = 0;
        }
    }

    private static void open(ServerPlayer player) {
        ServerLevel level = player.level();
        Vec3 center = player.position();
        BlockPos origin = BlockPos.containing(center);
        List<BlockPos> shell = new ArrayList<>();
        double inner = RADIUS - 0.75;
        double outer = RADIUS + 0.5;
        for (int dx = -RADIUS - 1; dx <= RADIUS + 1; dx++) {
            for (int dy = -RADIUS - 1; dy <= RADIUS + 1; dy++) {
                for (int dz = -RADIUS - 1; dz <= RADIUS + 1; dz++) {
                    BlockPos pos = origin.offset(dx, dy, dz);
                    double distance = Vec3.atCenterOf(pos).distanceTo(center);
                    if (distance >= inner && distance < outer && level.isInWorldBounds(pos)) {
                        shell.add(pos);
                    }
                }
            }
        }
        // The dome rises from the ground and seals overhead.
        shell.sort(Comparator.comparingInt(BlockPos::getY));
        Domain domain = new Domain(nextId++, player.getUUID(), level, center, shell);
        DOMAINS.add(domain);

        GojoPowers.revealSixEyes(player, DURATION + 40);
        GojoEffects.castName(player, Ability.DOMAIN);
        GojoEffects.send(level, Fx.DOMAIN_OPEN, center, Vec3.ZERO, RADIUS, 128.0);
        DomainPayload payload = payload(domain, true);
        for (ServerPlayer other : PlayerLookup.world(level)) {
            ServerPlayNetworking.send(other, payload);
        }
        GojoEffects.sound(level, center, SoundEvents.END_PORTAL_SPAWN, 3.0F, 0.8F);
        GojoEffects.sound(level, center, SoundEvents.BEACON_ACTIVATE, 4.0F, 0.5F);
        GojoEffects.sound(level, center, SoundEvents.ELDER_GUARDIAN_CURSE, 1.5F, 0.6F);
    }

    private static DomainPayload payload(Domain domain, boolean active) {
        return new DomainPayload(domain.id, domain.center, RADIUS, Math.max(0, DURATION - domain.age), active);
    }

    private static void tick(MinecraftServer server) {
        Iterator<Domain> it = DOMAINS.iterator();
        while (it.hasNext()) {
            Domain domain = it.next();
            domain.age++;
            ServerPlayer owner = server.getPlayerList().getPlayer(domain.owner);
            if (domain.closing < 0 && (owner == null || !owner.isAlive() || owner.level() != domain.level
                    || !GojoPowers.isGojo(owner) || domain.age >= DURATION)) {
                domain.closing = 0;
            }
            if (domain.closing >= 0) {
                if (tickClose(domain, owner)) {
                    it.remove();
                }
                continue;
            }
            int target = (int) Math.ceil(domain.shell.size() * Math.min(1.0, domain.age / (double) FORM_TICKS));
            while (domain.placedIndex < target) {
                BlockPos pos = domain.shell.get(domain.placedIndex++);
                if (domain.level.getBlockState(pos).isAir()) {
                    domain.level.setBlock(pos, GojoRegistry.VOID_BARRIER.defaultBlockState(), Block.UPDATE_CLIENTS);
                    domain.level.scheduleTick(pos, GojoRegistry.VOID_BARRIER, DURATION + 100);
                    domain.placed.add(pos);
                }
            }
            affectVictims(domain, owner);
            if (domain.age % 40 == 0) {
                GojoEffects.sound(domain.level, domain.center, SoundEvents.BEACON_AMBIENT, 3.0F, 0.5F);
            }
        }
    }

    private static void affectVictims(Domain domain, ServerPlayer owner) {
        ServerLevel level = domain.level;
        DamageSource source = GojoRegistry.damage(level, GojoRegistry.VOID_DAMAGE, owner, owner);
        for (LivingEntity victim : level.getEntitiesOfClass(LivingEntity.class, new AABB(domain.center, domain.center).inflate(RADIUS),
                e -> e.isAlive() && e != owner && domain.contains(e.position()))) {
            if (victim instanceof Player player && (player.isCreative() || player.isSpectator())) {
                continue;
            }
            victim.addEffect(new MobEffectInstance(MobEffects.SLOWNESS, 30, 6, false, false, true));
            victim.addEffect(new MobEffectInstance(MobEffects.WEAKNESS, 30, 3, false, false, true));
            victim.addEffect(new MobEffectInstance(MobEffects.MINING_FATIGUE, 30, 3, false, false, true));
            victim.addEffect(new MobEffectInstance(MobEffects.GLOWING, 30, 0, false, false, false));
            if (victim instanceof Mob mob) {
                mob.getNavigation().stop();
                mob.setTarget(null);
                mob.setDeltaMovement(0.0, Math.min(0.0, mob.getDeltaMovement().y), 0.0);
            }
            if (victim instanceof ServerPlayer player) {
                player.addEffect(new MobEffectInstance(MobEffects.NAUSEA, 80, 0, false, false, true));
            }
            if ((domain.age + victim.getId()) % 30 == 0) {
                victim.hurtServer(level, source, 3.0F);
                GojoEffects.send(level, Fx.OVERLOAD, victim.getEyePosition(), Vec3.ZERO, victim.getBbWidth(), 64.0);
            }
        }
    }

    /** Returns true once the barrier is fully gone. */
    private static boolean tickClose(Domain domain, @Nullable ServerPlayer owner) {
        if (domain.closing == 0) {
            domain.placed.sort(Comparator.comparingInt((BlockPos pos) -> pos.getY()).reversed());
            domain.closeTotal = domain.placed.size();
            GojoEffects.send(domain.level, Fx.DOMAIN_CLOSE, domain.center, Vec3.ZERO, RADIUS, 128.0);
            DomainPayload payload = payload(domain, false);
            for (ServerPlayer other : PlayerLookup.world(domain.level)) {
                ServerPlayNetworking.send(other, payload);
            }
            GojoEffects.sound(domain.level, domain.center, SoundEvents.GLASS_BREAK, 3.0F, 0.5F);
            GojoEffects.sound(domain.level, domain.center, SoundEvents.BEACON_DEACTIVATE, 3.0F, 0.6F);
            if (owner != null) {
                GojoState state = GojoPowers.state(owner);
                state.sixEyesTicks = Math.min(state.sixEyesTicks, 20);
            }
        }
        domain.closing++;
        int targetRemoved = (int) Math.ceil(domain.closeTotal * Math.min(1.0, domain.closing / (double) CLOSE_TICKS));
        int toRemove = targetRemoved - (domain.closeTotal - domain.placed.size());
        Iterator<BlockPos> it = domain.placed.iterator();
        for (int i = 0; i < toRemove && it.hasNext(); i++) {
            removeBarrier(domain.level, it.next());
            it.remove();
        }
        return domain.placed.isEmpty() && domain.closing >= CLOSE_TICKS;
    }

    private static void removeBarrier(ServerLevel level, BlockPos pos) {
        if (level.getBlockState(pos).is(GojoRegistry.VOID_BARRIER)) {
            level.setBlock(pos, Blocks.AIR.defaultBlockState(), Block.UPDATE_CLIENTS);
        }
    }
}
