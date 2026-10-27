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

float cloudDensity(vec3 q, out float heightFraction) {
    float h = (q.y - Slab.x) / (Slab.y - Slab.x);
    heightFraction = h;
    if (h <= 0.0 || h >= 1.0) {
        return 0.0;
    }
    vec2 p = rw_noise_position(q);
    float coverage = rw_coverage(rw_cloud_base(p), Shape.x);
    if (coverage <= 0.0) {
        return 0.0;
    }
    // Denser parts of the field grow into taller towers with rounded tops and flat bases.
    float top = mix(0.22, 1.0, pow(coverage, 0.75));
    float bottomRamp = smoothstep(0.0, 0.06 + 0.1 * (1.0 - coverage), h);
    float topRamp = 1.0 - smoothstep(top * 0.5, top, h);
    float shape = coverage * bottomRamp * topRamp;

    // Overcast skies flatten into a continuous stratus deck.
    float stratus = smoothstep(0.82, 1.0, Shape.x);
    float deck = bottomRamp * (1.0 - smoothstep(0.28, 0.62, h)) * (0.45 + 0.4 * coverage);
    shape = mix(shape, max(shape, deck), stratus);
    if (shape <= 0.015) {
        return 0.0;
    }

    // Billowy erosion: evolving detail noise eats away edges and upper parts more than cores.
    vec2 dp = p + Detail.xy + vec2(h * 61.0, h * 37.0);
    float detail = 0.62 * rw_value_noise(dp, 5, 7781u) + 0.38 * rw_value_noise(dp * 1.7 + vec2(113.0, 71.0), 4, 9127u);
    float erosion = detail * (0.62 - 0.35 * shape) * (0.55 + 0.7 * h);
    return clamp(shape - erosion * (1.0 - 0.5 * stratus), 0.0, 1.0) * Shape.y;
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
    float phase = mix(henyeyGreenstein(cosTheta, 0.62), henyeyGreenstein(cosTheta, -0.2), 0.32) * 12.566371;

    vec3 color = vec3(0.0);
    float transmittance = 1.0;
    float firstHit = -1.0;

    for (int i = 0; i < 128; i++) {
        if (float(i) >= steps || transmittance < 0.012) {
            break;
        }
        vec3 q = dir * t;
        float h;
        float d = cloudDensity(q, h);
        if (d > 0.002) {
            if (firstHit < 0.0) {
                firstHit = t;
            }
            // Optical depth towards the light (sun or moon).
            float lightDepth = 0.0;
            float lightDistance = 0.0;
            for (int j = 0; j < 3; j++) {
                if (float(j) >= Shape.w) {
                    break;
                }
                float segment = 9.0 * pow(2.6, float(j));
                lightDistance += segment;
                float ignored;
                lightDepth += cloudDensity(q + lightDir * lightDistance, ignored) * segment;
            }
            float lightTransmittance = exp(-lightDepth * LIGHT_SIGMA) * 0.85 + 0.15 * exp(-lightDepth * LIGHT_SIGMA * 0.25);
            float powder = 1.0 - exp(-d * 5.0);
            vec3 direct = LightColor.rgb * LightDir.w * lightTransmittance * phase * mix(1.0, powder * 1.8, 0.45);
            float skyMix = clamp(h * 1.3 + 0.1, 0.0, 1.0);
            vec3 ambient = mix(SkyBottom.rgb, SkyTop.rgb, skyMix) * LightColor.w * (0.62 + 0.38 * (1.0 - d));
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

    // Aerial perspective: distant clouds take on the colour of the haze and dissolve near the cloud range.
    float distance = firstHit < 0.0 ? tStart : firstHit;
    float haze = smoothstep(Haze.w * 0.3, Haze.w, distance);
    color = mix(color, Haze.rgb * alpha, haze * 0.8);
    float fade = 1.0 - smoothstep(Haze.w * 0.65, Haze.w, distance);
    // Hide the layer edge when looking along it from inside.
    fade *= Detail.w > 0.5 ? 1.0 : smoothstep(0.0, 0.02, abs(dir.y));
    fragColor = vec4(color, alpha) * fade * Albedo.a;
}
