package com.mineception.dream.render;

import static com.mineception.dream.render.Raycaster.DOWN;
import static com.mineception.dream.render.Raycaster.EAST;
import static com.mineception.dream.render.Raycaster.EMISSIVE;
import static com.mineception.dream.render.Raycaster.FACE_SHADE;
import static com.mineception.dream.render.Raycaster.GLASS;
import static com.mineception.dream.render.Raycaster.KIND;
import static com.mineception.dream.render.Raycaster.K_CUTOUT;
import static com.mineception.dream.render.Raycaster.K_LIQUID;
import static com.mineception.dream.render.Raycaster.K_OPAQUE;
import static com.mineception.dream.render.Raycaster.K_SPECIAL;
import static com.mineception.dream.render.Raycaster.K_TRANSLUCENT;
import static com.mineception.dream.render.Raycaster.NORTH;
import static com.mineception.dream.render.Raycaster.OCCLUDES;
import static com.mineception.dream.render.Raycaster.SOUTH;
import static com.mineception.dream.render.Raycaster.UP;
import static com.mineception.dream.render.Raycaster.VARIANT;
import static com.mineception.dream.render.Raycaster.WATER;
import static com.mineception.dream.render.Raycaster.WEST;
import static com.mineception.dream.render.Raycaster.hash;

