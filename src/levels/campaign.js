// Campaigns and their chapter order.
import ch1 from './ch1_apartments.js';
import ch2 from './ch2_subway.js';
import ch3 from './ch3_sewer.js';
import ch4 from './ch4_hospital.js';
import ch5 from './ch5_rooftop.js';
import da1 from './da1_greenhouse.js';
import da2 from './da2_crane.js';
import da3 from './da3_construction.js';
import da4 from './da4_terminal.js';
import da5 from './da5_runway.js';

// Dead Air is listed first: it is the default campaign (Play, ?autostart=N).
export const CAMPAIGNS = [
  {
    id: 'deadair', title: 'Dead Air', color: '#8fb0d8',
    blurb: 'Cross the rooftops of Newburg, work a crane across the skyline and fight through the airport to the last plane out.',
    chapters: [da1, da2, da3, da4, da5],
  },
  {
    id: 'nomercy', title: 'No Mercy', color: '#c8b070',
    blurb: 'Fight across a burning city — apartments, subway, sewers — to the rooftop of Mercy Hospital and a last helicopter out.',
    chapters: [ch1, ch2, ch3, ch4, ch5],
  },
];
export const campaignById = (id) => CAMPAIGNS.find((c) => c.id === id) || CAMPAIGNS[0];
// back-compat: No Mercy's chapters
export const CHAPTERS = campaignById('nomercy').chapters;
