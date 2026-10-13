package dev.calibercraft.server;

import dev.calibercraft.core.FireRateLimiter;
import dev.calibercraft.core.ReloadRunner;
import dev.calibercraft.core.TriggerGate;
import net.minecraft.core.BlockPos;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.phys.Vec3;

/** Transient per-player weapon state on the server (never saved). */
final class PlayerGunData {
	final long salt;
	int heldSlot = -1;
	ItemStack heldStack = ItemStack.EMPTY;
	long equipTime;
	ReloadRunner runner;
	final FireRateLimiter limiter = new FireRateLimiter();
	final TriggerGate gate = new TriggerGate();
	int lastSeq;
	boolean aiming;
	long aimStart;
	float bloom;
	long lastShot;
	long lastMelee = -1000;
	BlockPos benchPos;
	double appliedMoveMult = 1.0;
	Vec3 lastPos = Vec3.ZERO;
	boolean moving;

	PlayerGunData(long salt) {
		this.salt = salt;
	}
}
