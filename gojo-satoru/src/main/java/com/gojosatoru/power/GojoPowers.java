package com.gojosatoru.power;

import com.gojosatoru.GojoMod;
import com.gojosatoru.GojoRegistry;
import com.gojosatoru.entity.BlueOrbEntity;
import com.gojosatoru.entity.HollowPurpleEntity;
import com.gojosatoru.entity.RedOrbEntity;
import com.gojosatoru.network.GojoNetwork.AbilityPayload;
import com.gojosatoru.network.GojoNetwork.StatsPayload;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import net.fabricmc.fabric.api.entity.event.v1.ServerEntityWorldChangeEvents;
import net.fabricmc.fabric.api.entity.event.v1.ServerLivingEntityEvents;
import net.fabricmc.fabric.api.entity.event.v1.ServerPlayerEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.fabricmc.fabric.api.networking.v1.ServerPlayConnectionEvents;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.minecraft.ChatFormatting;
import net.minecraft.core.Direction;
import net.minecraft.core.Holder;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.MutableComponent;
import net.minecraft.resources.Identifier;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.ai.attributes.Attribute;
import net.minecraft.world.entity.ai.attributes.AttributeInstance;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.player.Abilities;
import net.minecraft.world.level.ClipContext;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;

/** Transformation, cursed energy and ability dispatch. */
public final class GojoPowers {
    private static final Map<UUID, GojoState> STATES = new HashMap<>();

    private static final float DEFAULT_FLY_SPEED = 0.05F;
    private static final float GOJO_FLY_SPEED = 0.085F;

    private record FormModifier(Holder<Attribute> attribute, Identifier id, double amount, AttributeModifier.Operation op) {
    }

    private static final List<FormModifier> MODIFIERS = List.of(
            new FormModifier(Attributes.MOVEMENT_SPEED, GojoMod.id("form_speed"), 0.35, AttributeModifier.Operation.ADD_MULTIPLIED_BASE),
            new FormModifier(Attributes.ATTACK_DAMAGE, GojoMod.id("form_strength"), 7.0, AttributeModifier.Operation.ADD_VALUE),
            new FormModifier(Attributes.ATTACK_KNOCKBACK, GojoMod.id("form_knockback"), 1.5, AttributeModifier.Operation.ADD_VALUE),
            new FormModifier(Attributes.JUMP_STRENGTH, GojoMod.id("form_jump"), 0.14, AttributeModifier.Operation.ADD_VALUE),
            new FormModifier(Attributes.SAFE_FALL_DISTANCE, GojoMod.id("form_fall"), 30.0, AttributeModifier.Operation.ADD_VALUE),
            new FormModifier(Attributes.STEP_HEIGHT, GojoMod.id("form_step"), 0.5, AttributeModifier.Operation.ADD_VALUE),
            new FormModifier(Attributes.MAX_HEALTH, GojoMod.id("form_health"), 20.0, AttributeModifier.Operation.ADD_VALUE),
            new FormModifier(Attributes.KNOCKBACK_RESISTANCE, GojoMod.id("form_knockback_resistance"), 0.8, AttributeModifier.Operation.ADD_VALUE));

    private GojoPowers() {
    }

    public static void init() {
        ServerTickEvents.END_SERVER_TICK.register(GojoPowers::tick);
        ServerPlayNetworking.registerGlobalReceiver(AbilityPayload.TYPE, (payload, context) -> handle(context.player(), payload));
        ServerLivingEntityEvents.ALLOW_DAMAGE.register(InfinityHandler::allowDamage);
        ServerPlayConnectionEvents.DISCONNECT.register((handler, server) -> onLeave(handler.player));
        ServerPlayerEvents.JOIN.register(GojoPowers::onJoin);
        ServerPlayerEvents.AFTER_RESPAWN.register((oldPlayer, newPlayer, alive) -> onRespawn(oldPlayer, newPlayer));
        ServerEntityWorldChangeEvents.AFTER_PLAYER_CHANGE_WORLD.register((player, origin, destination) -> cancelAbilities(player));
    }

