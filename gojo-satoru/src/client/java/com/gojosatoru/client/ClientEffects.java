package com.gojosatoru.client;

import com.gojosatoru.network.GojoNetwork.EffectPayload;
import com.gojosatoru.particle.GlowParticleOptions;
import com.gojosatoru.power.Fx;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.util.RandomSource;
import net.minecraft.world.phys.Vec3;

/** Turns effect packets into particle bursts, screen flashes and camera shake. */
public final class ClientEffects {
    private ClientEffects() {
    }

    // ------------------------------------------------------------------------------- helpers ---

    public static void spawn(ClientLevel level, GlowParticleOptions options, Vec3 pos, Vec3 velocity, boolean force) {
        level.addParticle(options, force, false, pos.x, pos.y, pos.z, velocity.x, velocity.y, velocity.z);
    }

    public static Vec3 randomUnit(RandomSource random) {
        double z = random.nextDouble() * 2.0 - 1.0;
        double a = random.nextDouble() * Math.PI * 2.0;
        double r = Math.sqrt(1.0 - z * z);
        return new Vec3(r * Math.cos(a), z, r * Math.sin(a));
    }

    public static Vec3 randomInBall(RandomSource random, double radius) {
        return randomUnit(random).scale(radius * Math.cbrt(random.nextDouble()));
    }

    /** Two unit vectors perpendicular to {@code normal} and to each other. */
    private static Vec3[] basis(Vec3 normal) {
        Vec3 n = normal.lengthSqr() < 1.0E-6 ? new Vec3(0.0, 1.0, 0.0) : normal.normalize();
        Vec3 helper = Math.abs(n.y) > 0.9 ? new Vec3(1.0, 0.0, 0.0) : new Vec3(0.0, 1.0, 0.0);
        Vec3 a = n.cross(helper).normalize();
        Vec3 b = n.cross(a).normalize();
        return new Vec3[] {a, b};
    }

    /** A ring of particles in the plane facing {@code normal}, flying outward. */
    private static void ring(ClientLevel level, Vec3 center, Vec3 normal, int count, double startRadius, double speed,
                             int color, float size, int life, float drag) {
        Vec3[] b = basis(normal);
        for (int i = 0; i < count; i++) {
            double a = i * Math.PI * 2.0 / count;
            Vec3 dir = b[0].scale(Math.cos(a)).add(b[1].scale(Math.sin(a)));
            spawn(level, new GlowParticleOptions(GlowParticleOptions.DOT, color, 0.9F, size, life, drag),
                    center.add(dir.scale(startRadius)), dir.scale(speed), true);
        }
    }

    private static void burst(ClientLevel level, RandomSource random, Vec3 center, int count, double minSpeed, double maxSpeed,
                              int[] colors, int shape, float size, int life, float drag) {
        for (int i = 0; i < count; i++) {
            Vec3 dir = randomUnit(random);
            double speed = minSpeed + random.nextDouble() * (maxSpeed - minSpeed);
            int color = colors[random.nextInt(colors.length)];
            spawn(level, new GlowParticleOptions(shape, color, 0.95F, size * (0.6F + random.nextFloat() * 0.8F),
                    life + random.nextInt(Math.max(1, life / 2)), drag), center.add(dir.scale(0.2)), dir.scale(speed), true);
        }
    }

    private static void implode(ClientLevel level, RandomSource random, Vec3 center, int count, double radius, int[] colors, float size, int life) {
        for (int i = 0; i < count; i++) {
            Vec3 dir = randomUnit(random);
            double r = radius * (0.6 + random.nextDouble() * 0.4);
            int color = colors[random.nextInt(colors.length)];
            spawn(level, new GlowParticleOptions(GlowParticleOptions.DOT, color, 0.95F, size, life, 1.0F),
                    center.add(dir.scale(r)), dir.scale(-r / life), true);
        }
    }

    private static void flare(ClientLevel level, Vec3 pos, int color, float size, int life) {
        spawn(level, new GlowParticleOptions(GlowParticleOptions.DOT, color, 1.0F, size, life, 1.0F), pos, Vec3.ZERO, true);
    }

    /** 1 when the camera is at the effect, fading to 0 at {@code range} blocks. */
    private static float near(Vec3 pos, double range) {
        Minecraft minecraft = Minecraft.getInstance();
        double distance = minecraft.gameRenderer.getMainCamera().position().distanceTo(pos);
        return (float) Math.max(0.0, 1.0 - distance / range);
    }

    // -------------------------------------------------------------------------------- effects ---

