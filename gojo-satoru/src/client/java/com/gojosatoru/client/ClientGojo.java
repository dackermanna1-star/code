package com.gojosatoru.client;

import com.gojosatoru.GojoRegistry;
import com.gojosatoru.network.GojoNetwork.DomainPayload;
import com.gojosatoru.network.GojoNetwork.StatsPayload;
import com.gojosatoru.particle.GlowParticleOptions;
import com.gojosatoru.power.Ability;
import com.gojosatoru.power.GojoForm;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.util.RandomSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.monster.Enemy;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.phys.Vec3;

/** Everything the client remembers between packets: HUD numbers, screen effects and active domains. */
public final class ClientGojo {
    public static int energy = 1000;
    public static int maxEnergy = 1000;
    public static int[] cooldowns = new int[Ability.values().length];
    public static boolean inOwnDomain;

    public static float flash;
    public static float flashPrev;
    public static int flashColor = 0xFFFFFF;
    public static float shake;
    public static float shakePrev;

    public static int castAbility = -1;
    public static int castTicks;
    public static int domainTitleTicks;
    public static long time;

    public record ActiveDomain(Vec3 center, float radius, long endTime) {
    }

    public static final Map<Integer, ActiveDomain> DOMAINS = new HashMap<>();

    private ClientGojo() {
    }

    public static GojoForm form(Player player) {
        GojoForm form = player.getAttached(GojoRegistry.FORM);
        return form == null ? GojoForm.NONE : form;
    }

    public static boolean localIsGojo() {
        Player player = Minecraft.getInstance().player;
        return player != null && form(player).transformed();
    }

    public static void onStats(StatsPayload payload) {
        energy = payload.energy();
        maxEnergy = Math.max(1, payload.maxEnergy());
        for (int i = 0; i < cooldowns.length && i < payload.cooldowns().size(); i++) {
            cooldowns[i] = payload.cooldowns().get(i);
        }
        inOwnDomain = payload.inDomain();
    }

    public static void onDomain(DomainPayload payload) {
        if (payload.active()) {
            DOMAINS.put(payload.id(), new ActiveDomain(payload.center(), payload.radius(), time + payload.ticksLeft() + 40));
        } else {
            DOMAINS.remove(payload.id());
        }
    }

    public static void addFlash(int color, float amount) {
        if (amount > flash) {
            flash = Math.min(1.0F, amount);
            flashPrev = flash;
            flashColor = color;
        }
    }

    public static void addShake(float amount) {
        shake = Math.max(shake, Math.min(2.5F, amount));
    }

    public static float shakeAmount(float partialTick) {
        return shakePrev + (shake - shakePrev) * partialTick;
    }

    public static float flashAmount(float partialTick) {
        return flashPrev + (flash - flashPrev) * partialTick;
    }

    /** The Six Eyes see every hostile creature nearby, even through walls. */
    public static boolean sixEyesSees(Entity entity) {
        Player player = Minecraft.getInstance().player;
        return player != null && entity != player && entity instanceof Enemy && form(player).transformed()
                && entity.distanceToSqr(player) < 30.0 * 30.0;
    }

    public static boolean insideAnyDomain(Vec3 pos) {
        for (ActiveDomain domain : DOMAINS.values()) {
            if (pos.distanceTo(domain.center()) < domain.radius()) {
                return true;
            }
        }
        return false;
    }

    public static void reset() {
        energy = maxEnergy = 1000;
        cooldowns = new int[Ability.values().length];
        inOwnDomain = false;
        flash = flashPrev = shake = shakePrev = 0.0F;
        castTicks = domainTitleTicks = 0;
        DOMAINS.clear();
    }

