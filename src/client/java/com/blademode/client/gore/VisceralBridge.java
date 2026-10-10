package com.blademode.client.gore;

import com.blademode.BladeMode;
import java.lang.invoke.MethodHandle;
import java.lang.invoke.MethodHandles;
import java.lang.invoke.MethodType;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.phys.Vec3;
import org.jspecify.annotations.Nullable;

/**
 * Optional link to Visceral (wounds, blood and ragdolls). When it is installed, sliced creatures
 * bleed with Visceral's own blood: its droplets (which stain whatever they land on), mist, bone
 * chips, sparks and pools, in each creature's own blood type. Looked up reflectively, so Blade Mode
 * neither needs Visceral to build nor to run.
 */
final class VisceralBridge {
	private static final String ID = "visceral";
	private static boolean initialized;
	private static boolean available;

	private static MethodHandle bloodTypesOf;
	private static Field fresh;
	private static Field material;
	private static MethodHandle drop;
	private static MethodHandle mist;
	private static MethodHandle chip;
	private static MethodHandle spark;
	private static MethodHandle feedPool;
	private static MethodHandle ragdollManager;
	private static MethodHandle ragdollOf;
	private static Method markFailed;
	private static MethodHandle config;
	private static Field bloodAmount;
	private static Field bloodPools;

	private VisceralBridge() {
	}

	static boolean available() {
		if (!initialized) {
			initialized = true;
			if (FabricLoader.getInstance().isModLoaded(ID)) {
				try {
					init();
					available = true;
					BladeMode.LOGGER.info("Visceral found: sliced creatures bleed Visceral's blood");
				} catch (ReflectiveOperationException | RuntimeException | LinkageError e) {
					BladeMode.LOGGER.warn("Visceral is installed but its blood could not be linked; using plain particles", e);
				}
			}
		}
		return available;
	}

	private static void init() throws ReflectiveOperationException {
		MethodHandles.Lookup lookup = MethodHandles.publicLookup();
		Class<?> bloodTypes = Class.forName("dev.visceral.blood.BloodTypes");
		Class<?> bloodType = Class.forName("dev.visceral.blood.BloodType");
		Class<?> particles = Class.forName("dev.visceral.client.fx.BloodParticles");
		Class<?> decals = Class.forName("dev.visceral.client.fx.BloodDecals");
		Class<?> manager = Class.forName("dev.visceral.client.ragdoll.RagdollManager");
		Class<?> ragdoll = Class.forName("dev.visceral.client.ragdoll.Ragdoll");
		Class<?> visceralConfig = Class.forName("dev.visceral.VisceralConfig");

		bloodTypesOf = lookup.findStatic(bloodTypes, "of", MethodType.methodType(bloodType, EntityType.class));
		fresh = bloodType.getField("fresh");
		material = bloodType.getField("material");
		drop = lookup.findStatic(particles, "drop", MethodType.methodType(void.class, ClientLevel.class, double.class, double.class, double.class,
			double.class, double.class, double.class, float.class, bloodType));
		mist = lookup.findStatic(particles, "mist", MethodType.methodType(void.class, double.class, double.class, double.class,
			double.class, double.class, double.class, float.class, bloodType, float.class));
		chip = lookup.findStatic(particles, "chip", MethodType.methodType(void.class, double.class, double.class, double.class,
			double.class, double.class, double.class, float.class, bloodType, int.class));
		spark = lookup.findStatic(particles, "spark", MethodType.methodType(void.class, double.class, double.class, double.class,
			double.class, double.class, double.class, float.class, int.class));
		MethodType poolType = MethodType.methodType(void.class, ClientLevel.class, Vec3.class, bloodType, float.class, float.class);
		feedPool = lookup.findStatic(decals, "feedPool", poolType.changeReturnType(Class.forName("dev.visceral.client.fx.BloodDecals$Decal")));
		ragdollManager = lookup.findStatic(manager, "get", MethodType.methodType(manager));
		ragdollOf = lookup.findVirtual(manager, "get", MethodType.methodType(ragdoll, Entity.class));
		markFailed = ragdoll.getDeclaredMethod("markFailed");
		markFailed.setAccessible(true);
		config = lookup.findStatic(visceralConfig, "get", MethodType.methodType(visceralConfig));
		bloodAmount = visceralConfig.getField("bloodAmount");
		bloodPools = visceralConfig.getField("bloodPools");
	}

	private static void fail(Throwable e) {
		if (available) {
			available = false;
			BladeMode.LOGGER.warn("Calling into Visceral failed; sliced creatures fall back to plain particles", e);
		}
	}

	static @Nullable Object bloodType(EntityType<?> type) {
		if (!available()) {
			return null;
		}
		try {
			return bloodTypesOf.invoke(type);
		} catch (Throwable e) {
			fail(e);
			return null;
		}
	}

	static int freshColor(Object bloodType) {
		try {
			return fresh.getInt(bloodType);
		} catch (ReflectiveOperationException | RuntimeException e) {
			fail(e);
			return 0x8C0A06;
		}
	}

	static String material(Object bloodType) {
		try {
			return String.valueOf(material.get(bloodType));
		} catch (ReflectiveOperationException | RuntimeException e) {
			fail(e);
			return "LIQUID";
		}
	}

	/** Visceral's blood amount setting (1 = normal). */
	static float amount() {
		try {
			return bloodAmount.getFloat(config.invoke());
		} catch (Throwable e) {
			fail(e);
			return 1.0F;
		}
	}

	static boolean pools() {
		try {
			return bloodPools.getBoolean(config.invoke());
		} catch (Throwable e) {
			fail(e);
			return false;
		}
	}

	/** A droplet; velocity in blocks per tick. */
	static void drop(ClientLevel level, Vec3 pos, Vec3 velocity, float size, Object bloodType) {
		try {
			drop.invoke(level, pos.x, pos.y, pos.z, velocity.x, velocity.y, velocity.z, size, bloodType);
		} catch (Throwable e) {
			fail(e);
		}
	}

	static void mist(Vec3 pos, Vec3 velocity, float size, Object bloodType, float alpha) {
		try {
			mist.invoke(pos.x, pos.y, pos.z, velocity.x, velocity.y, velocity.z, size, bloodType, alpha);
		} catch (Throwable e) {
			fail(e);
		}
	}

	static void chip(Vec3 pos, Vec3 velocity, float size, Object bloodType, int color) {
		try {
			chip.invoke(pos.x, pos.y, pos.z, velocity.x, velocity.y, velocity.z, size, bloodType, color);
		} catch (Throwable e) {
			fail(e);
		}
	}

	static void spark(Vec3 pos, Vec3 velocity, float size, int color) {
		try {
			spark.invoke(pos.x, pos.y, pos.z, velocity.x, velocity.y, velocity.z, size, color);
		} catch (Throwable e) {
			fail(e);
		}
	}

	static void feedPool(ClientLevel level, Vec3 floor, Object bloodType, float growth, float maxRadius) {
		try {
			Object ignored = feedPool.invoke(level, floor, bloodType, growth, maxRadius);
		} catch (Throwable e) {
			fail(e);
		}
	}

	/** Stops Visceral's own whole-body ragdoll for a creature that is being cut apart instead. */
	static void cancelRagdoll(Entity entity) {
		if (!available()) {
			return;
		}
		try {
			Object ragdoll = ragdollOf.invoke(ragdollManager.invoke(), entity);
			if (ragdoll != null) {
				markFailed.invoke(ragdoll);
			}
		} catch (Throwable e) {
			fail(e);
		}
	}
}