    // ------------------------------------------------------------------------------- state ---

    public static GojoState state(ServerPlayer player) {
        return STATES.computeIfAbsent(player.getUUID(), uuid -> new GojoState());
    }

    public static GojoForm form(ServerPlayer player) {
        GojoForm form = player.getAttached(GojoRegistry.FORM);
        return form == null ? GojoForm.NONE : form;
    }

    public static boolean isGojo(ServerPlayer player) {
        return form(player).transformed();
    }

    private static void setForm(ServerPlayer player, GojoForm form) {
        if (!form.equals(form(player))) {
            player.setAttached(GojoRegistry.FORM, form);
        }
    }

    /** Takes the blindfold off for a while. Infinite Void keeps it off until the domain closes. */
    public static void revealSixEyes(ServerPlayer player, int ticks) {
        GojoState state = state(player);
        state.sixEyesTicks = Math.max(state.sixEyesTicks, ticks);
        setForm(player, form(player).withSixEyes(true));
    }

    // ------------------------------------------------------------------------ input handling ---

    private static void handle(ServerPlayer player, AbilityPayload payload) {
        Ability ability = Ability.byId(payload.ability());
        if (ability == null || player.isSpectator() || !player.isAlive()) {
            return;
        }
        GojoState state = state(player);
        if (ability == Ability.TRANSFORM) {
            if (payload.pressed() && state.cooldowns[Ability.TRANSFORM.ordinal()] == 0) {
                state.cooldowns[Ability.TRANSFORM.ordinal()] = Ability.TRANSFORM.cooldown;
                if (isGojo(player)) {
                    revert(player);
                } else {
                    transform(player);
                }
            }
            return;
        }
        if (!isGojo(player)) {
            if (payload.pressed()) {
                player.displayClientMessage(Component.literal("You need to transform first ")
                        .append(Component.literal("[").append(Component.keybind("key.gojo.transform")).append("]")
                                .withStyle(ChatFormatting.AQUA)), true);
            }
            return;
        }
        switch (ability) {
            case INFINITY -> {
                if (payload.pressed()) {
                    toggleInfinity(player, state);
                }
            }
            case BLUE -> {
                if (payload.pressed()) {
                    BlueOrbEntity.cast(player, state);
                } else {
                    state.blueHeld = false;
                }
            }
            case RED -> {
                if (payload.pressed()) {
                    RedOrbEntity.cast(player, state);
                }
            }
            case PURPLE -> {
                if (payload.pressed()) {
                    HollowPurpleEntity.cast(player, state);
                }
            }
            case DOMAIN -> {
                if (payload.pressed()) {
                    DomainManager.toggle(player, state);
                }
            }
            case TELEPORT -> {
                if (payload.pressed()) {
                    teleport(player, state);
                }
            }
            default -> {
            }
        }
    }

    /** Checks the cooldown and pays the cursed energy cost. Creative mode is free. */
    public static boolean trySpend(ServerPlayer player, GojoState state, Ability ability) {
        if (state.cooldowns[ability.ordinal()] > 0) {
            return false;
        }
        float cost = ability.cost * (DomainManager.insideOwnDomain(player) ? 0.5F : 1.0F);
        if (!player.getAbilities().instabuild) {
            if (state.energy < cost) {
                player.displayClientMessage(Component.literal("Not enough cursed energy!").withStyle(ChatFormatting.RED), true);
                GojoEffects.sound(player.level(), player.position(), SoundEvents.RESPAWN_ANCHOR_DEPLETE, 0.5F, 1.6F);
                return false;
            }
            state.energy -= cost;
        }
        state.cooldowns[ability.ordinal()] = ability.cooldown;
        return true;
    }

    // ------------------------------------------------------------------------ transformation ---