    public static void tick(Minecraft minecraft) {
        time++;
        flashPrev = flash;
        flash = flash < 0.01F ? 0.0F : flash * 0.84F;
        shakePrev = shake;
        shake = shake < 0.01F ? 0.0F : shake * 0.86F;
        if (castTicks > 0) {
            castTicks--;
        }
        if (domainTitleTicks > 0) {
            domainTitleTicks--;
        }
        ClientLevel level = minecraft.level;
        if (level == null || minecraft.player == null || minecraft.isPaused()) {
            return;
        }
        Iterator<ActiveDomain> it = DOMAINS.values().iterator();
        while (it.hasNext()) {
            ActiveDomain domain = it.next();
            if (time > domain.endTime()) {
                it.remove();
            } else {
                domainStars(level, minecraft.gameRenderer.getMainCamera().position(), domain);
            }
        }
        for (Player player : level.players()) {
            GojoForm form = form(player);
            if (form.transformed()) {
                aura(minecraft, level, player, form);
            }
        }
    }

    private static void domainStars(ClientLevel level, Vec3 camera, ActiveDomain domain) {
        if (camera.distanceTo(domain.center()) > domain.radius() + 1.0) {
            return;
        }
        RandomSource random = level.getRandom();
        float r = domain.radius() * 0.95F;
        for (int i = 0; i < 30; i++) {
            Vec3 pos = domain.center().add(ClientEffects.randomInBall(random, r));
            int color = switch (random.nextInt(4)) {
                case 0 -> 0xBFE0FF;
                case 1 -> 0x9FB4FF;
                default -> 0xFFFFFF;
            };
            ClientEffects.spawn(level, new GlowParticleOptions(GlowParticleOptions.SPARK, color, 0.95F,
                    0.05F + random.nextFloat() * 0.16F, 20 + random.nextInt(30), 1.0F), pos, Vec3.ZERO, true);
        }
        for (int i = 0; i < 2; i++) {
            Vec3 pos = domain.center().add(ClientEffects.randomInBall(random, r * 0.9F));
            ClientEffects.spawn(level, new GlowParticleOptions(GlowParticleOptions.DOT, random.nextBoolean() ? 0x2A1A7A : 0x0A3A7A, 0.3F,
                    3.0F + random.nextFloat() * 4.0F, 80, 1.0F), pos, ClientEffects.randomUnit(random).scale(0.01), true);
        }
        for (int i = 0; i < 3; i++) {
            Vec3 pos = domain.center().add(ClientEffects.randomInBall(random, r * 0.8F));
            Vec3 dir = ClientEffects.randomUnit(random);
            ClientEffects.spawn(level, new GlowParticleOptions(GlowParticleOptions.DOT, 0xE8F4FF, 0.8F, 0.08F, 12, 1.0F),
                    pos, dir.scale(0.7), true);
        }
    }

    private static void aura(Minecraft minecraft, ClientLevel level, Player player, GojoForm form) {
        boolean firstPerson = player == minecraft.player && minecraft.options.getCameraType().isFirstPerson();
        if (firstPerson || player.isInvisible() || player.distanceToSqr(minecraft.gameRenderer.getMainCamera().position()) > 48.0 * 48.0) {
            return;
        }
        RandomSource random = level.getRandom();
        if (time % 2 == 0) {
            double a = random.nextDouble() * Math.PI * 2.0;
            double r = 0.45 + random.nextDouble() * 0.25;
            Vec3 pos = player.position().add(Math.cos(a) * r, random.nextDouble() * 1.8, Math.sin(a) * r);
            ClientEffects.spawn(level, new GlowParticleOptions(GlowParticleOptions.DOT, random.nextBoolean() ? 0x6FC0FF : 0xDDF4FF, 0.55F,
                    0.08F + random.nextFloat() * 0.06F, 18 + random.nextInt(10), 1.0F), pos, new Vec3(0.0, 0.03, 0.0), false);
        }
        if (form.infinity() && time % 5 == 0) {
            Vec3 center = player.position().add(0.0, player.getBbHeight() * 0.55, 0.0);
            Vec3 pos = center.add(ClientEffects.randomUnit(random).scale(1.25));
            ClientEffects.spawn(level, new GlowParticleOptions(GlowParticleOptions.SPARK, 0xCFEFFF, 0.5F, 0.12F, 10, 1.0F),
                    pos, Vec3.ZERO, false);
        }
    }
}
