package dev.calibercraft.client.fx;

import dev.calibercraft.client.ClientGunData;
import dev.calibercraft.client.config.ClientConfig;
import dev.calibercraft.client.hud.GunHud;
import dev.calibercraft.client.render.FirstPersonRenderer;
import dev.calibercraft.client.sound.GunSounds;
import dev.calibercraft.combat.SurfaceType;
import dev.calibercraft.core.ActionType;
import dev.calibercraft.core.Ballistics;
import dev.calibercraft.core.Stat;
import dev.calibercraft.core.WeaponCategory;
import dev.calibercraft.core.WeaponStats;
import dev.calibercraft.data.AmmoDefinition;
import dev.calibercraft.data.WeaponDefinition;
import dev.calibercraft.item.WeaponStacks;
import dev.calibercraft.network.HitConfirmPayload;
import dev.calibercraft.network.ImpactPayload;
import dev.calibercraft.network.ShotEventPayload;
import dev.calibercraft.network.WhizPayload;
import dev.calibercraft.registry.ModParticles;
import dev.calibercraft.registry.ModSounds;
import net.minecraft.client.Camera;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.core.Direction;
import net.minecraft.core.particles.BlockParticleOption;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.resources.Identifier;
import net.minecraft.util.RandomSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.level.ClipContext;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;
import org.joml.Vector3f;

/** Client-side presentation of shots, impacts and hits. Never changes gameplay state. */
public final class ClientEffects {
	private static final RandomSource RANDOM = RandomSource.create();

	private ClientEffects() {
	}

	private static ClientConfig cfg() {
		return ClientConfig.get();
	}

	private static int count(int base) {
		float s = cfg().particleScale() * base;
		int n = (int) s;
		return RANDOM.nextFloat() < s - n ? n + 1 : n;
	}

	/** Converts a recorded first-person view-space point into a world position. */
	private static Vec3 viewToWorld(Vector3f view) {
		Camera cam = Minecraft.getInstance().gameRenderer.getMainCamera();
		Vector3f w = new Vector3f(view).rotate(cam.rotation());
		return cam.position().add(w.x, w.y, w.z);
	}

	private static Vec3 cameraRight() {
		Camera cam = Minecraft.getInstance().gameRenderer.getMainCamera();
		Vector3f r = new Vector3f(1, 0, 0).rotate(cam.rotation());
		return new Vec3(r.x, r.y, r.z);
	}

	// ------------------------------------------------------------------------------------------------ own shots

	public static void ownShot(LocalPlayer player, Identifier weaponId, WeaponDefinition def, WeaponStats stats, float yaw, float pitch,
			float spread, long seed, boolean suppressed) {
		GunSounds.ownShot(weaponId, def, suppressed, stats.f(Stat.LOUDNESS));
		ClientLevel level = (ClientLevel) player.level();
		boolean firstPerson = Minecraft.getInstance().options.getCameraType().isFirstPerson() && FirstPersonRenderer.hasRecentView;
		Vec3 eye = player.getEyePosition();
		Vec3 look = player.getViewVector(1.0f);
		Vec3 muzzle = firstPerson ? viewToWorld(FirstPersonRenderer.LAST_MUZZLE_VIEW) : eye.add(look.scale(1.0)).add(cameraRight().scale(0.25))
			.add(0, -0.25, 0);
		smoke(level, muzzle, look, stats, suppressed);
		if (def.action() == ActionType.SELF_LOADING) {
			Vec3 eject = firstPerson ? viewToWorld(FirstPersonRenderer.LAST_EJECT_VIEW) : eye.add(cameraRight().scale(0.25)).add(0, -0.2, 0);
			casing(level, eject, cameraRight(), look, def.category() == WeaponCategory.SHOTGUN);
		}
		tracers(level, eye, muzzle, yaw, pitch, spread, seed, stats.i(Stat.PELLETS), stats.get(Stat.VELOCITY),
			tracerColor(WeaponStacks.activeAmmo(WeaponStacks.state(player.getMainHandItem()), def, ClientGunData.data())
				.map(id -> ClientGunData.data().ammo().get(id)).orElse(null)), stats.get(Stat.MAX_RANGE));
	}

