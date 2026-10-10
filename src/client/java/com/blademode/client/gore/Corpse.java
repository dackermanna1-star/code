package com.blademode.client.gore;

import com.blademode.geom.Plane;
import com.blademode.gore.BlockCollider;
import com.blademode.gore.Body;
import com.blademode.gore.Ragdoll;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.world.entity.EntityType;
import org.joml.Vector3d;
import org.jspecify.annotations.Nullable;

/** A creature that was cut apart: its frozen model, the pieces' physics and the wounds that bleed. */
final class Corpse {
	final int entityId;
	final EntityType<?> type;
	final List<CaptureCollector.Layer> layers;
	final Ragdoll ragdoll;
	final BloodStyle blood;
	final BlockCollider collider;
	final List<Wound> wounds = new ArrayList<>();
	int age;
	/** The latest cut, so the same slash arriving twice (as a kill and as a slash) cuts once. */
	@Nullable Plane lastCut;
	int lastCutAge;

	/** An open cut face (or torn joint) on a body, in body space so it moves with it. */
	static final class Wound {
		final Body body;
		final Vector3d local;
		final Vector3d normal;
		/** Area of the cut face, blocks². */
		final double area;
		final int born;

		Wound(Body body, Vector3d world, Vector3d worldNormal, double area, int born) {
			this.body = body;
			this.local = body.rot.transformInverse(new Vector3d(world).sub(body.pos));
			this.normal = body.rot.transformInverse(new Vector3d(worldNormal)).normalize();
			this.area = area;
			this.born = born;
		}

		Vector3d position() {
			return this.body.worldPoint(this.local, new Vector3d());
		}

		Vector3d direction() {
			return this.body.rot.transform(this.normal, new Vector3d());
		}
	}

	Corpse(int entityId, EntityType<?> type, List<CaptureCollector.Layer> layers, Ragdoll ragdoll, BloodStyle blood, ClientLevel level) {
		this.entityId = entityId;
		this.type = type;
		this.layers = layers;
		this.ragdoll = ragdoll;
		this.blood = blood;
		this.collider = new BlockCollider(level);
	}

	boolean wasJustCutBy(Plane plane) {
		Plane last = this.lastCut;
		return last != null && this.age - this.lastCutAge <= 5
			&& last.nx() * plane.nx() + last.ny() * plane.ny() + last.nz() * plane.nz() > 0.9999 && Math.abs(last.d() - plane.d()) < 1.0E-3;
	}

	/** Drops wounds whose body was cut up again (the new halves got wounds of their own). */
	void forgetLostWounds() {
		this.wounds.removeIf(w -> !this.ragdoll.bodies.contains(w.body));
	}
}
