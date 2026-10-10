package com.blademode.client.gore;

import com.blademode.BladeConfig;
import com.blademode.geom.ConvexPart;
import com.blademode.geom.Plane;
import com.blademode.geom.Poly;
import com.blademode.gore.Body;
import com.blademode.gore.Cube;
import com.blademode.gore.Piece;
import com.blademode.gore.Ragdoll;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.particle.Particle;
import net.minecraft.core.Direction;
import net.minecraft.core.particles.BlockParticleOption;
import net.minecraft.core.particles.ParticleOptions;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.server.level.ParticleStatus;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.ClipContext;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;
import net.minecraft.world.phys.shapes.CollisionContext;
import org.joml.Vector3d;

/**
 * What comes out of a cut creature: a spray from every face the blade opened, spurts in time with
 * a dying heartbeat, drips, and (with Visceral) stains and pools. Bone chips, sparks, splinters,
 * snow or embers for creatures that have no blood.
 */
final class Gore {
	/** Ticks a fresh cut keeps spurting. */
	private static final int GUSH_TICKS = 70;
	/** Ticks it keeps dripping afterwards. */
	private static final int DRIP_TICKS = 400;
	private static final RandomSource RANDOM = RandomSource.create();

	private Gore() {
	}

	/** Records the wounds a cut opened and sprays from them. */
	static void onCut(ClientLevel level, Corpse corpse, Ragdoll.Cut cut, Plane plane, Vector3d blade) {
		Vector3d n = new Vector3d(plane.nx(), plane.ny(), plane.nz());
		Vector3d soundAt = null;
		double largest = 0;
		for (Body body : cut.created()) {
			// The back half keeps n·p <= d, so its new face looks along +n.
			Vector3d outward = new Vector3d(n).mul(cut.sides().get(body) < 0 ? 1 : -1);
			Vector3d[] centre = new Vector3d[1];
			double area = capArea(body, centre);
			if (area < 1.0E-4) {
				continue;
			}
			corpse.wounds.add(new Corpse.Wound(body, centre[0], outward, area, corpse.age));
			burst(level, corpse, centre[0], outward, blade, area);
			if (area > largest) {
				largest = area;
				soundAt = centre[0];
			}
		}
		for (Ragdoll.Severed severed : cut.severed()) {
			// Two whole parts torn apart where they met: both ends bleed.
			Vector3d towardB = new Vector3d(severed.b().pos).sub(severed.a().pos).normalize();
			double area = 0.04;
			corpse.wounds.add(new Corpse.Wound(severed.a(), severed.at(), towardB, area, corpse.age));
			corpse.wounds.add(new Corpse.Wound(severed.b(), severed.at(), new Vector3d(towardB).negate(), area, corpse.age));
			burst(level, corpse, severed.at(), n, blade, area);
			burst(level, corpse, severed.at(), new Vector3d(n).negate(), blade, area);
			if (soundAt == null) {
				soundAt = severed.at();
			}
		}
		if (soundAt != null) {
			sound(level, corpse, soundAt);
		}
	}