	/** Casings ejected by manual actions / revolver reloads at their animation cue. */
	public static void ejectForCue(Identifier weaponId, WeaponDefinition def, String cue) {
		Minecraft mc = Minecraft.getInstance();
		LocalPlayer player = mc.player;
		if (player == null || !cfg().shellCasings) {
			return;
		}
		ClientLevel level = (ClientLevel) player.level();
		boolean firstPerson = mc.options.getCameraType().isFirstPerson() && FirstPersonRenderer.hasRecentView;
		Vec3 eject = firstPerson ? viewToWorld(FirstPersonRenderer.LAST_EJECT_VIEW) : player.getEyePosition().add(cameraRight().scale(0.25));
		boolean shell = def.category() == WeaponCategory.SHOTGUN;
		int n = "eject".equals(cue) ? 6 : 1;
		for (int i = 0; i < n; i++) {
			casing(level, eject, "eject".equals(cue) ? new Vec3(0, -0.3, 0) : cameraRight(), player.getViewVector(1.0f), shell);
		}
	}

	private static void smoke(ClientLevel level, Vec3 muzzle, Vec3 look, WeaponStats stats, boolean suppressed) {
		int n = count(suppressed ? 1 : 2);
		for (int i = 0; i < n; i++) {
			level.addParticle(ModParticles.MUZZLE_SMOKE, muzzle.x, muzzle.y, muzzle.z, look.x * 0.02, look.y * 0.02 + 0.005, look.z * 0.02);
		}
	}

	private static void casing(ClientLevel level, Vec3 pos, Vec3 right, Vec3 look, boolean shell) {
		if (!cfg().shellCasings || cfg().maxCasings <= 0) {
			return;
		}
		Vec3 v = right.scale(0.10 + RANDOM.nextFloat() * 0.05).add(0, 0.09 + RANDOM.nextFloat() * 0.05, 0).add(look.scale(-0.02));
		level.addParticle(shell ? ModParticles.CASING_SHELL : ModParticles.CASING_BRASS, pos.x, pos.y, pos.z, v.x, v.y, v.z);
	}

	private static int tracerColor(AmmoDefinition ammo) {
		return ammo == null ? 0xFFFFD27F : ammo.tracerColor();
	}

	private static void tracers(ClientLevel level, Vec3 eye, Vec3 muzzle, float yaw, float pitch, float spread, long seed, int pellets,
			double velocity, int color, double maxRange) {
		if (!cfg().tracers) {
			return;
		}
		double[] dirs = Ballistics.pelletDirections(seed, Ballistics.direction(yaw, pitch), spread, pellets);
		int drawn = pellets > 3 ? Math.max(2, count(pellets / 2)) : pellets;
		double range = Math.min(160, maxRange);
		for (int i = 0; i < drawn; i++) {
			Vec3 d = new Vec3(dirs[i * 3], dirs[i * 3 + 1], dirs[i * 3 + 2]);
			Vec3 end = eye.add(d.scale(range));
			HitResult hit = level.clip(new ClipContext(eye, end, ClipContext.Block.COLLIDER, ClipContext.Fluid.NONE, Minecraft.getInstance().player));
			if (hit.getType() != HitResult.Type.MISS) {
				end = hit.getLocation();
			}
			TracerRenderer.add(muzzle, end, velocity, pellets > 1 ? 0.012f : 0.018f, color);
		}
	}

	// ------------------------------------------------------------------------------------------------ remote shots