import com.mineception.dream.Face;
import com.mineception.dream.LaptopGeometry;
import com.mineception.dream.MiniHit;
import com.mineception.dream.MiniWorld;
import com.mineception.dream.Theme;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Everything one {@link Raycaster#render} call needs, computed once on the calling thread and then only read by the
 * threads tracing the rows: camera rays, the light map, sky, fog and weather parameters.
 */
final class RayFrame {
	private static final int SX = MiniWorld.SX;
	private static final int SZ = MiniWorld.SZ;
	/** Light map resolution: quarter light levels 0..15. */
	private static final int LUT_SIZE = 61;
	private static final int MAX_LAYERS = 8;
	private static final double WATER_ABSORPTION = 0.16;
	private static final double NO_HIT = Double.MAX_VALUE;

	private static final Face[] FACES = Face.values();
	/** Index into Face.HORIZONTAL for each face ordinal (-1 for up/down). */
	private static final int[] HORIZONTAL_INDEX = {-1, -1, 2, 0, 1, 3};

	// Laptop colours (reference pixel art at 1/16 and 1/32 of a block)
	private static final int LAPTOP_BODY = 0x5B6068;
	private static final int LAPTOP_EDGE = 0x484C53;
	private static final int LAPTOP_DECK = 0x4C5057;
	private static final int LAPTOP_KEY = 0x1E2024;
	private static final int LAPTOP_KEY_GAP = 0x393D43;
	private static final int LAPTOP_PAD = 0x6B7179;
	private static final int LAPTOP_BEZEL = 0x141518;
	private static final int LAPTOP_CAMERA = 0x2E333A;
	private static final int LOGO_GRASS = 0x7CC25A;
	private static final int LOGO_DIRT = 0x8C6343;

	private final byte[] blocks;
	private final int[][] tex;
	private final LightField light;
	private final ScreenImage child;
	private final int width;

	private final double ox;
	private final double oy;
	private final double oz;
	private final double fx;
	private final double fy;
	private final double fz;
	private final double rx;
	private final double ry;
	private final double rz;
	private final double ux;
	private final double uy;
	private final double uz;
	private final double[] colX;
	private final double[] rowY;
	private final float[] colDeg;
	private final float[] rowDeg;
	private final float yawDeg;
	private final float pitchDeg;
	private final double pixelAngle;
	private final float degPerPixel;

	private final long gameTime;
	private final float partialTick;
	private final double time;
	private final int topY;

	private final float[] lut;
	private final boolean indoor;
	private final double fogStart;
	private final double fogEnd;
	private final int fogColor;
	private final boolean cameraInWater;
	private final int cameraId;
	private final int waterFog;

	// Sky
	private final float daylight;
	private final int skyTop;
	private final int skyHorizon;
	private final int voidColor;
	private final double sunX;
	private final double sunY;
	private final float celestial;
	private final float starBrightness;
	private final float glowAmount;
	private final double glowSide;
	private final int cloudColor;
	private final float cloudAlpha;
	private final double cloudDrift;
	private final double cloudCoverage;
	private final int moonPhase;

	// Weather
	private final Theme.Weather weather;
	private final int rainColor;
	private final int snowColor;
	private final float[] weatherX;
	private final int[] rainColumn;
	private final int[] snowRow;
	private final float[] snowLocalY;
	private final float[] snowSway;
	private final int snowRowStride;

	// Laptop
	private final int lapX;
	private final int lapY;
	private final int lapZ;
	private final int lapFacing;

	// Highlight
	private final boolean hasHighlight;
	private final int hx;
	private final int hy;
	private final int hz;

	RayFrame(MiniWorld world, int[][] tex, LightField light, Camera camera, long gameTime, float partialTick, ScreenImage child,
			 MiniHit highlight, int width, int height) {
		Theme theme = world.theme;
		this.blocks = world.rawBlocks();
		this.tex = tex;
		this.light = light;
		this.child = child;
		this.width = width;
		this.gameTime = gameTime;
		this.partialTick = partialTick;
		this.time = gameTime + (double) partialTick;
		this.topY = light.top;

		// Camera rays
		this.ox = camera.x();
		this.oy = camera.y();
		this.oz = camera.z();
		double[] f = camera.forward();
		double[] r = camera.right();
		double[] u = camera.up();
		fx = f[0];
		fy = f[1];
		fz = f[2];
		rx = r[0];
		ry = r[1];
		rz = r[2];
		ux = u[0];
		uy = u[1];
		uz = u[2];
		double fov = Math.max(1.0, Math.min(170.0, camera.fov()));
		double tanHalf = Math.tan(Math.toRadians(fov) * 0.5);
		double aspect = (double) width / height;
		colX = new double[width];
		colDeg = new float[width];
		for (int px = 0; px < width; px++) {
			colX[px] = ((px + 0.5) / width * 2.0 - 1.0) * tanHalf * aspect;
			colDeg[px] = (float) Math.toDegrees(Math.atan(colX[px]));
		}
		rowY = new double[height];
		rowDeg = new float[height];
		for (int py = 0; py < height; py++) {
			rowY[py] = (1.0 - (py + 0.5) / height * 2.0) * tanHalf;
			rowDeg[py] = (float) -Math.toDegrees(Math.atan(rowY[py]));
		}
		yawDeg = camera.yaw();
		pitchDeg = camera.pitch();
		pixelAngle = 2.0 * tanHalf / height;
		degPerPixel = (float) (fov / height);

		// Time of day and light map
		float timeOfDay = theme.timeOfDay(gameTime, partialTick);
		indoor = theme.indoor;
		daylight = Theme.daylight(timeOfDay);
		float rain = switch (theme.weather) {
			case NONE -> 0.0F;
			case RAIN -> 1.0F;
			case SNOW -> 0.6F;
		};
		double ticks = timeOfDay * 24000.0;
		float skyFactor;
		float nightBlend;
		if (indoor) {
			skyFactor = 1.0F;
			nightBlend = 0.0F;
		} else {
			nightBlend = dayCurve(ticks);
			skyFactor = 1.0F + (0.24F - 1.0F) * nightBlend;
			skyFactor += (0.24F - skyFactor) * 0.3125F * rain;
			nightBlend += (1.0F - nightBlend) * 0.3125F * rain;
		}
		lut = lightMap(skyFactor, 1.0F - 0.52F * nightBlend, 1.0F - 0.52F * nightBlend, 1.0F);

		// Fog
		fogEnd = Math.max(4.0, theme.fogDistance);
		fogStart = fogEnd * 0.4;
		int fog = theme.fogColor;
		if (!indoor) {
			float night = 1.0F - daylight;
			fog = scale(fog, 1.0F - 0.86F * night, 1.0F - 0.85F * night, 1.0F - 0.78F * night);
		}
		fogColor = fog;
		waterFog = scale(theme.waterTint, 0.32F, 0.36F, 0.45F);

		int camX = (int) Math.floor(ox);
		int camY = (int) Math.floor(oy);
		int camZ = (int) Math.floor(oz);
		cameraId = world.id(camX, camY, camZ);
		cameraInWater = cameraId == WATER;

		// Sky
		int top = Raycaster.lerpColor(theme.skyNightTop, theme.skyDayTop, daylight);
		int horizon = Raycaster.lerpColor(theme.skyNightHorizon, theme.skyDayHorizon, daylight);
		if (rain > 0.0F) {
			top = desaturate(top, 0.45F * rain, 1.0F - 0.25F * rain);
			horizon = desaturate(horizon, 0.35F * rain, 1.0F - 0.15F * rain);
		}
		skyTop = top;
		skyHorizon = horizon;
		voidColor = scale(fogColor, 0.42F, 0.42F, 0.48F);
		double angle = timeOfDay * Math.PI * 2.0;
		sunX = Math.cos(angle);
		sunY = Math.sin(angle);
		celestial = 1.0F - rain * 0.85F;
		starBrightness = (float) (Math.max(0.0, Math.min(1.0, (1.0 - daylight) * 1.35)) * 0.85 * celestial);
		double sunHeight = Math.abs(sunY);
		glowAmount = (float) (Math.pow(Math.max(0.0, 1.0 - sunHeight / 0.42), 1.5) * celestial);
		glowSide = sunX >= 0.0 ? 1.0 : -1.0;
		int cloud = Raycaster.lerpColor(0xFF1C1E2A, 0xFFF4F6FA, daylight);
		if (rain > 0.0F) {
			cloud = Raycaster.lerpColor(cloud, scale(cloud, 0.62F, 0.64F, 0.68F), rain);
		}
		cloudColor = cloud;
		cloudAlpha = rain > 0.0F ? 0.9F : 0.8F;
		cloudCoverage = 0.62 - rain * 0.2;
		cloudDrift = time * 0.03;
		moonPhase = (int) Math.floorMod(theme.dayLengthTicks > 0 ? Math.floorDiv(gameTime, theme.dayLengthTicks) : 0L, 8L);

		weather = theme.weather;
		int weatherLight = indoor ? 0xFFFFFFFF : Raycaster.lerpColor(0xFF30364A, 0xFFFFFFFF, daylight);
		rainColor = scale(0xFFB4C4E0, weatherLight);
		snowColor = scale(0xFFFAFCFF, weatherLight);
		weatherX = new float[width];
		rainColumn = weather == Theme.Weather.RAIN ? new int[WEATHER_LAYERS * width] : null;
		boolean snow = weather == Theme.Weather.SNOW;
		snowRowStride = height;
		snowRow = snow ? new int[WEATHER_LAYERS * height] : null;
		snowLocalY = snow ? new float[WEATHER_LAYERS * height] : null;
		snowSway = snow ? new float[WEATHER_LAYERS * height] : null;
		if (weather != Theme.Weather.NONE) {
			prepareWeather(width, height);
		}

		lapX = world.laptopX;
		lapY = world.laptopY;
		lapZ = world.laptopZ;
		lapFacing = world.laptopFacing.horizontal() ? world.laptopFacing.ordinal() : SOUTH;

		hasHighlight = highlight != null;
		hx = highlight != null ? highlight.x() : 0;
		hy = highlight != null ? highlight.y() : 0;
		hz = highlight != null ? highlight.z() : 0;
	}

	/** 0 by day, 1 by night, with vanilla's dusk and dawn ramps (SKY_LIGHT_FACTOR keyframes). */
	private static float dayCurve(double ticks) {
		double t = ((ticks % 24000.0) + 24000.0) % 24000.0;
		if (t < 730.0) {
			t += 24000.0;
		}
		if (t <= 11270.0) {
			return 0.0F;
		}
		if (t <= 13140.0) {
			return (float) ((t - 11270.0) / (13140.0 - 11270.0));
		}
		if (t <= 22860.0) {
			return 1.0F;
		}
		return (float) (1.0 - (t - 22860.0) / (24730.0 - 22860.0));
	}

	/** Light maps by quantized sky factor and sky light colour; they change only around dusk and dawn. */
	private static final ConcurrentHashMap<Integer, float[]> LIGHT_MAPS = new ConcurrentHashMap<>();

	private static float[] lightMap(float skyFactor, float skyR, float skyG, float skyB) {
		int key = quantize(skyFactor) << 24 | quantize(skyR) << 16 | quantize(skyG) << 8 | quantize(skyB);
		float[] map = LIGHT_MAPS.get(key);
		if (map == null) {
			if (LIGHT_MAPS.size() > 512) {
				LIGHT_MAPS.clear();
			}
			map = buildLightMap(key);
			LIGHT_MAPS.put(key, map);
		}
		return map;
	}

	private static int quantize(float value) {
		return Math.max(0, Math.min(255, Math.round(value * 255.0F)));
	}

	/** Vanilla's light map (lightmap.fsh) at quarter light levels, with the default brightness setting. */
	private static float[] buildLightMap(int key) {
		float skyFactor = (key >>> 24) / 255.0F;
		float skyR = (key >> 16 & 0xFF) / 255.0F;
		float skyG = (key >> 8 & 0xFF) / 255.0F;
		float skyB = (key & 0xFF) / 255.0F;
		float[] lut = new float[LUT_SIZE * LUT_SIZE * 3];
		float blockFactor = 1.5F;
		float brightness = 0.5F;
		for (int s = 0; s < LUT_SIZE; s++) {
			float skyLevel = s / (LUT_SIZE - 1.0F);
			float sky = skyLevel / (4.0F - 3.0F * skyLevel) * skyFactor;
			for (int b = 0; b < LUT_SIZE; b++) {
				float blockLevel = b / (LUT_SIZE - 1.0F);
				float block = blockLevel / (4.0F - 3.0F * blockLevel) * blockFactor;
				float r = block;
				float g = block * ((block * 0.6F + 0.4F) * 0.6F + 0.4F);
				float bl = block * (block * block * 0.6F + 0.4F);
				r += skyR * sky;
				g += skyG * sky;
				bl += skyB * sky;
				r = clamp01(r + (0.75F - r) * 0.04F);
				g = clamp01(g + (0.75F - g) * 0.04F);
				bl = clamp01(bl + (0.75F - bl) * 0.04F);
				float max = Math.max(r, Math.max(g, bl));
				if (max > 0.0F) {
					float inverted = 1.0F - max;
					float scaled = (1.0F - inverted * inverted * inverted * inverted) / max;
					r += (r * scaled - r) * brightness;
					g += (g * scaled - g) * brightness;
					bl += (bl * scaled - bl) * brightness;
				}
				int i = (s * LUT_SIZE + b) * 3;
				lut[i] = clamp01(r + (0.75F - r) * 0.04F);
				lut[i + 1] = clamp01(g + (0.75F - g) * 0.04F);
				lut[i + 2] = clamp01(bl + (0.75F - bl) * 0.04F);
			}
		}
		return lut;
	}

	void renderRows(int[] out, int fromRow, int toRow) {
		Accumulator acc = new Accumulator();
		for (int py = fromRow; py < toRow; py++) {
			double rowOffset = rowY[py];
			double bx = fx + ux * rowOffset;
			double by = fy + uy * rowOffset;
			double bz = fz + uz * rowOffset;
			int row = py * width;
			for (int px = 0; px < width; px++) {
				double c = colX[px];
				double dx = bx + rx * c;
				double dy = by + ry * c;
				double dz = bz + rz * c;
				double inv = 1.0 / Math.sqrt(dx * dx + dy * dy + dz * dz);
				out[row + px] = trace(acc, dx * inv, dy * inv, dz * inv, px, py);
			}
		}
	}

	// ------------------------------------------------------------------------------------------------------------
	// Ray traversal

	/** Front-to-back colour accumulator of one ray. */
	private static final class Accumulator {
		float r;
		float g;
		float b;
		float transmittance = 1.0F;
		int layers;

		void reset() {
			r = 0.0F;
			g = 0.0F;
			b = 0.0F;
			transmittance = 1.0F;
			layers = 0;
		}

		void add(int rgb, float alpha) {
			float weight = transmittance * alpha;
			r += (rgb >> 16 & 0xFF) * weight;
			g += (rgb >> 8 & 0xFF) * weight;
			b += (rgb & 0xFF) * weight;
			transmittance *= 1.0F - alpha;
			layers++;
		}

		int finish(int background) {
			float t = transmittance;
			int red = (int) (r + (background >> 16 & 0xFF) * t + 0.5F);
			int green = (int) (g + (background >> 8 & 0xFF) * t + 0.5F);
			int blue = (int) (b + (background & 0xFF) * t + 0.5F);
			return 0xFF000000 | Math.min(255, red) << 16 | Math.min(255, green) << 8 | Math.min(255, blue);
		}
	}

	private int trace(Accumulator acc, double dx, double dy, double dz, int px, int py) {
		acc.reset();
		double hitDistance = NO_HIT;
		int background = -1;

		// Clip the ray to the occupied part of the level (cameras can be outside during transitions)
		double tNear = 0.0;
		double tFar = Double.MAX_VALUE;
		int enterAxis = -1;
		boolean miss = topY == 0;
		if (!miss) {
			if (dx != 0.0) {
				double t0 = -ox / dx;
				double t1 = (SX - ox) / dx;
				if (t0 > t1) {
					double s = t0;
					t0 = t1;
					t1 = s;
				}
				if (t0 > tNear) {
					tNear = t0;
					enterAxis = 0;
				}
				tFar = Math.min(tFar, t1);
			} else if (ox < 0.0 || ox >= SX) {
				miss = true;
			}
			if (dy != 0.0) {
				double t0 = -oy / dy;
				double t1 = (topY - oy) / dy;
				if (t0 > t1) {
					double s = t0;
					t0 = t1;
					t1 = s;
				}
				if (t0 > tNear) {
					tNear = t0;
					enterAxis = 1;
				}
				tFar = Math.min(tFar, t1);
			} else if (oy < 0.0 || oy >= topY) {
				miss = true;
			}
			if (dz != 0.0) {
				double t0 = -oz / dz;
				double t1 = (SZ - oz) / dz;
				if (t0 > t1) {
					double s = t0;
					t0 = t1;
					t1 = s;
				}
				if (t0 > tNear) {
					tNear = t0;
					enterAxis = 2;
				}
				tFar = Math.min(tFar, t1);
			} else if (oz < 0.0 || oz >= SZ) {
				miss = true;
			}
			if (tNear >= tFar) {
				miss = true;
			}
		}

		boolean inWater = cameraInWater;
		double waterStart = 0.0;
		if (!miss) {
			double sx = ox + dx * tNear;
			double sy = oy + dy * tNear;
			double sz = oz + dz * tNear;
			int cx = clamp((int) Math.floor(sx), 0, SX - 1);
			int cy = clamp((int) Math.floor(sy), 0, topY - 1);
			int cz = clamp((int) Math.floor(sz), 0, SZ - 1);
			int face = -1;
			if (enterAxis == 0) {
				cx = dx > 0.0 ? 0 : SX - 1;
				face = dx > 0.0 ? WEST : EAST;
			} else if (enterAxis == 1) {
				cy = dy > 0.0 ? 0 : topY - 1;
				face = dy > 0.0 ? DOWN : UP;
			} else if (enterAxis == 2) {
				cz = dz > 0.0 ? 0 : SZ - 1;
				face = dz > 0.0 ? NORTH : SOUTH;
			}
			int stepX = dx > 0.0 ? 1 : -1;
			int stepY = dy > 0.0 ? 1 : -1;
			int stepZ = dz > 0.0 ? 1 : -1;
			double deltaX = dx != 0.0 ? Math.abs(1.0 / dx) : Double.MAX_VALUE;
			double deltaY = dy != 0.0 ? Math.abs(1.0 / dy) : Double.MAX_VALUE;
			double deltaZ = dz != 0.0 ? Math.abs(1.0 / dz) : Double.MAX_VALUE;
			double maxX = dx > 0.0 ? (cx + 1 - ox) / dx : dx < 0.0 ? (cx - ox) / dx : Double.MAX_VALUE;
			double maxY = dy > 0.0 ? (cy + 1 - oy) / dy : dy < 0.0 ? (cy - oy) / dy : Double.MAX_VALUE;
			double maxZ = dz > 0.0 ? (cz + 1 - oz) / dz : dz < 0.0 ? (cz - oz) / dz : Double.MAX_VALUE;
			double t = tNear;
			int prevId = enterAxis < 0 ? cameraId : 0;
			boolean fogged = false;
			// Beyond the fog distance nothing is shaded any more; the ray only finds out whether something (fully
			// fogged) or the open sky lies behind
			boolean pastFog = t > fogEnd;

			int index = (cy * SZ + cz) * SX + cx;
			int strideY = stepY * SX * SZ;
			int strideZ = stepZ * SX;

			for (int guard = 0; guard < 512; guard++) {
				int id = blocks[index] & 0xFF;
				if (id != 0 || inWater) {
					if (pastFog) {
						fogged = true;
						break;
					}
					int kind = KIND[id];
					boolean water = id == WATER;
					if (water != inWater) {
						if (water) {
							if (face >= 0) {
								addSurface(acc, WATER, face, cx, cy, cz, dx, dy, dz, t);
							}
							waterStart = t;
							inWater = true;
						} else {
							absorbWater(acc, t - waterStart);
							inWater = false;
							if (face >= 0 && kind != K_OPAQUE) {
								// The water surface seen from below belongs to the cell we just left
								Face entered = FACES[face];
								addSurface(acc, WATER, entered.opposite().ordinal(), cx - entered.dx, cy - entered.dy, cz - entered.dz,
									dx, dy, dz, t);
							}
						}
					}
					if (kind != 0 && face >= 0 || kind == K_SPECIAL) {
						if (kind == K_OPAQUE) {
							int texel = texel(id, face, cx, cy, cz, dx, dy, dz, t);
							if (inWater) {
								absorbWater(acc, t - waterStart);
							}
							acc.add(fog(shade(id, face, cx, cy, cz, dx, dy, dz, t, texel), t), 1.0F);
							hitDistance = t;
							break;
						} else if (kind == K_CUTOUT) {
							if (!(id == GLASS && prevId == GLASS)) {
								int texel = texel(id, face, cx, cy, cz, dx, dy, dz, t);
								if ((texel >>> 24) >= 128) {
									if (inWater) {
										absorbWater(acc, t - waterStart);
									}
									acc.add(fog(shade(id, face, cx, cy, cz, dx, dy, dz, t, texel), t), 1.0F);
									hitDistance = t;
									break;
								}
							}
						} else if (kind == K_TRANSLUCENT) {
							if (prevId != id) {
								if (inWater) {
									absorbWater(acc, t - waterStart);
									waterStart = t;
								}
								addSurface(acc, id, face, cx, cy, cz, dx, dy, dz, t);
							}
						} else if (kind == K_SPECIAL && id == Raycaster.LAPTOP) {
							double exit = Math.min(maxX, Math.min(maxY, maxZ));
							long hit = laptop(cx, cy, cz, dx, dy, dz, t, exit);
							if (hit != Long.MIN_VALUE) {
								double tHit = Float.intBitsToFloat((int) (hit >>> 32));
								if (inWater) {
									absorbWater(acc, tHit - waterStart);
								}
								acc.add(fog((int) hit, tHit), 1.0F);
								hitDistance = tHit;
								break;
							}
						}
						if (acc.layers >= MAX_LAYERS || acc.transmittance < 0.02F) {
							hitDistance = t;
							break;
						}
					}
				}
				prevId = id;

				if (maxX < maxY) {
					if (maxX < maxZ) {
						t = maxX;
						maxX += deltaX;
						cx += stepX;
						index += stepX;
						face = stepX > 0 ? WEST : EAST;
						if (cx < 0 || cx >= SX) {
							break;
						}
					} else {
						t = maxZ;
						maxZ += deltaZ;
						cz += stepZ;
						index += strideZ;
						face = stepZ > 0 ? NORTH : SOUTH;
						if (cz < 0 || cz >= SZ) {
							break;
						}
					}
				} else if (maxY < maxZ) {
					t = maxY;
					maxY += deltaY;
					cy += stepY;
					index += strideY;
					face = stepY > 0 ? DOWN : UP;
					if (cy < 0 || cy >= topY) {
						break;
					}
				} else {
					t = maxZ;
					maxZ += deltaZ;
					cz += stepZ;
					index += strideZ;
					face = stepZ > 0 ? NORTH : SOUTH;
					if (cz < 0 || cz >= SZ) {
						break;
					}
				}
				if (t > fogEnd && !pastFog) {
					pastFog = true;
					if (inWater) {
						absorbWater(acc, fogEnd - waterStart);
						fogged = true;
						break;
					}
				}
			}
			if (hitDistance == NO_HIT) {
				if (inWater && !pastFog) {
					absorbWater(acc, Math.min(t, fogEnd) - waterStart);
				}
				if (fogged) {
					background = inWater ? waterFog : fogColor;
					hitDistance = fogEnd;
				}
			}
		} else if (inWater) {
			absorbWater(acc, fogEnd);
		}
		if (background == -1) {
			background = hitDistance == NO_HIT ? sky(dx, dy, dz) : 0;
		}
		int color = acc.finish(background);
		if (weather != Theme.Weather.NONE && !cameraInWater) {
			color = weather(color, dx, dy, dz, px, py, hitDistance);
		}
		if (cameraInWater) {
			color = Raycaster.lerpColor(color, waterFog, 0.18F);
		}
		return color;
	}

	/** Adds the light lost and scattered by a stretch of water the ray travelled through. */
	private void absorbWater(Accumulator acc, double distance) {
		if (distance <= 0.0) {
			return;
		}
		float alpha = (float) (1.0 - Math.exp(-distance * WATER_ABSORPTION));
		acc.add(waterFog, alpha);
	}

	/** A translucent face (water surface, ice) blended over what is behind it. */
	private void addSurface(Accumulator acc, int id, int face, int cx, int cy, int cz, double dx, double dy, double dz, double t) {
		int texel = texel(id, face, cx, cy, cz, dx, dy, dz, t);
		float alpha = (texel >>> 24) / 255.0F;
		if (alpha <= 0.0F) {
			return;
		}
		if (id == WATER) {
			// Gentle shimmer instead of the animated strip
			int cell = cx * 7 + cz * 13 + (int) ((ox + dx * t) * 16.0) + (int) ((oz + dz * t) * 16.0) * 3;
			float shimmer = 1.0F + 0.07F * (float) Math.sin(time * 0.12 + cell * 0.9);
			texel = scale(texel, shimmer, shimmer, shimmer);
			alpha = Math.max(alpha, 0.62F);
		}
		acc.add(fog(shade(id, face, cx, cy, cz, dx, dy, dz, t, texel), t), alpha);
	}

	// ------------------------------------------------------------------------------------------------------------
	// Block faces

	/** The texel of a block face where the ray at distance t meets it, with vanilla's UV orientation and variants. */
	private int texel(int id, int face, int cx, int cy, int cz, double dx, double dy, double dz, double t) {
		double lx = frac(ox + dx * t - cx);
		double ly = frac(oy + dy * t - cy);
		double lz = frac(oz + dz * t - cz);
		double u;
		double v;
		switch (face) {
			case 0 -> {
				u = lx;
				v = 1.0 - lz;
			}
			case 1 -> {
				u = lx;
				v = lz;
			}
			case 2 -> {
				u = 1.0 - lx;
				v = 1.0 - ly;
			}
			case 3 -> {
				u = lx;
				v = 1.0 - ly;
			}
			case 4 -> {
				u = lz;
				v = 1.0 - ly;
			}
			default -> {
				u = 1.0 - lz;
				v = 1.0 - ly;
			}
		}
		int variant = VARIANT[id];
		if (variant != 0) {
			int h = hash(cx, cy, cz);
			boolean end = face == UP || face == DOWN;
			if (variant == 1) {
				if (end) {
					switch (h & 3) {
						case 1 -> {
							double s = u;
							u = 1.0 - v;
							v = s;
						}
						case 2 -> {
							u = 1.0 - u;
							v = 1.0 - v;
						}
						case 3 -> {
							double s = u;
							u = v;
							v = 1.0 - s;
						}
						default -> {
						}
					}
				}
			} else {
				if ((h & 1) != 0) {
					u = 1.0 - u;
				}
				if ((h & 2) != 0 && end) {
					u = 1.0 - u;
					v = 1.0 - v;
				}
			}
		}
		int iu = clamp((int) (u * 16.0), 0, 15);
		int iv = clamp((int) (v * 16.0), 0, 15);
		return tex[id * 6 + face][iv * 16 + iu];
	}

	/** Lights a texel of a cube face: smooth light and ambient occlusion, face shading, and the highlight outline. */
	private int shade(int id, int face, int cx, int cy, int cz, double dx, double dy, double dz, double t, int texel) {
		double px = ox + dx * t;
		double py = oy + dy * t;
		double pz = oz + dz * t;
		double s;
		double tt;
		if (face == UP || face == DOWN) {
			s = frac(px - cx);
			tt = frac(pz - cz);
		} else if (face == NORTH || face == SOUTH) {
			s = frac(px - cx);
			tt = frac(py - cy);
		} else {
			s = frac(pz - cz);
			tt = frac(py - cy);
		}
		int rgb;
		if (EMISSIVE[id]) {
			float shadeValue = FACE_SHADE[face];
			rgb = scale(texel, shadeValue, shadeValue, shadeValue);
		} else {
			rgb = smoothLight(texel, face, cx, cy, cz, s, tt);
		}
		if (hasHighlight && cx == hx && cy == hy && cz == hz) {
			double edge = Math.min(Math.min(s, 1.0 - s), Math.min(tt, 1.0 - tt));
			if (edge < lineWidth(t)) {
				rgb = Raycaster.lerpColor(rgb, 0xFF000000, 0.62F);
			}
		}
		return rgb;
	}

	private double lineWidth(double distance) {
		return Math.max(0.006, pixelAngle * distance * 0.8);
	}

	/**
	 * Minecraft's smooth lighting: each corner of the face averages the light of the four cells in front of it and is
	 * darkened by occluding neighbours; the pixel interpolates between the corners.
	 */
	private int smoothLight(int texel, int face, int cx, int cy, int cz, double s, double t) {
		short[] grid = light.packed;
		int n = LightField.padded(cx, cy, cz) + NORMAL_OFFSET[face];
		int a = A_OFFSET[face];
		int b = B_OFFSET[face];
		int center = grid[n];
		int sMinus = grid[n - a];
		int sPlus = grid[n + a];
		int tMinus = grid[n - b];
		int tPlus = grid[n + b];
		int c00 = corner(center, sMinus, tMinus, grid[n - a - b]);
		int c10 = corner(center, sPlus, tMinus, grid[n + a - b]);
		int c01 = corner(center, sMinus, tPlus, grid[n - a + b]);
		int c11 = corner(center, sPlus, tPlus, grid[n + a + b]);

		double w00 = (1.0 - s) * (1.0 - t);
		double w10 = s * (1.0 - t);
		double w01 = (1.0 - s) * t;
		double w11 = s * t;
		double sky = indoor ? Raycaster.INDOOR_LIGHT * 4.0
			: (c00 & 63) * w00 + (c10 & 63) * w10 + (c01 & 63) * w01 + (c11 & 63) * w11;
		double block = (c00 >> 6 & 63) * w00 + (c10 >> 6 & 63) * w10 + (c01 >> 6 & 63) * w01 + (c11 >> 6 & 63) * w11;
		double ao = AO[c00 >> 12] * w00 + AO[c10 >> 12] * w10 + AO[c01 >> 12] * w01 + AO[c11 >> 12] * w11;
		int i = ((int) (sky + 0.5) * LUT_SIZE + (int) (block + 0.5)) * 3;
		float k = (float) ao * FACE_SHADE[face];
		return scale(texel, lut[i] * k, lut[i + 1] * k, lut[i + 2] * k);
	}

	/** Neighbour offsets in {@link LightField#packed}: the cell in front of each face, and the face's two tangents. */
	private static final int[] NORMAL_OFFSET = {-LightField.PLANE, LightField.PLANE, -LightField.PX, LightField.PX, -1, 1};
	private static final int[] A_OFFSET = {1, 1, 1, 1, LightField.PX, LightField.PX};
	private static final int[] B_OFFSET = {LightField.PX, LightField.PX, LightField.PLANE, LightField.PLANE, LightField.PLANE,
		LightField.PLANE};
	/** Ambient occlusion of a corner by the number of occluding neighbours (vanilla: each counts 0.2 instead of 1). */
	private static final double[] AO = {1.0, 0.8, 0.6, 0.4};

	/**
	 * One corner of a face from the packed cells around it ({@link LightField#packed}): the summed light of the four
	 * cells (light-blocking neighbours take the centre's light, as vanilla does; two occluding sides hide the
	 * diagonal) in quarter levels, and the number of occluders. Packed as sky (bits 0-5), block (6-11), count (12-13).
	 */
	private static int corner(int center, int sideA, int sideB, int diagonal) {
		boolean occA = (sideA & 0x100) != 0;
		boolean occB = (sideB & 0x100) != 0;
		boolean occC = occA && occB || (diagonal & 0x100) != 0;
		boolean solidC = occA && occB || (diagonal & 0x200) != 0;
		int centerSky = center >> 4 & 0xF;
		int centerBlock = center & 0xF;
		int sky = centerSky
			+ ((sideA & 0x200) != 0 ? centerSky : sideA >> 4 & 0xF)
			+ ((sideB & 0x200) != 0 ? centerSky : sideB >> 4 & 0xF)
			+ (solidC ? centerSky : diagonal >> 4 & 0xF);
		int block = centerBlock
			+ ((sideA & 0x200) != 0 ? centerBlock : sideA & 0xF)
			+ ((sideB & 0x200) != 0 ? centerBlock : sideB & 0xF)
			+ (solidC ? centerBlock : diagonal & 0xF);
		int count = (occA ? 1 : 0) + (occB ? 1 : 0) + (occC ? 1 : 0);
		return sky | block << 6 | count << 12;
	}

	private int fog(int rgb, double distance) {
		if (distance <= fogStart) {
			return rgb;
		}
		float amount = (float) Math.min(1.0, (distance - fogStart) / (fogEnd - fogStart));
		return Raycaster.lerpColor(rgb, fogColor, amount);
	}

	// ------------------------------------------------------------------------------------------------------------
	// The laptop

	/**
	 * Intersects the laptop's deck and lid inside its cell between distances tMin and tMax. Returns the hit distance
	 * (float bits, high word) and lit colour (low word), or Long.MIN_VALUE if the ray passes by.
	 */
	private long laptop(int cx, int cy, int cz, double dx, double dy, double dz, double tMin, double tMax) {
		double lx = ox - cx;
		double ly = oy - cy;
		double lz = oz - cz;
		// Into the SOUTH-facing reference frame of LaptopGeometry
		boolean ownLaptop = cx == lapX && cy == lapY && cz == lapZ;
		int facing = ownLaptop ? lapFacing : SOUTH;
		double rox;
		double roz;
		double rdx;
		double rdz;
		if (facing == NORTH) {
			rox = 1.0 - lx;
			roz = 1.0 - lz;
			rdx = -dx;
			rdz = -dz;
		} else if (facing == EAST) {
			rox = 1.0 - lz;
			roz = lx;
			rdx = -dz;
			rdz = dx;
		} else if (facing == WEST) {
			rox = lz;
			roz = 1.0 - lx;
			rdx = dz;
			rdz = -dx;
		} else {
			rox = lx;
			roz = lz;
			rdx = dx;
			rdz = dz;
		}
		double best = Double.MAX_VALUE;
		int bestBox = -1;
		int bestFace = -1;
		for (int box = 0; box < 2; box++) {
			double[] b = box == 0 ? LaptopGeometry.BASE : LaptopGeometry.LID;
			double near = -Double.MAX_VALUE;
			double far = Double.MAX_VALUE;
			int nearFace = -1;
			boolean missed = false;
			for (int axis = 0; axis < 3 && !missed; axis++) {
				double o = axis == 0 ? rox : axis == 1 ? ly : roz;
				double d = axis == 0 ? rdx : axis == 1 ? dy : rdz;
				double min = b[axis];
				double max = b[axis + 3];
				if (Math.abs(d) < 1e-12) {
					if (o < min || o > max) {
						missed = true;
					}
					continue;
				}
				double t0 = (min - o) / d;
				double t1 = (max - o) / d;
				int face0;
				if (t0 > t1) {
					double s = t0;
					t0 = t1;
					t1 = s;
					face0 = axis == 0 ? EAST : axis == 1 ? UP : SOUTH;
				} else {
					face0 = axis == 0 ? WEST : axis == 1 ? DOWN : NORTH;
				}
				if (t0 > near) {
					near = t0;
					nearFace = face0;
				}
				far = Math.min(far, t1);
			}
			if (missed || near > far || nearFace < 0 || near < tMin - 1e-9 || near > tMax + 1e-9) {
				continue;
			}
			if (near < best) {
				best = near;
				bestBox = box;
				bestFace = nearFace;
			}
		}
		if (bestBox < 0) {
			return Long.MIN_VALUE;
		}
		double qx = rox + rdx * best;
		double qy = ly + dy * best;
		double qz = roz + rdz * best;
		int rgb;
		if (bestBox == 1 && bestFace == SOUTH && qx >= LaptopGeometry.SCREEN_MIN_X && qx <= LaptopGeometry.SCREEN_MAX_X
			&& qy >= LaptopGeometry.SCREEN_MIN_Y && qy <= LaptopGeometry.SCREEN_MAX_Y) {
			double u = (qx - LaptopGeometry.SCREEN_MIN_X) / (LaptopGeometry.SCREEN_MAX_X - LaptopGeometry.SCREEN_MIN_X);
			double v = (LaptopGeometry.SCREEN_MAX_Y - qy) / (LaptopGeometry.SCREEN_MAX_Y - LaptopGeometry.SCREEN_MIN_Y);
			rgb = ownLaptop && child != null ? child.sample(u, v) : Raycaster.staticPixel(u, v, gameTime, partialTick);
		} else {
			int worldFace = bestFace;
			int h = HORIZONTAL_INDEX[bestFace];
			if (h >= 0) {
				worldFace = Face.HORIZONTAL[(h + HORIZONTAL_INDEX[facing]) % 4].ordinal();
			}
			int texel = laptopTexel(bestBox, bestFace, qx, qy, qz);
			if (texel == LOGO_GRASS || texel == LOGO_DIRT) {
				rgb = texel;
			} else {
				int index = (cy * SZ + cz) * SX + cx;
				double sky = indoor ? Raycaster.INDOOR_LIGHT : light.sky[index];
				int i = ((int) (sky * 4.0) * LUT_SIZE + light.block[index] * 4) * 3;
				float k = FACE_SHADE[worldFace];
				rgb = scale(texel, lut[i] * k, lut[i + 1] * k, lut[i + 2] * k);
			}
			if (hasHighlight && cx == hx && cy == hy && cz == hz) {
				double[] b = bestBox == 0 ? LaptopGeometry.BASE : LaptopGeometry.LID;
				double edge = boxFaceEdgeDistance(b, bestFace, qx, qy, qz);
				if (edge < lineWidth(best)) {
					rgb = Raycaster.lerpColor(rgb, 0xFF000000, 0.62F);
				}
			}
		}
		return (long) Float.floatToIntBits((float) best) << 32 | rgb & 0xFFFFFFFFL;
	}

	/** Distance from a point on a box face to the nearest edge of that face. */
	private static double boxFaceEdgeDistance(double[] b, int face, double x, double y, double z) {
		double e1;
		double e2;
		if (face == UP || face == DOWN) {
			e1 = Math.min(x - b[0], b[3] - x);
			e2 = Math.min(z - b[2], b[5] - z);
		} else if (face == NORTH || face == SOUTH) {
			e1 = Math.min(x - b[0], b[3] - x);
			e2 = Math.min(y - b[1], b[4] - y);
		} else {
			e1 = Math.min(z - b[2], b[5] - z);
			e2 = Math.min(y - b[1], b[4] - y);
		}
		return Math.min(e1, e2);
	}

	/** The laptop's pixel art in its reference (SOUTH-facing) frame. */
	private static int laptopTexel(int box, int face, double x, double y, double z) {
		int sx = clamp((int) (x * 32.0), 0, 31);
		int sy = clamp((int) (y * 32.0), 0, 31);
		int sz = clamp((int) (z * 32.0), 0, 31);
		if (box == 0) {
			if (face != UP) {
				return LAPTOP_EDGE;
			}
			// Keyboard: rows of keys with a space bar, then a trackpad
			if (sx >= 4 && sx < 28 && sz >= 10 && sz < 21) {
				int row = (sz - 10) / 3;
				boolean gapZ = (sz - 10) % 3 == 2;
				boolean gapX = (sx - 4) % 3 == 2;
				if (row == 3) {
					// Space bar row: one long key in the middle
					boolean spaceBar = sx >= 10 && sx < 22;
					return gapZ || (!spaceBar && gapX) || sx == 9 || sx == 22 ? LAPTOP_KEY_GAP : LAPTOP_KEY;
				}
				return gapZ || gapX ? LAPTOP_KEY_GAP : LAPTOP_KEY;
			}
			if (sx >= 12 && sx < 20 && sz >= 22 && sz < 28) {
				return sx == 12 || sx == 19 || sz == 22 || sz == 27 ? LAPTOP_KEY_GAP : LAPTOP_PAD;
			}
			return LAPTOP_DECK;
		}
		if (face == SOUTH) {
			if (sy == 19 && (sx == 15 || sx == 16)) {
				return LAPTOP_CAMERA;
			}
			return LAPTOP_BEZEL;
		}
		if (face == NORTH) {
			// A little grass block logo on the back of the lid
			int tx = (int) (x * 16.0);
			int ty = (int) (y * 16.0);
			if (tx >= 7 && tx <= 8 && ty >= 5 && ty <= 6) {
				return ty == 6 ? LOGO_GRASS : LOGO_DIRT;
			}
			return LAPTOP_BODY;
		}
		return face == UP ? LAPTOP_BODY : LAPTOP_EDGE;
	}

	// ------------------------------------------------------------------------------------------------------------
	// Sky

	/** The sky in a direction: gradient, sunrise glow, stars, sun and moon, clouds. */
	private int sky(double dx, double dy, double dz) {
		int color;
		if (dy >= 0.0) {
			double k = Math.sqrt(Math.min(1.0, dy / 0.9));
			color = Raycaster.lerpColor(skyHorizon, skyTop, (float) k);
			if (dy < 0.14) {
				color = Raycaster.lerpColor(fogColor, color, (float) smooth(dy / 0.14));
			}
		} else {
			// Below the horizon the void around the level fades from the fog colour into darkness
			color = Raycaster.lerpColor(fogColor, voidColor, (float) smooth((-dy - 0.08) * 1.6));
		}
		// Sunrise and sunset glow over the horizon on the sun's side
		if (glowAmount > 0.01F) {
			double horizontal = Math.sqrt(dx * dx + dz * dz);
			if (horizontal > 1e-6) {
				double side = Math.max(0.0, dx * glowSide / horizontal);
				double height = dy >= 0.0 ? Math.exp(-dy * 4.5) : Math.exp(dy * 9.0);
				float alpha = (float) (glowAmount * side * side * height * 0.72);
				if (alpha > 0.003F) {
					int glow = Raycaster.lerpColor(0xFFFF9A4A, 0xFFFFD27A, (float) Math.min(1.0, Math.max(0.0, dy * 3.0)));
					color = Raycaster.lerpColor(color, glow, Math.min(1.0F, alpha));
				}
			}
		}
		// Celestial coordinates: S toward the sun, T along its path, Z along the north-south rotation axis
		double ds = dx * sunX + dy * sunY;
		double dt = -dx * sunY + dy * sunX;
		if (starBrightness > 0.01F && dy > -0.05) {
			color = stars(color, ds, dt, dz);
		}
		if (celestial > 0.01F) {
			color = sunAndMoon(color, ds, dt, dz);
		}
		if (dy > 0.012) {
			color = clouds(color, dx, dy, dz);
		}
		return color;
	}

	private int stars(int color, double ds, double dt, double dz) {
		double ax = Math.abs(ds);
		double ay = Math.abs(dt);
		double az = Math.abs(dz);
		int faceId;
		double a;
		double b;
		if (ax >= ay && ax >= az) {
			faceId = ds > 0 ? 0 : 1;
			a = dt / ax;
			b = dz / ax;
		} else if (ay >= az) {
			faceId = dt > 0 ? 2 : 3;
			a = ds / ay;
			b = dz / ay;
		} else {
			faceId = dz > 0 ? 4 : 5;
			a = ds / az;
			b = dt / az;
		}
		double grid = 40.0;
		double ga = (a + 1.0) * grid;
		double gb = (b + 1.0) * grid;
		int ia = (int) ga;
		int ib = (int) gb;
		int h = hash(ia, ib, faceId * 7919 + 17);
		if ((h & 0x3FF) >= 70) {
			return color;
		}
		double centerA = 0.25 + ((h >>> 10) & 0xFF) / 255.0 * 0.5;
		double centerB = 0.25 + ((h >>> 18) & 0xFF) / 255.0 * 0.5;
		double size = 0.08 + ((h >>> 26) & 0x7) * 0.018;
		if (Math.abs(ga - ia - centerA) > size || Math.abs(gb - ib - centerB) > size) {
			return color;
		}
		float twinkle = 0.75F + 0.25F * (float) Math.sin(time * 0.21 + (h & 0xFF));
		return add(color, 0xFFFFFF, starBrightness * twinkle);
	}

	private int sunAndMoon(int color, double ds, double dt, double dz) {
		if (ds > 0.0) {
			double a = dt / ds;
			double b = dz / ds;
			double r = Math.max(Math.abs(a), Math.abs(b));
			if (r < 0.32) {
				double glow = 1.0 - r / 0.32;
				color = add(color, 0xFFE09A, (float) (glow * glow * 0.32 * celestial));
				if (r < 0.075) {
					int core = r > 0.0565 ? 0xFFFFD54A : 0xFFFFFFD9;
					color = Raycaster.lerpColor(color, core, celestial);
				}
			}
		} else {
			double dm = -ds;
			double a = -dt / dm;
			double b = dz / dm;
			double r = Math.max(Math.abs(a), Math.abs(b));
			if (r < 0.22) {
				double glow = 1.0 - r / 0.22;
				color = add(color, 0x9FB0D8, (float) (glow * glow * 0.18 * celestial));
				if (r < 0.05) {
					int tx = clamp((int) ((a / 0.05 + 1.0) * 4.0), 0, 7);
					int ty = clamp((int) ((b / 0.05 + 1.0) * 4.0), 0, 7);
					int moon = moonTexel(tx, ty);
					if (moon != 0) {
						color = Raycaster.lerpColor(color, moon, celestial);
					}
				}
			}
		}
		return color;
	}

	/** An 8x8 moon with craters and the current phase's shadow; 0 where the moon is dark (sky shows through). */
	private int moonTexel(int x, int y) {
		// Phase 0 = full moon; the shadow sweeps across over the cycle
		int lit = switch (moonPhase) {
			case 1 -> x >= 1 ? 1 : 0;
			case 2 -> x >= 4 ? 1 : 0;
			case 3 -> x >= 6 ? 1 : 0;
			case 4 -> -1;
			case 5 -> x <= 1 ? 1 : 0;
			case 6 -> x <= 3 ? 1 : 0;
			case 7 -> x <= 6 ? 1 : 0;
			default -> 1;
		};
		if (lit <= 0) {
			return lit < 0 && (x == 0 || x == 7 || y == 0 || y == 7) ? 0xFF2A3040 : 0;
		}
		int h = hash(x, y, 4242) & 0xFF;
		boolean crater = (x == 2 && y == 2) || (x == 5 && y == 4) || (x == 3 && y == 5) || (x == 6 && y == 1) || h < 30;
		return crater ? 0xFF9097A5 : (h < 140 ? 0xFFD9E4FF : 0xFFC4CEE6);
	}

	/** Blocky drifting clouds on a plane high above the level, fading out with distance. */
	private int clouds(int color, double dx, double dy, double dz) {
		double distance = (CLOUD_Y_D - oy) / dy;
		if (distance <= 0.0 || distance > 240.0) {
			return color;
		}
		double x = ox + dx * distance + cloudDrift;
		double z = oz + dz * distance;
		int cx = (int) Math.floor(x / 4.0);
		int cz = (int) Math.floor(z / 4.0);
		double density = (hash(cx >> 2, cz >> 2, 91) & 0xFF) / 255.0 * 0.55
			+ (hash(cx >> 1, cz >> 1, 92) & 0xFF) / 255.0 * 0.3
			+ (hash(cx, cz, 93) & 0xFF) / 255.0 * 0.15;
		if (density < cloudCoverage) {
			return color;
		}
		float fade = (float) (1.0 - smooth((distance - 70.0) / 170.0));
		return Raycaster.lerpColor(color, cloudColor, cloudAlpha * fade);
	}

	private static final double CLOUD_Y_D = Raycaster.CLOUD_Y;

	// ------------------------------------------------------------------------------------------------------------
	// Weather

	private static final int WEATHER_LAYERS = 3;

	/** Per-column and per-row parts of the rain and snow patterns, so the per-pixel test stays cheap. */
	private void prepareWeather(int width, int height) {
		for (int px = 0; px < width; px++) {
			float ax = yawDeg + colDeg[px];
			ax -= (float) Math.floor(ax / 360.0F) * 360.0F;
			weatherX[px] = ax;
			if (weather != Theme.Weather.RAIN) {
				continue;
			}
			for (int layer = 0; layer < WEATHER_LAYERS; layer++) {
				int columns = 150 + layer * 110;
				float columnWidth = 360.0F / columns;
				int column = (int) (ax / columnWidth);
				int h = hash(column, layer, 7171);
				float local = ax / columnWidth - column;
				float center = 0.2F + (h >>> 4 & 0xFF) / 255.0F * 0.6F;
				float halfWidth = Math.max(0.5F, 1.25F - layer * 0.35F) * degPerPixel / columnWidth;
				boolean drop = (h & 3) != 3 && Math.abs(local - center) <= halfWidth;
				rainColumn[layer * width + px] = drop ? h | 1 << 31 : 0;
			}
		}
		if (weather != Theme.Weather.SNOW) {
			return;
		}
		for (int py = 0; py < height; py++) {
			float ay = pitchDeg + rowDeg[py];
			for (int layer = 0; layer < WEATHER_LAYERS; layer++) {
				float cell = 3.4F - layer * 0.9F;
				float speed = 0.55F - layer * 0.12F;
				double fall = ay - time * speed;
				int row = (int) Math.floor(fall / cell);
				int i = layer * height + py;
				snowRow[i] = row;
				snowLocalY[i] = (float) (fall / cell - row);
				snowSway[i] = (float) (Math.sin(time * 0.045 + row * 1.7 + layer) * cell * 0.3);
			}
		}
	}

	/** Rain streaks or snow flakes in front of the scene, only where the air is open to the sky. */
	private int weather(int color, double dx, double dy, double dz, int px, int py, double hitDistance) {
		if (weather == Theme.Weather.RAIN) {
			float ay = pitchDeg + rowDeg[py];
			for (int layer = 0; layer < WEATHER_LAYERS; layer++) {
				int h = rainColumn[layer * width + px];
				if (h == 0) {
					continue;
				}
				double depth = 1.8 + layer * 2.6;
				if (depth >= hitDistance) {
					continue;
				}
				float speed = 9.0F - layer * 2.2F;
				float length = 10.0F - layer * 2.5F;
				float phase = (h >>> 12 & 0xFFF) / 4096.0F;
				double position = (phase * 220.0 + time * speed) % 220.0 - 110.0;
				double along = position - ay;
				if (along < 0.0 || along > length) {
					continue;
				}
				if (!light.openSky(ox + dx * depth, oy + dy * depth, oz + dz * depth)) {
					continue;
				}
				float alpha = (0.42F - layer * 0.1F) * (float) (1.0 - along / length * 0.6);
				color = Raycaster.lerpColor(color, rainColor, alpha);
			}
		} else if (weather == Theme.Weather.SNOW) {
			float ax = weatherX[px];
			for (int layer = 0; layer < WEATHER_LAYERS; layer++) {
				double depth = 1.5 + layer * 2.5;
				if (depth >= hitDistance) {
					continue;
				}
				int i = layer * snowRowStride + py;
				float cell = 3.4F - layer * 0.9F;
				float across = ax + snowSway[i];
				int column = (int) Math.floor(across / cell);
				int h = hash(column, snowRow[i], 3131 + layer);
				if ((h & 3) != 0) {
					continue;
				}
				float localX = across / cell - column;
				float centerX = 0.2F + (h >>> 4 & 0xFF) / 255.0F * 0.6F;
				float centerY = 0.2F + (h >>> 12 & 0xFF) / 255.0F * 0.6F;
				float half = Math.max(0.5F, 1.4F - layer * 0.4F) * degPerPixel / cell;
				if (Math.abs(localX - centerX) > half || Math.abs(snowLocalY[i] - centerY) > half) {
					continue;
				}
				if (!light.openSky(ox + dx * depth, oy + dy * depth, oz + dz * depth)) {
					continue;
				}
				color = Raycaster.lerpColor(color, snowColor, 0.85F - layer * 0.15F);
			}
		}
		return color;
	}

	// ------------------------------------------------------------------------------------------------------------
	// Helpers

	/** Position within a cell of a coordinate already relative to that cell (only rounding can push it outside). */
	private static double frac(double value) {
		return value < 0.0 ? 0.0 : value >= 1.0 ? 0.999999 : value;
	}

	private static double smooth(double x) {
		double t = Math.max(0.0, Math.min(1.0, x));
		return t * t * (3.0 - 2.0 * t);
	}

	private static int clamp(int value, int min, int max) {
		return value < min ? min : Math.min(value, max);
	}

	private static float clamp01(float value) {
		return value < 0.0F ? 0.0F : Math.min(value, 1.0F);
	}

	/** Multiplies a colour's RGB channels (keeping its alpha). */
	static int scale(int argb, float r, float g, float b) {
		int red = Math.min(255, (int) ((argb >> 16 & 0xFF) * r + 0.5F));
		int green = Math.min(255, (int) ((argb >> 8 & 0xFF) * g + 0.5F));
		int blue = Math.min(255, (int) ((argb & 0xFF) * b + 0.5F));
		return argb & 0xFF000000 | red << 16 | green << 8 | blue;
	}

	/** Multiplies two colours channel by channel. */
	private static int scale(int argb, int tint) {
		return scale(argb, (tint >> 16 & 0xFF) / 255.0F, (tint >> 8 & 0xFF) / 255.0F, (tint & 0xFF) / 255.0F);
	}

	/** Adds a colour scaled by an amount (light glows). */
	private static int add(int argb, int rgb, float amount) {
		int r = Math.min(255, (argb >> 16 & 0xFF) + (int) ((rgb >> 16 & 0xFF) * amount));
		int g = Math.min(255, (argb >> 8 & 0xFF) + (int) ((rgb >> 8 & 0xFF) * amount));
		int b = Math.min(255, (argb & 0xFF) + (int) ((rgb & 0xFF) * amount));
		return argb & 0xFF000000 | r << 16 | g << 8 | b;
	}

	/** Mixes a colour toward its grey and darkens it (overcast skies). */
	private static int desaturate(int argb, float amount, float brightness) {
		int r = argb >> 16 & 0xFF;
		int g = argb >> 8 & 0xFF;
		int b = argb & 0xFF;
		float grey = r * 0.3F + g * 0.59F + b * 0.11F;
		r = (int) ((r + (grey - r) * amount) * brightness);
		g = (int) ((g + (grey - g) * amount) * brightness);
		b = (int) ((b + (grey - b) * amount) * brightness);
		return argb & 0xFF000000 | clamp(r, 0, 255) << 16 | clamp(g, 0, 255) << 8 | clamp(b, 0, 255);
	}
}
