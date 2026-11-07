# Clouds & weather module — asset credits

No external assets are used by the clouds module. Everything is generated procedurally at startup:

| Asset | Source | License |
|---|---|---|
| 3D base cloud noise (Perlin-Worley + Worley fBm, 128³ / 64³ at low quality) | generated on the GPU (`src/world/clouds/noise.js`) | self-generated (project license) |
| 3D detail/erosion noise (Worley fBm, 32³) | generated on the GPU (`src/world/clouds/noise.js`) | self-generated |
| Cirrus / cirrostratus texture (512²) | generated on the GPU (`src/world/clouds/noise.js`) | self-generated |
| Weather / coverage map (256², 4 channels) | generated on the CPU (`src/world/clouds/noise.js`) | self-generated |

Techniques follow published real-time cloud rendering work (Schneider & Vos, "The real-time volumetric
cloudscapes of Horizon Zero Dawn", SIGGRAPH 2015; Hillaire, "Physically Based Sky, Atmosphere and Cloud
Rendering in Frostbite", 2016; Wrenninge et al., multiple-scattering octave approximation). No code was copied.
