package dev.visceral.client.fx;

import dev.visceral.VisceralConfig;
import dev.visceral.blood.BloodType;
import dev.visceral.client.ragdoll.RagdollManager;
import it.unimi.dsi.fastutil.ints.Int2ObjectMap;
import it.unimi.dsi.fastutil.ints.Int2ObjectOpenHashMap;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.phys.Vec3;

/** Anything that walks through fresh blood tracks it around in fading footprints. */
public final class Footprints {
	private static final int STEPS = 12;
	private static final double MAX_DISTANCE_SQ = 48.0 * 48.0;
	private static final Int2ObjectMap<State> STATES = new Int2ObjectOpenHashMap<>();

	private Footprints() {
	}

	private static final class State {
		BloodType blood;
		int stepsLeft;
		double lastX;
		double lastZ;
		boolean left;
	}

	public static void clear() {
		STATES.clear();
	}

	public static void tick(ClientLevel level) {
		if (!VisceralConfig.get().worldStains) {
			return;
		}
		Vec3 camera = Minecraft.getInstance().gameRenderer.getMainCamera().position();
		RagdollManager ragdolls = RagdollManager.get();
		for (Entity entity : level.entitiesForRendering()) {
			if (!(entity instanceof LivingEntity living) || !living.isAlive() || !living.onGround() || entity.distanceToSqr(camera) > MAX_DISTANCE_SQ
				|| ragdolls.get(living) != null) {
				continue;
			}
			Vec3 feet = entity.position();
			State state = STATES.get(entity.getId());
			BloodType wet = BloodDecals.wetBloodAt(feet);
			if (wet != null) {
				if (state == null) {
					state = new State();
					state.lastX = feet.x;
					state.lastZ = feet.z;
					STATES.put(entity.getId(), state);
				}
				state.blood = wet;
				state.stepsLeft = STEPS;
			}
			if (state == null) {
				continue;
			}
			double dx = feet.x - state.lastX;
			double dz = feet.z - state.lastZ;
			double distance = Math.sqrt(dx * dx + dz * dz);
			double stride = Math.max(0.35, entity.getBbWidth() * 0.9);
			if (distance < stride) {
				continue;
			}
			state.lastX = feet.x;
			state.lastZ = feet.z;
			if (state.stepsLeft <= 0) {
				STATES.remove(entity.getId());
				continue;
			}
			float yaw = (float) Math.atan2(dz, dx);
			double side = entity.getBbWidth() * 0.18 * (state.left ? 1 : -1);
			Vec3 print = new Vec3(feet.x - dz / distance * side, feet.y, feet.z + dx / distance * side);
			float size = Mth.clamp(entity.getBbWidth() * 0.22F, 0.06F, 0.2F);
			float opacity = 0.2F + 0.8F * state.stepsLeft / STEPS;
			BloodDecals.footprint(level, print, yaw, size, state.blood, opacity);
			state.stepsLeft--;
			state.left = !state.left;
		}
		if (level.getGameTime() % 200 == 0) {
			STATES.int2ObjectEntrySet().removeIf(entry -> level.getEntity(entry.getIntKey()) == null);
		}
	}
}