	public static void remoteShot(ShotEventPayload p) {
		Minecraft mc = Minecraft.getInstance();
		ClientLevel level = mc.level;
		if (level == null) {
			return;
		}
		WeaponDefinition def = ClientGunData.data().weapons().get(p.weapon());
		Vec3 origin = new Vec3(p.x(), p.y(), p.z());
		Vec3 look = Vec3.directionFromRotation(p.pitch(), p.yaw());
		Entity shooter = level.getEntity(p.shooterId());
		Vec3 right = look.cross(new Vec3(0, 1, 0)).normalize();
		Vec3 muzzle = origin.add(look.scale(0.9)).add(right.scale(0.28)).add(0, -0.28, 0);
		boolean suppressed = (p.flags() & ShotEventPayload.SUPPRESSED) != 0;
		if (def != null) {
			GunSounds.remoteShot(p.weapon(), def, origin, suppressed, p.loudness());
		}
		if (shooter != null && shooter.distanceToSqr(mc.gameRenderer.getMainCamera().position()) > 96 * 96) {
			return; // far away: sound only
		}
		if (cfg().muzzleFlash && p.flash() > 0.05f) {
			level.addParticle(ModParticles.MUZZLE_FLASH, muzzle.x, muzzle.y, muzzle.z, 0.25 + 0.15 * p.flash(), 0, 0);
		}
		smokeRemote(level, muzzle, look);
		if (def != null && def.action() == ActionType.SELF_LOADING) {
			casing(level, origin.add(right.scale(0.25)).add(0, -0.25, 0), right, look, def.category() == WeaponCategory.SHOTGUN);
		}
		if ((p.flags() & ShotEventPayload.TRACER) != 0 && def != null) {
			tracers(level, origin, muzzle, p.yaw(), p.pitch(), p.spread(), p.seed(), p.pellets(), def.stats().get(Stat.VELOCITY), p.tracerColor(),
				def.stats().get(Stat.MAX_RANGE));
		}
	}

	private static void smokeRemote(ClientLevel level, Vec3 muzzle, Vec3 look) {
		for (int i = 0; i < count(2); i++) {
			level.addParticle(ModParticles.MUZZLE_SMOKE, muzzle.x, muzzle.y, muzzle.z, look.x * 0.02, 0.01, look.z * 0.02);
		}
	}

	// ------------------------------------------------------------------------------------------------ impacts

	public static void impacts(ImpactPayload payload) {
		ClientLevel level = Minecraft.getInstance().level;
		if (level == null) {
			return;
		}
		for (ImpactPayload.Impact im : payload.impacts()) {
			impact(level, im);
		}
	}

	private static void impact(ClientLevel level, ImpactPayload.Impact im) {
		Vec3 pos = new Vec3(im.x(), im.y(), im.z());
		ImpactPayload.Kind kind = ImpactPayload.Kind.values()[Math.floorMod(im.kind(), ImpactPayload.Kind.values().length)];
		Direction face = im.face() >= 0 && im.face() < 6 ? Direction.values()[im.face()] : Direction.UP;
		Vec3 n = Vec3.atLowerCornerOf(face.getUnitVec3i());
		switch (kind) {
			case ENTITY -> {
				GunSounds.playAt(ModSounds.get("impact.flesh"), pos, 0.6f, 0.95f + RANDOM.nextFloat() * 0.1f);
				for (int i = 0; i < count(3); i++) {
					level.addParticle(ParticleTypes.DAMAGE_INDICATOR, pos.x, pos.y, pos.z, (RANDOM.nextFloat() - 0.5) * 0.1, 0.05,
						(RANDOM.nextFloat() - 0.5) * 0.1);
				}
			}
			case WATER -> {
				GunSounds.playAt(ModSounds.get("impact.water"), pos, 0.8f, 0.9f + RANDOM.nextFloat() * 0.2f);
				for (int i = 0; i < count(10); i++) {
					level.addParticle(ParticleTypes.SPLASH, pos.x, pos.y + 0.05, pos.z, (RANDOM.nextFloat() - 0.5) * 0.2, 0.25,
						(RANDOM.nextFloat() - 0.5) * 0.2);
				}
				for (int i = 0; i < count(4); i++) {
					level.addParticle(ParticleTypes.BUBBLE, pos.x, pos.y - 0.2, pos.z, 0, -0.05, 0);
				}
			}
			case BLOCK, RICOCHET, SHATTER -> {
				BlockState state = Block.stateById(im.blockState());
				SurfaceType surface = state.isAir() ? SurfaceType.STONE : SurfaceType.of(state);
				blockImpact(level, pos, n, face, state, surface, kind);
			}
		}
	}

