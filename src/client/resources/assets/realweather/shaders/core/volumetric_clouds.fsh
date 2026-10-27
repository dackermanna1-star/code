#version 330

// RealWeather volumetric clouds: front-to-back ray marching through a height-limited layer whose coverage
// comes from the shared weather-map noise (identical to the server's rain bands and the terrain cloud shadows).

#moj_import <minecraft:fog.glsl>
#moj_import <realweather:rw_globals.glsl>
#moj_import <realweather:rw_cloud_noise.glsl>
#moj_import <realweather:rw_clouds_ubo.glsl>

in vec3 rayEnd;

out vec4 fragColor;

const float SIGMA = 0.05;
const float LIGHT_SIGMA = 0.038;

float henyeyGreenstein(float cosTheta, float g) {
    float g2 = g * g;
    return (1.0 - g2) / (12.566371 * pow(1.0 + g2 - 2.0 * g * cosTheta, 1.5));
}

// Density at q. Also reports the height fraction within the layer and, for lighting, the local column: the
// height fraction of its top and its typical density (used to estimate the cloud above a sample without marching).
float cloudDensity(vec3 q, out float heightFraction, out float columnTop, out float columnDensity) {
    float h = (q.y - Slab.x) / (Slab.y - Slab.x);
    heightFraction = h;
    columnTop = 0.0;
    columnDensity = 0.0;
    if (h <= 0.0 || h >= 1.0) {
        return 0.0;
    }
    vec2 p = rw_noise_position(q);
    float coverage = rw_coverage(rw_cloud_field(p, Shape.x), Shape.x);
    if (coverage <= 0.0) {
        return 0.0;
    }
    // Overcast skies flatten into a continuous stratus deck.
    float stratus = smoothstep(0.82, 1.0, Shape.x);
    // Cumulus have flat bases at the condensation level; stratus and rain clouds hang down in ragged shreds.
    float ragged = (0.03 + 0.14 * max(stratus, Detail.z)) * rw_value_noise(p * 1.9 + Detail.xy * 0.6, 4, 5531u);
    float hBase = h - ragged;

    // Denser parts of the field grow into taller towers with rounded tops. Cloud bodies are opaque with fairly
    // well-defined edges, so the density saturates quickly instead of following the coverage field linearly.
    float body = smoothstep(0.0, 0.3, coverage);
    float top = mix(0.22, 1.0, pow(coverage, 0.75));
    float bottomRamp = smoothstep(0.0, 0.05 + 0.08 * (1.0 - coverage), hBase);
    float topRamp = 1.0 - smoothstep(top * 0.5, top, h);
    float shape = body * bottomRamp * topRamp;
    float deckDensity = 0.45 + 0.4 * coverage;
    float deck = bottomRamp * (1.0 - smoothstep(0.28, 0.62, h)) * deckDensity;
    shape = mix(shape, max(shape, deck), stratus);
    columnTop = mix(top * 0.8, max(top * 0.8, 0.5), stratus);
    // Rain clouds are optically much thicker (more and larger droplets) than a dry deck of the same shape.
    columnDensity = mix(body * 0.7, max(body * 0.7, deckDensity), stratus) * Shape.y * (1.0 + 0.9 * Detail.z);
    if (shape <= 0.015) {
        return 0.0;
    }

    // Billowy erosion: evolving detail noise (sheared with height, so it reads as 3D) eats away the edges and
    // upper parts of clouds while leaving their cores intact; stratus decks are only lightly textured.
    vec2 dp = p + Detail.xy + vec2(h * 61.0, h * 37.0);
    float detail = 0.5 * rw_value_noise(dp, 5, 7781u)
                 + 0.3 * rw_value_noise(dp * 1.7 + vec2(113.0, 71.0), 4, 9127u)
                 + 0.2 * rw_value_noise(dp * 2.9 + vec2(-57.0, 29.0), 3, 3343u);
    float edge = 1.0 - smoothstep(0.2, 0.75, coverage);
    float erosion = detail * mix(0.3 + 0.55 * edge, 0.22, stratus) * (0.6 + 0.8 * h);
    return clamp(shape - erosion, 0.0, 1.0) * Shape.y;
}

// Light that has crossed the given optical depth, including an approximation of multiple scattering: successive
// octaves are attenuated less and scattered more isotropically, which keeps thick clouds grey instead of black,
// while the bright forward lobe around the sun only survives in thin clouds.
vec3 scatteredLight(float depth, float cosTheta) {
    float result = 0.0;
    float a = 1.0;
    float b = 1.0;
    float c = 1.0;
    for (int octave = 0; octave < 3; octave++) {
        float phase = mix(henyeyGreenstein(cosTheta, 0.6 * c), henyeyGreenstein(cosTheta, -0.15 * c), 0.3) * 12.566371;
        result += a * exp(-depth * LIGHT_SIGMA * b) * phase;
        a *= 0.42;
        b *= 0.35;
        c *= 0.3;
    }
    return vec3(result);
}

