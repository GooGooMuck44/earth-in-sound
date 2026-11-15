export type BandSet = "poles" | "halves" | "north" | "south";

export interface Bands {
  label: string;
  title: string;
  names: [string, string, string];
  keys: [string, string, string];
  columns: [string, string, string];
}

export const bandOrder: BandSet[] = ["poles", "halves", "north", "south"];

export const bandSets: Record<BandSet, Bands> = {
  poles: { label: "Poles", title: "Poles and Tropics", names: ["Arctic", "Tropics", "Antarctic"], keys: ["arctic", "tropics", "antarctic"], columns: ["64N-90N", "24S-24N", "90S-64S"] },
  halves: { label: "Hemispheres", title: "North and South", names: ["North", "Global", "South"], keys: ["north", "global", "south"], columns: ["NHem", "Glob", "SHem"] },
  north: { label: "Northern bands", title: "Northern bands", names: ["44–64°N", "24–44°N", "0–24°N"], keys: ["n44", "n24", "n0"], columns: ["44N-64N", "24N-44N", "EQU-24N"] },
  south: { label: "Southern bands", title: "Southern bands", names: ["0–24°S", "24–44°S", "44–64°S"], keys: ["s0", "s24", "s44"], columns: ["24S-EQU", "44S-24S", "64S-44S"] },
};

export const isBandSet = (value: unknown): value is BandSet => bandOrder.includes(value as BandSet);
