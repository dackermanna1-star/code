#version 330

// GPU twin of com.realweather.weather.CloudNoise: identical hashing and octaves, so clouds, cloud shadows,
// rain bands on the server and in-cloud fog all line up.

uint rw_hash(uint x, uint y, uint seed) {
    uint h = seed + x * 374761393u + y * 668265263u;
    h = (h ^ (h >> 13u)) * 1274126177u;
    return h ^ (h >> 16u);
}

float rw_lattice(ivec2 cell, uint mask, uint seed) {
    uvec2 u = uvec2(cell) & uvec2(mask);
    return float(rw_hash(u.x, u.y, seed) & 0xFFFFFFu) / 16777216.0;
}

float rw_value_noise(vec2 p, int cellShift, uint seed) {
    float cellSize = float(1 << cellShift);
    uint mask = uint((131072 >> cellShift) - 1);
    vec2 g = p / cellSize;
    vec2 fl = floor(g);
    ivec2 i = ivec2(fl);
    vec2 f = g - fl;
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = rw_lattice(i, mask, seed);
    float b = rw_lattice(i + ivec2(1, 0), mask, seed);
    float c = rw_lattice(i + ivec2(0, 1), mask, seed);
    float d = rw_lattice(i + ivec2(1, 1), mask, seed);
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float rw_cloud_base(vec2 p) {
    return 0.50 * rw_value_noise(p, 9, 24301u)
         + 0.32 * rw_value_noise(p + vec2(217.0, -131.0), 8, 25314u)
         + 0.18 * rw_value_noise(p + vec2(-71.0, 293.0), 7, 26327u);
}

float rw_coverage(float base, float cover) {
    if (cover <= 0.001) {
        return 0.0;
    }
    float threshold = 0.80 - 0.68 * cover;
    float softness = 0.10 + 0.25 * cover;
    return clamp((base - threshold) / softness, 0.0, 1.0);
}