	/**
	 * Area (world) of the faces the most recent cut left on a fresh body, and their centre.
	 * Pieces are freshly rebased, so their {@code world0} is where they are now.
	 */
	private static double capArea(Body body, Vector3d[] centreOut) {
		boolean hasMain = body.pieces.stream().anyMatch(Piece::isMain);
		Vector3d centre = new Vector3d();
		double area = 0;
		for (Piece piece : body.pieces) {
			if (piece.planes.isEmpty() || hasMain && !piece.isMain()) {
				continue;
			}
			int last = piece.planes.size() - 1;
			for (Cube cube : piece.cubes) {
				ConvexPart solid = new ConvexPart(cube.x0, cube.y0, cube.z0, cube.x1, cube.y1, cube.z1, piece.planes);
				for (ConvexPart.Face face : solid.faces) {
					if (!face.isCap() || face.planeIndex() != last) {
						continue;
					}
					Poly p = face.poly();
					Vector3d sum = new Vector3d();
					Vector3d[] world = new Vector3d[p.count];
					for (int i = 0; i < p.count; i++) {
						world[i] = piece.world0.transformPosition(new Vector3d(p.x(i), p.y(i), p.z(i))).add(body.anchor);
						sum.add(world[i]);
					}
					Vector3d cross = new Vector3d();
					for (int i = 0; i < p.count; i++) {
						Vector3d a = world[i];
						Vector3d b = world[(i + 1) % p.count];
						cross.add(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
					}
					double faceArea = cross.length() * 0.5;
					centre.fma(faceArea, sum.div(p.count));
					area += faceArea;
				}
			}
		}
		centreOut[0] = area > 0 ? centre.div(area) : new Vector3d(body.pos);
		return area;
	}

	/** What cutting through this creature sounds like. */
	private static void sound(ClientLevel level, Corpse corpse, Vector3d at) {
		SoundEvent sound = switch (corpse.blood.kind()) {
			case LIQUID -> SoundEvents.HONEY_BLOCK_BREAK;
			case SLIME -> SoundEvents.SLIME_SQUISH_SMALL;
			case BONE -> SoundEvents.BONE_BLOCK_BREAK;
			case METAL -> SoundEvents.IRON_GOLEM_DAMAGE;
			case WOOD -> SoundEvents.WOOD_BREAK;
			case SNOW -> SoundEvents.SNOW_BREAK;
			case EMBER -> SoundEvents.FIRE_EXTINGUISH;
			case SPIRIT -> SoundEvents.AMETHYST_BLOCK_CHIME;
			case NONE -> null;
		};
		if (sound != null) {
			level.playLocalSound(at.x, at.y, at.z, sound, SoundSource.NEUTRAL, 0.9F, 0.75F + RANDOM.nextFloat() * 0.2F, false);
		}
	}

	/** The first spray when the blade opens a face. */
	private static void burst(ClientLevel level, Corpse corpse, Vector3d at, Vector3d outward, Vector3d blade, double area) {
		if (!BladeConfig.get().gore || corpse.blood.kind() == BloodStyle.Kind.NONE) {
			return;
		}
		float amount = amount(corpse);
		double radius = Math.min(0.35, Math.sqrt(area) * 0.5);
		int count = (int) Math.min(70, Math.round((14 + area * 160) * amount));
		for (int i = 0; i < count; i++) {
			Vec3 pos = jitter(at, radius);
			Vector3d v = cone(outward, 0.55).mul(0.08 + RANDOM.nextDouble() * 0.22).fma(0.06 + RANDOM.nextDouble() * 0.08, blade);
			emit(level, corpse, pos, new Vec3(v.x, v.y + 0.04, v.z), 0.018F + RANDOM.nextFloat() * RANDOM.nextFloat() * 0.045F);
		}
		mist(corpse, at, outward, 2 + (int) (area * 20));
	}

	/** Spurts and drips from open wounds; feeds pools under resting pieces. */
	static void tick(ClientLevel level, Corpse corpse) {
		if (!BladeConfig.get().gore || !corpse.blood.kind().bleeds()) {
			return;
		}
		corpse.forgetLostWounds();
		float amount = amount(corpse);
		for (Corpse.Wound wound : corpse.wounds) {
			int age = corpse.age - wound.born;
			if (age > DRIP_TICKS) {
				continue;
			}
			Vector3d at = wound.position();
			Vector3d dir = wound.direction();
			Vector3d motion = wound.body.pointVelocity(new Vector3d(at).sub(wound.body.pos), new Vector3d()).mul(0.05);
			if (age < GUSH_TICKS) {
				// A dying heartbeat: strong spurts that weaken.
				double strength = Math.pow(1.0 - age / (double) GUSH_TICKS, 2);
				boolean spurt = age % 12 < 3;
				int count = (int) Math.round((spurt ? 3 + wound.area * 60 : wound.area * 6) * strength * amount);
				if (!spurt && RANDOM.nextFloat() < 0.4F * strength * amount) {
					count = Math.max(count, 1);
				}
				double radius = Math.min(0.25, Math.sqrt(wound.area) * 0.4);
				for (int i = 0; i < count; i++) {
					Vector3d v = cone(dir, spurt ? 0.3 : 0.6).mul((spurt ? 0.06 + 0.16 * strength : 0.02) * (0.6 + RANDOM.nextDouble() * 0.6)).add(motion);
					emit(level, corpse, jitter(at, radius), new Vec3(v.x, v.y, v.z), 0.016F + RANDOM.nextFloat() * 0.03F);
				}
			} else if (age % 7 == 0 && RANDOM.nextFloat() < 0.7F) {
				emit(level, corpse, jitter(at, 0.05), new Vec3(motion.x, motion.y - 0.01, motion.z), 0.015F + RANDOM.nextFloat() * 0.02F);
			}
			if (age > 12 && age % 8 == 0 && corpse.blood.visceral() != null && VisceralBridge.pools()
				&& wound.body.vel.length() < 0.6 && age < 900) {
				feedPool(level, corpse, wound, at);
			}
		}
	}

	private static void feedPool(ClientLevel level, Corpse corpse, Corpse.Wound wound, Vector3d at) {
		Vec3 start = new Vec3(at.x, at.y + 0.2, at.z);
		BlockHitResult hit = level.clip(new ClipContext(start, start.add(0, -2.5, 0), ClipContext.Block.COLLIDER, ClipContext.Fluid.ANY, CollisionContext.empty()));
		if (hit.getType() != HitResult.Type.BLOCK || hit.getDirection() != Direction.UP || !level.getFluidState(hit.getBlockPos()).isEmpty()) {
			return;
		}
		float maxRadius = (float) Math.max(0.25, Math.min(1.1, 0.25 + Math.sqrt(wound.area) * 1.6));
		VisceralBridge.feedPool(level, hit.getLocation(), corpse.blood.visceral(), 0.03F, maxRadius);
	}

	private static float amount(Corpse corpse) {
		ParticleStatus status = Minecraft.getInstance().options.particles().get();
		float setting = switch (status) {
			case ALL -> 1.0F;
			case DECREASED -> 0.55F;
			case MINIMAL -> 0.2F;
		};
		return corpse.blood.visceral() != null ? setting * VisceralBridge.amount() : setting;
	}

	/** One bit of gore; velocity in blocks per tick. */
	private static void emit(ClientLevel level, Corpse corpse, Vec3 pos, Vec3 velocity, float size) {
		BloodStyle style = corpse.blood;
		Object visceral = style.visceral();
		if (visceral != null) {
			switch (style.kind()) {
				case LIQUID, SLIME -> VisceralBridge.drop(level, pos, velocity, size * (style.kind() == BloodStyle.Kind.SLIME ? 1.5F : 1.0F), visceral);
				case METAL -> VisceralBridge.spark(pos, velocity.scale(1.4), size, RANDOM.nextBoolean() ? 0xFFD27A : 0xFFF2C4);
				case EMBER -> level.addParticle(RANDOM.nextBoolean() ? ParticleTypes.FLAME : ParticleTypes.SMALL_FLAME, pos.x, pos.y, pos.z, velocity.x, velocity.y, velocity.z);
				case SPIRIT -> level.addParticle(ParticleTypes.END_ROD, pos.x, pos.y, pos.z, velocity.x * 0.4, velocity.y * 0.4, velocity.z * 0.4);
				default -> VisceralBridge.chip(pos, velocity, size * 1.2F, visceral, BloodStyle.lerp(style.blood(), 0xFFFFFF, RANDOM.nextFloat() * 0.25F));
			}
			return;
		}
		ParticleOptions options = switch (style.kind()) {
			case EMBER -> RANDOM.nextBoolean() ? ParticleTypes.FLAME : ParticleTypes.SMALL_FLAME;
			case SPIRIT -> ParticleTypes.END_ROD;
			case METAL -> RANDOM.nextInt(3) == 0 ? ParticleTypes.ELECTRIC_SPARK : new BlockParticleOption(ParticleTypes.BLOCK, Blocks.IRON_BLOCK.defaultBlockState());
			default -> new BlockParticleOption(ParticleTypes.BLOCK, blockFor(style));
		};
		Minecraft mc = Minecraft.getInstance();
		if (mc.gameRenderer.getMainCamera().position().distanceToSqr(pos) > 48 * 48) {
			return;
		}
		Particle particle = mc.particleEngine.createParticle(options, pos.x, pos.y, pos.z, velocity.x, velocity.y, velocity.z);
		if (particle != null) {
			// Block particles make up their own direction; blood goes where the wound sends it.
			particle.setParticleSpeed(velocity.x, velocity.y, velocity.z);
			if (options instanceof BlockParticleOption) {
				particle.scale(0.45F + size * 8.0F);
			}
		}
	}

	private static void mist(Corpse corpse, Vector3d at, Vector3d outward, int count) {
		if (corpse.blood.visceral() == null || !corpse.blood.kind().bleeds()) {
			return;
		}
		for (int i = 0; i < count; i++) {
			Vector3d v = cone(outward, 0.7).mul(0.03 + RANDOM.nextDouble() * 0.05);
			VisceralBridge.mist(new Vec3(at.x, at.y, at.z), new Vec3(v.x, v.y, v.z), 0.1F + RANDOM.nextFloat() * 0.12F, corpse.blood.visceral(),
				0.14F + RANDOM.nextFloat() * 0.12F);
		}
	}

	/** Without Visceral: block particles in about the right color. */
	private static BlockState blockFor(BloodStyle style) {
		return switch (style.kind()) {
			case BONE -> Blocks.BONE_BLOCK.defaultBlockState();
			case WOOD -> Blocks.OAK_PLANKS.defaultBlockState();
			case SNOW -> Blocks.SNOW_BLOCK.defaultBlockState();
			case SLIME -> Blocks.SLIME_BLOCK.defaultBlockState();
			default -> {
				int c = style.blood();
				int r = (c >> 16) & 0xFF;
				int g = (c >> 8) & 0xFF;
				int b = c & 0xFF;
				if (g > r && g > b) {
					yield Blocks.LIME_TERRACOTTA.defaultBlockState();
				}
				if (b > r) {
					yield r > 60 ? Blocks.PURPLE_CONCRETE.defaultBlockState() : Blocks.BLUE_CONCRETE.defaultBlockState();
				}
				if (r > 200 && g > 90) {
					yield Blocks.MAGMA_BLOCK.defaultBlockState();
				}
				yield r < 110 ? Blocks.NETHER_WART_BLOCK.defaultBlockState() : Blocks.REDSTONE_BLOCK.defaultBlockState();
			}
		};
	}

	private static Vec3 jitter(Vector3d at, double radius) {
		return new Vec3(at.x + (RANDOM.nextDouble() - 0.5) * 2 * radius, at.y + (RANDOM.nextDouble() - 0.5) * 2 * radius, at.z + (RANDOM.nextDouble() - 0.5) * 2 * radius);
	}

	/** Random unit vector within roughly {@code spread} radians of {@code axis}. */
	private static Vector3d cone(Vector3d axis, double spread) {
		Vector3d a = axis.lengthSquared() < 1.0E-8 ? new Vector3d(0, 1, 0) : new Vector3d(axis).normalize();
		a.add(RANDOM.nextGaussian() * spread * 0.6, RANDOM.nextGaussian() * spread * 0.6, RANDOM.nextGaussian() * spread * 0.6);
		return a.lengthSquared() < 1.0E-8 ? new Vector3d(0, 1, 0) : a.normalize();
	}

}
