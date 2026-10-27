#version 330

// Vanilla terrain shader extended by RealWeather:
//  * wind-driven sway of cross-shaped plants (grass, flowers, ferns, saplings) using the top vertices only,
//  * soft moving cloud shadows on sky-lit surfaces,
//  * data for the wet-surface look in terrain.fsh.
// Everything is controlled through the extended Globals block and fades out to the exact vanilla result.

#moj_import <minecraft:fog.glsl>
#moj_import <realweather:rw_globals.glsl>
#moj_import <minecraft:chunksection.glsl>
#moj_import <minecraft:projection.glsl>
#moj_import <realweather:rw_cloud_noise.glsl>

in vec3 Position;
in vec4 Color;
in vec2 UV0;
in ivec2 UV2;
in vec3 Normal;

uniform sampler2D Sampler2;

out float sphericalVertexDistance;
out float cylindricalVertexDistance;
out vec4 vertexColor;
out vec2 texCoord0;
out vec2 rwSurface;

const float RW_TAU = 6.2831853;

vec4 minecraft_sample_lightmap(sampler2D lightMap, vec2 uv) {
    return texture(lightMap, clamp((uv / 256.0) + 0.5 / 16.0, vec2(0.5 / 16.0), vec2(15.5 / 16.0)));
}

float rw_cloud_shadow(vec3 pos, float skyLight) {
    if ((RW_CloudOrigin.w & RW_FLAG_SHADOWS) == 0 || RW_Cloud.w <= 0.0 || RW_Sun.y < 0.08 || skyLight < 0.5) {
        return 0.0;
    }
    float midHeight = RW_Cloud.y + RW_Cloud.z * 0.35;
    float t = (midHeight - pos.y) / RW_Sun.y;
    vec2 p = rw_noise_position(pos) + RW_Sun.xz * t;
    float coverage = rw_coverage(rw_cloud_base(p), RW_Cloud.x);
    return smoothstep(0.05, 0.75, coverage) * RW_Cloud.w * smoothstep(0.5, 1.0, skyLight);
}

void main() {
    vec3 pos = Position + (ChunkPosition - CameraBlockPos) + CameraOffset;
    float skyLight = float(UV2.y) / 240.0;

#ifdef ALPHA_CUTOUT
    if (ALPHA_CUTOUT > 0.05 && (RW_CloudOrigin.w & RW_FLAG_SWAY) != 0 && RW_Wind.w > 0.0) {
        // Cross models have horizontal, diagonal normals; vertices 0 and 3 of each side face are its top corners.
        int corner = gl_VertexID & 3;
        if ((corner == 0 || corner == 3) && abs(Normal.y) < 0.3 && abs(Normal.x) > 0.45 && abs(Normal.z) > 0.45) {
            vec3 world = vec3(uvec3(ChunkPosition) & uvec3(1023u)) + Position;
            vec2 windDir = RW_Wind.xy;
            float speed = RW_Wind.z;
            float strength = RW_Wind.w * smoothstep(0.45, 0.85, skyLight);
            // Gust fronts roll across the field along the wind direction (frequencies tile every 1024 blocks).
            float along = dot(world.xz, windDir);
            float wave = sin(along * (RW_TAU * 48.0 / 1024.0) - RW_Surface.y) * 0.5 + 0.5;
            float flutter = sin(world.x * (RW_TAU * 211.0 / 1024.0) + world.z * (RW_TAU * 157.0 / 1024.0) + RW_Surface.z);
            float lean = min(0.42, (0.025 + 0.0125 * speed) * (0.45 + 0.75 * wave)) * strength;
            float jitter = (0.015 + 0.004 * speed) * flutter * strength;
            vec2 side = vec2(-windDir.y, windDir.x);
            pos.xz += windDir * lean + side * jitter;
            pos.y -= lean * lean * 0.6;
        }
    }
#endif

    float shadow = rw_cloud_shadow(pos, skyLight);
    vec2 light = vec2(UV2);
    light.y *= 1.0 - shadow * 0.32;

    gl_Position = ProjMat * ModelViewMat * vec4(pos, 1.0);

    sphericalVertexDistance = fog_spherical_distance(pos);
    cylindricalVertexDistance = fog_cylindrical_distance(pos);
    vertexColor = Color * minecraft_sample_lightmap(Sampler2, light);
    texCoord0 = UV0;

    float wet = 0.0;
    float sheen = 0.0;
#ifdef ALPHA_CUTOUT
    bool translucent = ALPHA_CUTOUT < 0.05;
#else
    bool translucent = false;
#endif
    if (!translucent && (RW_CloudOrigin.w & RW_FLAG_WET) != 0 && RW_Surface.x > 0.0) {
        float exposed = smoothstep(0.78, 0.97, skyLight);
        float facing = Normal.y > 0.5 ? 1.0 : (Normal.y < -0.5 ? 0.0 : 0.55);
        wet = RW_Surface.x * exposed * facing;
        if (Normal.y > 0.5) {
            vec3 view = normalize(-pos);
            float grazing = 1.0 - clamp(view.y, 0.0, 1.0);
            sheen = wet * pow(grazing, 5.0) * 0.32;
        }
    }
    rwSurface = vec2(wet, sheen);
}