    public static void transform(ServerPlayer player) {
        GojoState state = state(player);
        ServerLevel level = player.level();
        setForm(player, form(player).withTransformed(true).withSixEyes(false));
        state.energy = GojoState.MAX_ENERGY;
        applyForm(player);
        player.setHealth(player.getMaxHealth());

        Vec3 pos = player.position();
        GojoEffects.send(level, Fx.TRANSFORM, pos, 1.0F);
        GojoEffects.sound(level, pos, SoundEvents.BEACON_ACTIVATE, 1.5F, 1.3F);
        GojoEffects.sound(level, pos, SoundEvents.AMETHYST_BLOCK_RESONATE, 2.0F, 0.7F);
        GojoEffects.sound(level, pos, SoundEvents.ILLUSIONER_CAST_SPELL, 1.0F, 1.4F);
        player.displayClientMessage(Component.literal("Throughout Heaven and Earth, I alone am the honored one.")
                .withStyle(ChatFormatting.AQUA, ChatFormatting.ITALIC), true);
        if (!state.helpShown) {
            state.helpShown = true;
            sendHelp(player);
        }
    }

    public static void revert(ServerPlayer player) {
        ServerLevel level = player.level();
        cancelAbilities(player);
        setForm(player, form(player).withTransformed(false).withSixEyes(false));
        removeForm(player);
        GojoEffects.send(level, Fx.REVERT, player.position(), 1.0F);
        GojoEffects.sound(level, player.position(), SoundEvents.BEACON_DEACTIVATE, 1.2F, 1.2F);
        player.displayClientMessage(Component.literal("Back to normal.").withStyle(ChatFormatting.GRAY), true);
    }

    private static void applyForm(ServerPlayer player) {
        for (FormModifier modifier : MODIFIERS) {
            AttributeInstance instance = player.getAttribute(modifier.attribute());
            if (instance != null && !instance.hasModifier(modifier.id())) {
                instance.addTransientModifier(new AttributeModifier(modifier.id(), modifier.amount(), modifier.op()));
            }
        }
        Abilities abilities = player.getAbilities();
        if (!abilities.mayfly || abilities.getFlyingSpeed() != GOJO_FLY_SPEED) {
            abilities.mayfly = true;
            abilities.setFlyingSpeed(GOJO_FLY_SPEED);
            player.onUpdateAbilities();
        }
        MobEffectInstance vision = player.getEffect(MobEffects.NIGHT_VISION);
        if (vision == null || (vision.getDuration() < 240 && !vision.isInfiniteDuration())) {
            player.addEffect(new MobEffectInstance(MobEffects.NIGHT_VISION, 420, 0, true, false, false));
        }
    }

    private static void removeForm(ServerPlayer player) {
        for (FormModifier modifier : MODIFIERS) {
            AttributeInstance instance = player.getAttribute(modifier.attribute());
            if (instance != null) {
                instance.removeModifier(modifier.id());
            }
        }
        if (player.getHealth() > player.getMaxHealth()) {
            player.setHealth(player.getMaxHealth());
        }
        Abilities abilities = player.getAbilities();
        abilities.setFlyingSpeed(DEFAULT_FLY_SPEED);
        if (!player.isCreative() && !player.isSpectator()) {
            abilities.mayfly = false;
            if (abilities.flying) {
                abilities.flying = false;
                player.addEffect(new MobEffectInstance(MobEffects.SLOW_FALLING, 80, 0, true, false, true));
            }
        }
        player.onUpdateAbilities();
        player.resetFallDistance();
        MobEffectInstance vision = player.getEffect(MobEffects.NIGHT_VISION);
        if (vision != null && vision.isAmbient() && !vision.isVisible()) {
            player.removeEffect(MobEffects.NIGHT_VISION);
        }
    }

    /** Stops every running technique: Blue collapses, a charging Purple fizzles and the domain closes. */
    public static void cancelAbilities(ServerPlayer player) {
        GojoState state = state(player);
        if (state.blue != null) {
            state.blue.forceCollapse();
            state.blue = null;
        }
        state.blueHeld = false;
        if (state.purple != null) {
            state.purple.cancelIfCharging();
            state.purple = null;
        }
        InfinityHandler.releaseAll(state);
        DomainManager.close(player);
    }

