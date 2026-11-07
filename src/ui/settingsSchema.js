// Settings panel description: every key of DEFAULT_SETTINGS, grouped.
// type: 'select' (segmented), 'range', 'toggle'.
const pct = (v) => `${Math.round(v * 100)}%`;

export const SETTINGS_GROUPS = [
  {
    id: 'graphics', label: 'Graphics',
    items: [
      { key: 'quality', type: 'select', label: 'Quality preset', hint: 'Auto picks a preset for your graphics card.', options: [['auto', 'Auto'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['ultra', 'Ultra']] },
      { key: 'resolutionScale', type: 'range', label: 'Resolution scale', hint: 'Lower values render fewer pixels for smoother performance.', min: 0.5, max: 1, step: 0.05, fmt: pct },
      { key: 'fov', type: 'range', label: 'Field of view', hint: 'Vertical field of view.', min: 55, max: 95, step: 1, fmt: (v) => `${Math.round(v)}°` },
      { key: 'autoExposure', type: 'toggle', label: 'Auto exposure', hint: 'Your eyes adapt between the bright windows and the cabin.' },
      { key: 'bloom', type: 'toggle', label: 'Bloom', hint: 'Soft glow around the sun and bright lights.' },
      { key: 'filmGrain', type: 'toggle', label: 'Film grain' },
      { key: 'vignette', type: 'toggle', label: 'Vignette' },
    ],
  },
  {
    id: 'controls', label: 'Controls',
    items: [
      { key: 'mouseSensitivity', type: 'range', label: 'Mouse sensitivity', min: 0.2, max: 3, step: 0.05, fmt: (v) => `${(+v).toFixed(2)}×` },
      { key: 'invertY', type: 'toggle', label: 'Invert vertical look' },
      { key: 'headBob', type: 'toggle', label: 'Head bob', hint: 'Subtle motion while walking.' },
      { key: 'cameraShake', type: 'range', label: 'Camera shake', hint: 'Vibration, turbulence and touchdown motion.', min: 0, max: 1, step: 0.05, fmt: pct },
    ],
  },
  {
    id: 'audio', label: 'Audio',
    items: [
      { key: 'masterVolume', type: 'range', label: 'Master volume', min: 0, max: 1, step: 0.01, fmt: pct },
      { key: 'engineVolume', type: 'range', label: 'Engines', min: 0, max: 1, step: 0.01, fmt: pct },
      { key: 'ambienceVolume', type: 'range', label: 'Cabin ambience', hint: 'Air conditioning, airflow, rumble.', min: 0, max: 1, step: 0.01, fmt: pct },
      { key: 'effectsVolume', type: 'range', label: 'Effects', hint: 'Bins, belts, trays, doors, chimes.', min: 0, max: 1, step: 0.01, fmt: pct },
      { key: 'announcementVolume', type: 'range', label: 'Announcements', min: 0, max: 1, step: 0.01, fmt: pct },
      { key: 'ifeVolume', type: 'range', label: 'Entertainment', hint: 'Seatback screen audio.', min: 0, max: 1, step: 0.01, fmt: pct },
    ],
  },
  {
    id: 'experience', label: 'Experience',
    items: [
      { key: 'subtitles', type: 'toggle', label: 'Subtitles', hint: 'Show captions for crew announcements.' },
      { key: 'announcements', type: 'toggle', label: 'Crew announcements' },
      { key: 'gateMinutes', type: 'range', label: 'Time at the gate', hint: 'Before pushback starts on its own. 0 = wait until I choose.', min: 0, max: 10, step: 1, fmt: (v) => (v <= 0 ? 'Wait' : `${v} min`) },
      { key: 'cruiseMinutes', type: 'range', label: 'Cruise length', hint: '0 = stay in cruise until I choose “Begin descent”.', min: 0, max: 60, step: 1, fmt: (v) => (v <= 0 ? 'Until I choose' : `${v} min`) },
      { key: 'pacing', type: 'select', label: 'Pacing', hint: 'Compressed shortens the climb and descent.', options: [['compressed', 'Compressed'], ['realistic', 'Realistic']] },
      { key: 'timeOfDay', type: 'select', label: 'Time of day', options: [['auto', 'Auto'], ['morning', 'Morning'], ['noon', 'Noon'], ['afternoon', 'Afternoon'], ['sunset', 'Sunset'], ['night', 'Night']] },
      { key: 'weather', type: 'select', label: 'Weather', options: [['auto', 'Auto'], ['clear', 'Clear'], ['scattered', 'Scattered'], ['overcast', 'Overcast']] },
      { key: 'units', type: 'select', label: 'Units', options: [['imperial', 'Feet · mph'], ['metric', 'Metres · km/h']] },
    ],
  },
  {
    id: 'interface', label: 'Interface',
    items: [
      { key: 'showHud', type: 'toggle', label: 'Show HUD', hint: 'Prompts, captions and notifications (H).' },
      { key: 'showProgress', type: 'toggle', label: 'Flight progress line', hint: 'A slim line at the top of the screen.' },
      { key: 'showFps', type: 'toggle', label: 'Frame rate counter' },
      { key: 'showCrosshair', type: 'toggle', label: 'Centre dot' },
    ],
  },
];