    public static void play(EffectPayload payload) {
        Minecraft minecraft = Minecraft.getInstance();
        ClientLevel level = minecraft.level;
        if (level == null) {
            return;
        }
        RandomSource random = level.getRandom();
        Vec3 pos = payload.pos();
        Vec3 dir = payload.dir();
        float scale = payload.scale();
        switch (Fx.byId(payload.effect())) {
            case TRANSFORM -> {
                int[] colors = {0x5AB4FF, 0xFFFFFF, 0x2E6BFF, 0xA8E0FF};
                for (int i = 0; i < 110; i++) {
                    double a = i * 0.41;
                    double h = i / 110.0 * 2.6;
                    double r = 1.15 - h * 0.18;
                    Vec3 p = pos.add(Math.cos(a) * r, h, Math.sin(a) * r);
                    Vec3 tangent = new Vec3(-Math.sin(a), 0.0, Math.cos(a));
                    spawn(level, new GlowParticleOptions(GlowParticleOptions.DOT, colors[i % colors.length], 0.95F,
                            0.14F + random.nextFloat() * 0.18F, 18 + random.nextInt(12), 0.92F),
                            p, tangent.scale(0.1).add(0.0, 0.1, 0.0), true);
                }
                ring(level, pos.add(0.0, 0.1, 0.0), new Vec3(0.0, 1.0, 0.0), 56, 0.4, 0.42, 0x8FD6FF, 0.3F, 16, 0.86F);
                burst(level, random, pos.add(0.0, 1.0, 0.0), 30, 0.05, 0.35, new int[] {0xFFFFFF, 0xBFE8FF}, GlowParticleOptions.SPARK, 0.35F, 10, 0.9F);
                flare(level, pos.add(0.0, 1.0, 0.0), 0x5AB4FF, 4.5F, 8);
                ClientGojo.addFlash(0x9FDCFF, 0.35F * near(pos, 12.0));
                ClientGojo.addShake(0.4F * near(pos, 16.0));
            }
            case REVERT -> {
                burst(level, random, pos.add(0.0, 1.0, 0.0), 45, 0.02, 0.18, new int[] {0x8FB4D0, 0xDDEEFF}, GlowParticleOptions.DOT, 0.18F, 20, 0.9F);
            }
            case INFINITY_BLOCK -> {
                ring(level, pos, dir, 20, 0.12 * scale, 0.07 * scale, 0xBFF0FF, 0.12F * scale, 10, 0.88F);
                spawn(level, new GlowParticleOptions(GlowParticleOptions.RING, 0xCFF4FF, 0.9F, 1.4F * scale, 9, 1.0F), pos, Vec3.ZERO, true);
                burst(level, random, pos, 6, 0.03, 0.12, new int[] {0xFFFFFF, 0x9FE0FF}, GlowParticleOptions.SPARK, 0.18F * scale, 6, 0.85F);
            }
            case BLUE_COLLAPSE -> {
                int[] colors = {0x2E6BFF, 0x7CC8FF, 0xFFFFFF};
                implode(level, random, pos, 120, 5.5, colors, 0.25F, 6);
                ring(level, pos, new Vec3(0.0, 1.0, 0.0), 64, 0.3, 0.55, 0x6FAEFF, 0.3F, 14, 0.86F);
                burst(level, random, pos, 40, 0.1, 0.6, colors, GlowParticleOptions.SPARK, 0.35F, 9, 0.88F);
                flare(level, pos, 0x5A9CFF, 6.0F, 7);
                flare(level, pos, 0xFFFFFF, 2.5F, 5);
                ClientGojo.addShake(0.8F * near(pos, 30.0));
                ClientGojo.addFlash(0x6FAEFF, 0.25F * near(pos, 16.0));
            }
            case RED_FIRE -> {
                Vec3 forward = dir.lengthSqr() < 1.0E-4 ? new Vec3(0.0, 0.0, 1.0) : dir.normalize();
                for (int i = 0; i < 30; i++) {
                    Vec3 spread = randomUnit(random).scale(0.25);
                    spawn(level, GlowParticleOptions.spark(i % 2 == 0 ? 0xFF4A30 : 0xFFD0B0, 0.3F, 6 + random.nextInt(4)),
                            pos, forward.add(spread).normalize().scale(0.4 + random.nextDouble() * 0.6), true);
                }
                ring(level, pos, forward, 24, 0.1, 0.25, 0xFF6A50, 0.2F, 7, 0.85F);
                flare(level, pos, 0xFF3A20, 2.8F, 4);
                ClientGojo.addShake(0.3F * near(pos, 12.0));
            }
            case RED_IMPACT -> {
                flare(level, pos, 0xFF2A14, 11.0F, 8);
                flare(level, pos, 0xFFB090, 6.0F, 6);
                flare(level, pos, 0xFFFFFF, 3.0F, 4);
                int[] ringColors = {0xFF2A14, 0xFF7A40, 0xFFD8C0};
                for (int k = 0; k < 3; k++) {
                    ring(level, pos, new Vec3(0.0, 1.0, 0.0), 80, 0.5, 0.7 + k * 0.3, ringColors[k], 0.45F - k * 0.08F, 14 + k * 3, 0.88F);
                }
                ring(level, pos, randomUnit(random), 60, 0.5, 0.8, 0xFF5030, 0.35F, 12, 0.88F);
                burst(level, random, pos, 110, 0.3, 1.6, new int[] {0xFF2A14, 0xFF6A30, 0xFFC0A0, 0xFFFFFF},
                        GlowParticleOptions.SPARK, 0.45F, 14, 0.9F);
                burst(level, random, pos, 60, 0.05, 0.35, new int[] {0xFF3A20, 0xA01408}, GlowParticleOptions.DOT, 1.2F, 24, 0.92F);
                ClientGojo.addShake(1.4F * near(pos, 48.0));
                ClientGojo.addFlash(0xFF5030, 0.45F * near(pos, 28.0));
            }
            case PURPLE_MERGE -> {
                ring(level, pos, dir, 72, 0.4, 0.9, 0xB070FF, 0.35F, 12, 0.85F);
                ring(level, pos, dir, 48, 0.3, 0.55, 0xFFFFFF, 0.25F, 10, 0.85F);
                burst(level, random, pos, 50, 0.2, 0.9, new int[] {0x8A3CFF, 0xE0B0FF, 0x3C8CFF, 0xFF3A2A},
                        GlowParticleOptions.SPARK, 0.4F, 10, 0.88F);
                flare(level, pos, 0x9A50FF, 7.0F, 8);
                flare(level, pos, 0xFFFFFF, 3.0F, 5);
                ClientGojo.addShake(0.6F * near(pos, 24.0));
                ClientGojo.addFlash(0xC090FF, 0.3F * near(pos, 16.0));
            }
            case PURPLE_FIRE -> {
                Vec3 forward = dir.lengthSqr() < 1.0E-4 ? new Vec3(0.0, 0.0, 1.0) : dir.normalize();
                flare(level, pos, 0x7A2CFF, 18.0F, 10);
                flare(level, pos, 0xE8D0FF, 9.0F, 7);
                flare(level, pos, 0xFFFFFF, 4.0F, 5);
                for (int k = 0; k < 3; k++) {
                    ring(level, pos.add(forward.scale(k * 1.5)), forward, 96, 1.0, 0.9 + k * 0.45,
                            k == 1 ? 0xFFFFFF : 0xA060FF, 0.5F, 14 + k * 2, 0.86F);
                }
                for (int i = 0; i < 90; i++) {
                    Vec3 spread = randomUnit(random).scale(0.35);
                    int color = switch (i % 4) {
                        case 0 -> 0x3C8CFF;
                        case 1 -> 0xFF3A2A;
                        case 2 -> 0xFFFFFF;
                        default -> 0xB070FF;
                    };
                    spawn(level, GlowParticleOptions.spark(color, 0.55F, 10 + random.nextInt(8)),
                            pos, forward.add(spread).normalize().scale(1.2 + random.nextDouble() * 2.2), true);
                }
                burst(level, random, pos, 70, 0.05, 0.4, new int[] {0x6A20FF, 0xB070FF}, GlowParticleOptions.DOT, 1.6F, 26, 0.92F);
                ClientGojo.addShake(2.0F * near(pos, 70.0));
                ClientGojo.addFlash(0xE8D8FF, 0.6F * near(pos, 50.0));
            }
            case PURPLE_END -> {
                burst(level, random, pos, 90, 0.05, 0.45, new int[] {0x7A2CFF, 0xB45CFF, 0xE6C8FF}, GlowParticleOptions.DOT, 0.9F, 22, 0.9F);
                flare(level, pos, 0x9A50FF, 8.0F, 10);
            }
            case TELEPORT_OUT, TELEPORT_IN -> {
                boolean in = Fx.byId(payload.effect()) == Fx.TELEPORT_IN;
                for (int i = 0; i < 50; i++) {
                    double a = random.nextDouble() * Math.PI * 2.0;
                    double h = random.nextDouble() * 2.0;
                    Vec3 radial = new Vec3(Math.cos(a), 0.0, Math.sin(a));
                    Vec3 p = pos.add(radial.scale(in ? 0.2 : 0.9)).add(0.0, h, 0.0);
                    Vec3 v = radial.scale(in ? 0.12 : -0.08).add(new Vec3(-Math.sin(a), 0.0, Math.cos(a)).scale(0.08));
                    spawn(level, new GlowParticleOptions(GlowParticleOptions.DOT, i % 3 == 0 ? 0xFFFFFF : 0x6FC0FF, 0.9F,
                            0.12F + random.nextFloat() * 0.12F, 10 + random.nextInt(6), 0.9F), p, v, true);
                }
                flare(level, pos.add(0.0, 1.0, 0.0), 0x6FB6FF, 3.0F, 5);
                spawn(level, new GlowParticleOptions(GlowParticleOptions.RING, 0xBFE8FF, 0.9F, 3.0F, 8, 1.0F),
                        pos.add(0.0, 1.0, 0.0), Vec3.ZERO, true);
            }
            case DOMAIN_OPEN -> {
                float radius = Math.max(4.0F, scale);
                int[] colors = {0x1A2A8A, 0x4A7AFF, 0xBFE0FF, 0xFFFFFF};
                for (int i = 0; i < 420; i++) {
                    Vec3 d = randomUnit(random);
                    spawn(level, new GlowParticleOptions(GlowParticleOptions.DOT, colors[random.nextInt(colors.length)], 0.9F,
                            0.2F + random.nextFloat() * 0.35F, 15, 1.0F), pos.add(d.scale(0.8)), d.scale(radius / 15.0), true);
                }
                flare(level, pos.add(0.0, 1.0, 0.0), 0xBFE0FF, 14.0F, 10);
                Vec3 camera = minecraft.gameRenderer.getMainCamera().position();
                if (camera.distanceTo(pos) < radius + 8.0) {
                    ClientGojo.domainTitleTicks = 80;
                    ClientGojo.addFlash(0x000000, 0.95F);
                    ClientGojo.addShake(1.2F);
                } else {
                    ClientGojo.addShake(0.6F * near(pos, radius + 40.0));
                }
            }
            case DOMAIN_CLOSE -> {
                float radius = Math.max(4.0F, scale);
                for (int i = 0; i < 300; i++) {
                    Vec3 d = randomUnit(random);
                    spawn(level, new GlowParticleOptions(GlowParticleOptions.SPARK, i % 3 == 0 ? 0x9FC8FF : 0xFFFFFF, 0.9F,
                            0.15F + random.nextFloat() * 0.2F, 25 + random.nextInt(20), 0.97F),
                            pos.add(d.scale(radius * (0.9 + random.nextDouble() * 0.1))), d.scale(-0.03).add(0.0, -0.04, 0.0), true);
                }
                if (minecraft.gameRenderer.getMainCamera().position().distanceTo(pos) < radius + 2.0) {
                    ClientGojo.addFlash(0xFFFFFF, 0.4F);
                }
            }
            case OVERLOAD -> {
                for (int i = 0; i < 14; i++) {
                    Vec3 d = randomUnit(random);
                    spawn(level, GlowParticleOptions.spark(i % 2 == 0 ? 0xFFFFFF : 0x8FD8FF, 0.22F, 6 + random.nextInt(6)),
                            pos.add(d.scale(0.3 + scale * 0.4)), d.scale(0.12), true);
                }
                spawn(level, new GlowParticleOptions(GlowParticleOptions.RING, 0xDFF4FF, 0.8F, 1.2F + scale, 8, 1.0F), pos, Vec3.ZERO, true);
            }
            case CAST_NAME -> {
                ClientGojo.castAbility = (int) scale;
                ClientGojo.castTicks = 56;
            }
            case HEAL -> {
                for (int i = 0; i < 10; i++) {
                    double a = random.nextDouble() * Math.PI * 2.0;
                    Vec3 p = pos.add(Math.cos(a) * 0.5, random.nextDouble() * 1.6, Math.sin(a) * 0.5);
                    spawn(level, new GlowParticleOptions(GlowParticleOptions.SPARK, 0xC8FFE0, 0.8F, 0.15F, 18, 1.0F),
                            p, new Vec3(0.0, 0.05, 0.0), false);
                }
            }
        }
    }
}
