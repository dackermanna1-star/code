package dev.calibercraft.combat;

import java.util.HashSet;
import java.util.Set;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.phys.Vec3;

/**
 * One simulated projectile (no entity). Bullets of one trigger pull share a {@link ShotGroup} so that pellet
 * damage is aggregated into a single hit per target.
 */
final class Bullet {
	final ServerPlayer shooter;
	final ShotGroup group;
	Vec3 pos;
	Vec3 vel;
	final double gravity;
	double traveled;
	double damage;
	double penetration;
	boolean inWater;
	boolean ricocheted;
	boolean dead;
	int age;
	final Set<Integer> hitEntities = new HashSet<>(2);
	final Set<java.util.UUID> whizzed = new HashSet<>(2);

	Bullet(ServerPlayer shooter, ShotGroup group, Vec3 pos, Vec3 vel, double gravity, double damage, double penetration) {
		this.shooter = shooter;
		this.group = group;
		this.pos = pos;
		this.vel = vel;
		this.gravity = gravity;
		this.damage = damage;
		this.penetration = penetration;
	}
}