// Soft shoulder instead of clipping: highlights roll off to white, mid tones stay untouched.
vec3 shoulder(vec3 c) {
    const float knee = 0.72;
    vec3 over = max(c - knee, 0.0);
    return min(c, vec3(knee)) + (1.0 - knee) * (1.0 - exp(-over / (1.0 - knee)));
}

float interleavedGradientNoise(vec2 pixel) {
    return fract(52.9829189 * fract(dot(pixel, vec2(0.06711056, 0.00583715))));
}

void main() {
    vec3 dir = normalize(rayEnd);

    // Intersect the view ray with the cloud layer.
    float tStart;
    float tEnd;
    if (abs(dir.y) < 1.0e-4) {
        if (Slab.x > 0.0 || Slab.y < 0.0) {
            discard;
        }
        tStart = 0.0;
        tEnd = Slab.z;
    } else {
        float ta = Slab.x / dir.y;
        float tb = Slab.y / dir.y;
        tStart = max(min(ta, tb), 0.0);
        tEnd = max(ta, tb);
    }
    tEnd = min(tEnd, min(Slab.z, tStart + 900.0));
    if (tEnd <= tStart) {
        discard;
    }

    float steps = Slab.w;
    float stepLength = (tEnd - tStart) / steps;
    float jitter = interleavedGradientNoise(gl_FragCoord.xy + vec2(SkyBottom.w * 5.588238, SkyBottom.w * 2.137));
    float t = tStart + stepLength * jitter;

    vec3 lightDir = LightDir.xyz;
    float cosTheta = dot(dir, lightDir);
    float thickness = Slab.y - Slab.x;

    vec3 color = vec3(0.0);
    float transmittance = 1.0;
    float firstHit = -1.0;

    for (int i = 0; i < 128; i++) {
        if (float(i) >= steps || transmittance < 0.012) {
            break;
        }
        vec3 q = dir * t;
        float h;
        float columnTop;
        float columnDensity;
        float d = cloudDensity(q, h, columnTop, columnDensity);
        if (d > 0.002) {
            if (firstHit < 0.0) {
                firstHit = t;
            }
            // Optical depth towards the light (sun or moon): a few marched samples for the nearby detail...
            float lightDepth = 0.0;
            float lightDistance = 0.0;
            for (int j = 0; j < 3; j++) {
                if (float(j) >= Shape.w) {
                    break;
                }
                float segment = 9.0 * pow(2.6, float(j));
                lightDistance += segment;
                float ignored0;
                float ignored1;
                float ignored2;
                lightDepth += cloudDensity(q + lightDir * lightDistance, ignored0, ignored1, ignored2) * segment;
            }
            // ...plus an estimate for the rest of the column above, which is what darkens the bases of thick clouds.
            float hAfter = h + lightDir.y * lightDistance / thickness;
            float remaining = max(columnTop - hAfter, 0.0) * thickness / max(lightDir.y, 0.2);
            lightDepth += remaining * columnDensity;

            float powder = mix(1.0, 1.0 - exp(-d * 6.0), 0.5);
            vec3 direct = LightColor.rgb * LightDir.w * scatteredLight(lightDepth, cosTheta) * powder;
            // Sky light from above is dimmed by the cloud overhead; light bounced off the ground reaches the base.
            float above = max(columnTop - h, 0.0) * thickness * columnDensity;
            float skyVisibility = exp(-above * SIGMA * 0.5);
            vec3 ambient = (SkyTop.rgb * (0.25 + 0.75 * skyVisibility) * mix(0.55, 1.0, h) + SkyBottom.rgb * (1.0 - h) * 0.5) * LightColor.w * 0.65;
            vec3 scattered = Albedo.rgb * (direct + ambient);
            if (FlashPos.w > 0.0) {
                float flashDistance = length(q - FlashPos.xyz);
                scattered += vec3(0.80, 0.84, 1.0) * FlashPos.w * 2.6 * exp(-flashDistance / 130.0);
            }
            float absorbed = 1.0 - exp(-d * SIGMA * stepLength);
            color += transmittance * scattered * absorbed;
            transmittance *= 1.0 - absorbed;
        }
        t += stepLength;
    }

    float alpha = 1.0 - transmittance;
    if (alpha < 0.004) {
        discard;
    }
    color = shoulder(color / alpha) * alpha;

    // Aerial perspective: distant clouds take on the colour of the haze and dissolve near the cloud range.
    float distance = firstHit < 0.0 ? tStart : firstHit;
    // The layer has fully merged into the haze before it fades out, so it meets the horizon without an edge. The
    // haze is the final fog colour, which is also what the sky shows at the horizon; weather fog shortens the range.
    float range = min(Haze.w, FogCloudsEnd);
    float haze = smoothstep(range * 0.2, range * 0.8, distance);
    color = mix(color, FogColor.rgb * alpha, haze);
    float fade = 1.0 - smoothstep(range * 0.8, range, distance);
    // Hide the layer edge when looking along it from inside.
    fade *= Detail.w > 0.5 ? 1.0 : smoothstep(0.0, 0.02, abs(dir.y));
    fragColor = vec4(color, alpha) * fade * Albedo.a;
}
