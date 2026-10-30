export type BodyType = "Star" | "Terrestrial" | "Gas Giant" | "Ice Giant";

export interface Body {
  id: string;
  name: string;
  type: BodyType;
  diameterKm: number;
  distanceMkm: number; // million km from Sun
  orbitalPeriodDays: number;
  dayLengthHours: number;
  moons: number;
  massEarths: number;
  color: string;
  color2: string;
  // visual
  radius: number;
  orbit: number;
  ring?: boolean;
  blurb: string;
}

export const BODIES: Body[] = [
  { id: "sun", name: "Sun", type: "Star", diameterKm: 1392700, distanceMkm: 0, orbitalPeriodDays: 0, dayLengthHours: 609.1, moons: 0, massEarths: 333000, color: "#ffb347", color2: "#ff7a1a", radius: 3.2, orbit: 0, blurb: "A G-type main-sequence star holding 99.86% of the system's mass." },
  { id: "mercury", name: "Mercury", type: "Terrestrial", diameterKm: 4879, distanceMkm: 57.9, orbitalPeriodDays: 88, dayLengthHours: 4222.6, moons: 0, massEarths: 0.055, color: "#a8a29e", color2: "#6b6560", radius: 0.38, orbit: 6, blurb: "Smallest planet, scorched by day and frozen by night." },
  { id: "venus", name: "Venus", type: "Terrestrial", diameterKm: 12104, distanceMkm: 108.2, orbitalPeriodDays: 224.7, dayLengthHours: 2802, moons: 0, massEarths: 0.815, color: "#e8c78f", color2: "#b88a4a", radius: 0.7, orbit: 8.5, blurb: "Thick CO₂ clouds make it the hottest planet." },
  { id: "earth", name: "Earth", type: "Terrestrial", diameterKm: 12756, distanceMkm: 149.6, orbitalPeriodDays: 365.2, dayLengthHours: 24, moons: 1, massEarths: 1, color: "#3b82c4", color2: "#3f8f4a", radius: 0.75, orbit: 11.5, blurb: "The only known world with liquid surface oceans and life." },
  { id: "mars", name: "Mars", type: "Terrestrial", diameterKm: 6792, distanceMkm: 227.9, orbitalPeriodDays: 687, dayLengthHours: 24.7, moons: 2, massEarths: 0.107, color: "#c1440e", color2: "#8a2e0a", radius: 0.5, orbit: 14.5, blurb: "The red planet, home to Olympus Mons." },
  { id: "jupiter", name: "Jupiter", type: "Gas Giant", diameterKm: 142984, distanceMkm: 778.5, orbitalPeriodDays: 4331, dayLengthHours: 9.9, moons: 95, massEarths: 317.8, color: "#d8b48a", color2: "#a0673d", radius: 1.9, orbit: 20, blurb: "The giant, with a storm bigger than Earth." },
  { id: "saturn", name: "Saturn", type: "Gas Giant", diameterKm: 120536, distanceMkm: 1432, orbitalPeriodDays: 10747, dayLengthHours: 10.7, moons: 146, massEarths: 95.2, color: "#e6d3a3", color2: "#b39a62", radius: 1.6, orbit: 26, ring: true, blurb: "Famous for its bright ice rings." },
  { id: "uranus", name: "Uranus", type: "Ice Giant", diameterKm: 51118, distanceMkm: 2867, orbitalPeriodDays: 30589, dayLengthHours: 17.2, moons: 28, massEarths: 14.5, color: "#9fe3e8", color2: "#5fb7c4", radius: 1.1, orbit: 31.5, blurb: "Rolls around the Sun on its side." },
  { id: "neptune", name: "Neptune", type: "Ice Giant", diameterKm: 49528, distanceMkm: 4515, orbitalPeriodDays: 59800, dayLengthHours: 16.1, moons: 16, massEarths: 17.1, color: "#4b70dd", color2: "#2a3f9a", radius: 1.05, orbit: 36, blurb: "Windiest world, with gusts over 2,000 km/h." },
];

export const getBody = (id: string) => BODIES.find((b) => b.id === id)!;

export function filterBodies(query: string, type: string): Body[] {
  const q = query.trim().toLowerCase();
  return BODIES.filter(
    (b) => (type === "All" || b.type === type) && (!q || b.name.toLowerCase().includes(q) || b.type.toLowerCase().includes(q)),
  );
}

/** Angle (radians) of a body after `days` simulated days. */
export function orbitAngle(b: Body, days: number): number {
  if (!b.orbitalPeriodDays) return 0;
  const phase = (BODIES.indexOf(b) * 1.7) % (Math.PI * 2);
  return phase + (days / b.orbitalPeriodDays) * Math.PI * 2;
}

export const COMPARE_PARAMS = [
  { key: "diameterKm", label: "Diameter", unit: "km" },
  { key: "distanceMkm", label: "Distance from Sun", unit: "M km" },
  { key: "orbitalPeriodDays", label: "Orbital period", unit: "days" },
  { key: "massEarths", label: "Mass", unit: "× Earth" },
  { key: "moons", label: "Moons", unit: "" },
] as const;