    private static void toggleInfinity(ServerPlayer player, GojoState state) {
        if (state.cooldowns[Ability.INFINITY.ordinal()] > 0) {
            return;
        }
        state.cooldowns[Ability.INFINITY.ordinal()] = Ability.INFINITY.cooldown;
        boolean on = !form(player).infinity();
        setForm(player, form(player).withInfinity(on));
        if (!on) {
            InfinityHandler.releaseAll(state);
        }
        player.displayClientMessage(Component.literal(on ? "Infinity: ON" : "Infinity: OFF")
                .withStyle(on ? ChatFormatting.AQUA : ChatFormatting.GRAY), true);
        GojoEffects.sound(player.level(), player.position(), on ? SoundEvents.AMETHYST_BLOCK_CHIME : SoundEvents.AMETHYST_BLOCK_HIT,
                1.5F, on ? 1.6F : 0.8F);
    }

    // ------------------------------------------------------------------------------ teleport ---

    private static void teleport(ServerPlayer player, GojoState state) {
        if (state.cooldowns[Ability.TELEPORT.ordinal()] > 0) {
            return;
        }
        ServerLevel level = player.level();
        Vec3 eye = player.getEyePosition();
        Vec3 look = player.getLookAngle();
        Vec3 end = eye.add(look.scale(40.0));
        BlockHitResult hit = level.clip(new ClipContext(eye, end, ClipContext.Block.COLLIDER, ClipContext.Fluid.NONE, player));
        Vec3 feet;
        if (hit.getType() == HitResult.Type.MISS) {
            feet = end.subtract(0.0, player.getEyeHeight(), 0.0);
        } else if (hit.getDirection() == Direction.UP) {
            feet = hit.getLocation();
        } else {
            feet = hit.getLocation().subtract(look.scale(0.7)).subtract(0.0, player.getEyeHeight() * 0.5, 0.0);
        }
        Vec3 target = null;
        for (int i = 0; i < 16 && target == null; i++) {
            Vec3 candidate = feet.subtract(look.scale(0.5 * (i / 2))).add(0.0, (i % 2) * 1.0, 0.0);
            AABB box = player.getBoundingBox().move(candidate.subtract(player.position()));
            if (level.noCollision(player, box)) {
                target = candidate;
            }
        }
        if (target == null || target.distanceTo(player.position()) < 1.5) {
            return;
        }
        if (!trySpend(player, state, Ability.TELEPORT)) {
            return;
        }
        Vec3 from = player.position();
        GojoEffects.send(level, Fx.TELEPORT_OUT, from, 1.0F);
        GojoEffects.sound(level, from, SoundEvents.ENDERMAN_TELEPORT, 0.8F, 1.7F);
        player.teleportTo(target.x, target.y, target.z);
        player.resetFallDistance();
        GojoEffects.send(level, Fx.TELEPORT_IN, target, 1.0F);
        GojoEffects.sound(level, target, SoundEvents.ILLUSIONER_MIRROR_MOVE, 1.0F, 1.4F);
    }

    // ---------------------------------------------------------------------------------- tick ---

    private static void tick(MinecraftServer server) {
        for (ServerPlayer player : server.getPlayerList().getPlayers()) {
            GojoState state = state(player);
            state.ticks++;
            for (int i = 0; i < state.cooldowns.length; i++) {
                if (state.cooldowns[i] > 0) {
                    state.cooldowns[i]--;
                }
            }
            if (state.blue != null && !state.blue.isAlive()) {
                state.blue = null;
            }
            if (state.purple != null && !state.purple.isAlive()) {
                state.purple = null;
            }
            GojoForm form = form(player);
            if (!form.transformed()) {
                continue;
            }
            boolean inDomain = DomainManager.insideOwnDomain(player);
            if (player.isAlive()) {
                applyForm(player);
                float regen = 4.0F * (inDomain ? 3.0F : 1.0F);
                state.energy = Math.min(GojoState.MAX_ENERGY, state.energy + regen);
                reverseCursedTechnique(player, state);
            }
            if (state.sixEyesTicks > 0 && --state.sixEyesTicks == 0 && !DomainManager.hasDomain(player)) {
                setForm(player, form(player).withSixEyes(false));
            }
            InfinityHandler.tick(player, state, form(player));
            if (state.ticks % 2 == 0) {
                List<Integer> cooldowns = new ArrayList<>(state.cooldowns.length);
                for (int cooldown : state.cooldowns) {
                    cooldowns.add(cooldown);
                }
                ServerPlayNetworking.send(player, new StatsPayload((int) state.energy, (int) GojoState.MAX_ENERGY, cooldowns, inDomain));
            }
        }
    }