	private static void blockImpact(ClientLevel level, Vec3 pos, Vec3 n, Direction face, BlockState state, SurfaceType surface,
			ImpactPayload.Kind kind) {
		String sound = switch (surface) {
			case STONE -> "impact.stone";
			case DIRT, SAND -> "impact.dirt";
			case WOOD -> "impact.wood";
			case METAL -> "impact.metal";
			case GLASS -> "impact.glass";
			case WATER -> "impact.water";
			case FLESH -> "impact.flesh";
			case SOFT -> "impact.soft";
		};
		GunSounds.playAt(ModSounds.get(sound), pos, 0.75f, 0.9f + RANDOM.nextFloat() * 0.2f);
		if (kind == ImpactPayload.Kind.RICOCHET) {
			GunSounds.playAt(ModSounds.get("bullet.ricochet"), pos, 0.9f, 0.9f + RANDOM.nextFloat() * 0.2f);
		}
		if (!state.isAir() && state.getRenderShape() != net.minecraft.world.level.block.RenderShape.INVISIBLE) {
			BlockParticleOption debris = new BlockParticleOption(ParticleTypes.BLOCK, state);
			for (int i = 0; i < count(surface == SurfaceType.SOFT ? 4 : 7); i++) {
				Vec3 v = n.scale(0.12 + RANDOM.nextFloat() * 0.12).add((RANDOM.nextFloat() - 0.5) * 0.15, RANDOM.nextFloat() * 0.12,
					(RANDOM.nextFloat() - 0.5) * 0.15);
				level.addParticle(debris, pos.x, pos.y, pos.z, v.x, v.y, v.z);
			}
		}
		if (surface == SurfaceType.STONE || surface == SurfaceType.DIRT || surface == SurfaceType.SAND || surface == SurfaceType.WOOD) {
			for (int i = 0; i < count(2); i++) {
				level.addParticle(ModParticles.MUZZLE_SMOKE, pos.x + n.x * 0.05, pos.y + n.y * 0.05, pos.z + n.z * 0.05, n.x * 0.02, n.y * 0.02 + 0.01,
					n.z * 0.02);
			}
		}
		if (surface == SurfaceType.METAL || surface == SurfaceType.STONE && RANDOM.nextFloat() < 0.4f || kind == ImpactPayload.Kind.RICOCHET) {
			int sparks = surface == SurfaceType.METAL ? 7 : 3;
			for (int i = 0; i < count(sparks); i++) {
				Vec3 v = n.scale(0.1 + RANDOM.nextFloat() * 0.15).add((RANDOM.nextFloat() - 0.5) * 0.25, RANDOM.nextFloat() * 0.18,
					(RANDOM.nextFloat() - 0.5) * 0.25);
				level.addParticle(ModParticles.SPARK, pos.x, pos.y, pos.z, v.x, v.y, v.z);
			}
			level.addParticle(ModParticles.IMPACT_FLASH, pos.x + n.x * 0.03, pos.y + n.y * 0.03, pos.z + n.z * 0.03, 0, 0, 0);
		}
		boolean decal = cfg().bulletHoles && kind != ImpactPayload.Kind.SHATTER && surface != SurfaceType.SOFT && surface != SurfaceType.GLASS
			&& state.isCollisionShapeFullBlock(level, net.minecraft.core.BlockPos.containing(pos.subtract(n.scale(0.01))));
		if (decal) {
			level.addParticle(ModParticles.BULLET_HOLE, pos.x, pos.y, pos.z, n.x, n.y, n.z);
		}
	}

	public static void whiz(WhizPayload p) {
		GunSounds.playAt(ModSounds.get("bullet.whiz"), new Vec3(p.x(), p.y(), p.z()), 0.9f, 0.9f + RANDOM.nextFloat() * 0.25f);
	}

	public static void hitConfirm(HitConfirmPayload p) {
		GunHud.onHit(p);
		if (cfg().hitMarkers) {
			String s = switch (p.kind()) {
				case HitConfirmPayload.KILL -> "hit.kill";
				case HitConfirmPayload.HEADSHOT -> "hit.headshot";
				default -> "hit.marker";
			};
			GunSounds.playUi(ModSounds.get(s), 0.55f, 1.0f);
		}
	}
}
