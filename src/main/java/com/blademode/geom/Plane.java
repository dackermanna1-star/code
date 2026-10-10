package com.blademode.geom;

import com.mojang.serialization.Codec;
import com.mojang.serialization.DataResult;
import io.netty.buffer.ByteBuf;
import java.util.List;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import org.joml.Matrix3dc;
import org.joml.Vector3d;

/**
 * A clipping half-space. The solid (kept) side is where {@code nx*x + ny*y + nz*z <= d}.
 * Planes stored on blocks are expressed in block-local coordinates (the block occupies [0,1]^3).
 */
public record Plane(double nx, double ny, double nz, double d) {
	public static final Codec<Plane> CODEC = Codec.DOUBLE.listOf().comapFlatMap(
		l -> l.size() == 4
			? DataResult.success(new Plane(l.get(0), l.get(1), l.get(2), l.get(3)))
			: DataResult.error(() -> "A cut plane needs exactly 4 numbers"),
		p -> List.of(p.nx, p.ny, p.nz, p.d));

	public static final StreamCodec<ByteBuf, Plane> STREAM_CODEC = StreamCodec.composite(
		ByteBufCodecs.DOUBLE, Plane::nx,
		ByteBufCodecs.DOUBLE, Plane::ny,
		ByteBufCodecs.DOUBLE, Plane::nz,
		ByteBufCodecs.DOUBLE, Plane::d,
		Plane::new);

	public static Plane through(Vector3d normal, Vector3d point) {
		return new Plane(normal.x, normal.y, normal.z, normal.dot(point));
	}

	/** Signed distance; negative = inside the kept half-space. */
	public double dist(double x, double y, double z) {
		return this.nx * x + this.ny * y + this.nz * z - this.d;
	}

	public double dist(Vector3d p) {
		return this.dist(p.x, p.y, p.z);
	}

	public Plane flip() {
		return new Plane(-this.nx, -this.ny, -this.nz, -this.d);
	}

	/** Re-expresses the plane in a coordinate system whose origin sits at {@code t} (p' = p - t). */
	public Plane translated(double tx, double ty, double tz) {
		return new Plane(this.nx, this.ny, this.nz, this.d - (this.nx * tx + this.ny * ty + this.nz * tz));
	}

	/**
	 * Applies the transform p' = R p + t to the plane (R must be a rotation).
	 * Points satisfying the old plane map to points satisfying the new one.
	 */
	public Plane transformed(Matrix3dc rot, double tx, double ty, double tz) {
		Vector3d n = rot.transform(new Vector3d(this.nx, this.ny, this.nz));
		return new Plane(n.x, n.y, n.z, this.d + n.x * tx + n.y * ty + n.z * tz);
	}

	public Vector3d normal() {
		return new Vector3d(this.nx, this.ny, this.nz);
	}

	/** Min/max signed distance of the axis-aligned box corners. */
	public double minDist(double x0, double y0, double z0, double x1, double y1, double z1) {
		return this.nx * (this.nx >= 0 ? x0 : x1) + this.ny * (this.ny >= 0 ? y0 : y1) + this.nz * (this.nz >= 0 ? z0 : z1) - this.d;
	}

	public double maxDist(double x0, double y0, double z0, double x1, double y1, double z1) {
		return this.nx * (this.nx >= 0 ? x1 : x0) + this.ny * (this.ny >= 0 ? y1 : y0) + this.nz * (this.nz >= 0 ? z1 : z0) - this.d;
	}
}