    /** Heals over time while hurt, paid for with cursed energy. */
    private static void reverseCursedTechnique(ServerPlayer player, GojoState state) {
        if (state.ticks % 10 != 0 || player.getHealth() >= player.getMaxHealth() || state.energy < 30.0F) {
            return;
        }
        player.heal(1.0F);
        state.energy -= 8.0F;
        if (state.ticks % 40 == 0) {
            GojoEffects.send(player.level(), Fx.HEAL, player.position(), Vec3.ZERO, 1.0F, 48.0);
        }
    }

    // ------------------------------------------------------------------------- player events ---

    private static void onJoin(ServerPlayer player) {
        GojoForm form = form(player);
        if (form.sixEyes()) {
            setForm(player, form.withSixEyes(false));
        }
        if (!form.transformed()) {
            // Clean up anything a crash may have left behind.
            removeForm(player);
        }
    }

    private static void onLeave(ServerPlayer player) {
        cancelAbilities(player);
        STATES.remove(player.getUUID());
    }

    private static void onRespawn(ServerPlayer oldPlayer, ServerPlayer newPlayer) {
        GojoState state = STATES.get(oldPlayer.getUUID());
        if (state != null) {
            cancelAbilities(oldPlayer);
            state.energy = GojoState.MAX_ENERGY;
            state.sixEyesTicks = 0;
        }
        GojoForm form = form(newPlayer);
        if (form.sixEyes()) {
            setForm(newPlayer, form.withSixEyes(false));
        }
    }

    // ---------------------------------------------------------------------------------- help ---

    private static void sendHelp(ServerPlayer player) {
        player.sendSystemMessage(Component.literal("✦ Limitless awakened ✦").withStyle(ChatFormatting.AQUA, ChatFormatting.BOLD));
        player.sendSystemMessage(helpLine("key.gojo.infinity", "Infinity on/off: nothing can touch you", ChatFormatting.WHITE));
        player.sendSystemMessage(helpLine("key.gojo.blue", "(hold) Lapse: Blue: pulls everything in, release to crush", ChatFormatting.BLUE));
        player.sendSystemMessage(helpLine("key.gojo.red", "Reversal: Red: a repulsion blast", ChatFormatting.RED));
        player.sendSystemMessage(helpLine("key.gojo.purple", "Hollow Purple: erases everything in its path", ChatFormatting.LIGHT_PURPLE));
        player.sendSystemMessage(helpLine("key.gojo.domain", "Domain Expansion: Infinite Void", ChatFormatting.DARK_AQUA));
        player.sendSystemMessage(helpLine("key.gojo.teleport", "Teleport where you look", ChatFormatting.AQUA));
        player.sendSystemMessage(helpLine("key.gojo.transform", "Turn back to normal", ChatFormatting.GRAY));
        player.sendSystemMessage(Component.literal("Double-tap jump to fly. Keys can be changed in Options > Controls.")
                .withStyle(ChatFormatting.DARK_GRAY));
    }

    private static Component helpLine(String key, String text, ChatFormatting color) {
        MutableComponent keyName = Component.literal("[").append(Component.keybind(key)).append("] ").withStyle(ChatFormatting.YELLOW);
        return keyName.append(Component.literal(text).withStyle(color));
    }
}
