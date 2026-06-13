// Registry of source adapters. Add a new file here to plug in a new source —
// each declares which pipeline ('deliver' | 'sell') it feeds, so the two tasks
// (handle SMBs yourself vs. sell enterprise leads) stay cleanly separated.
import googlePlaces from "./googlePlaces";
import jobBoards from "./jobBoards";
import marketplaces from "./marketplaces";

export const ADAPTERS = [googlePlaces, jobBoards, marketplaces];

export function getAdapter(id) {
  return ADAPTERS.find((a) => a.id === id) || null;
}

// Plain, client-safe descriptors (no functions) for rendering the picker.
export function listAdapters() {
  return ADAPTERS.map((a) => ({
    id: a.id,
    label: a.label,
    pipeline: a.pipeline,
    description: a.description,
    requiresKey: a.requiresKey,
    ready: a.ready(),
  }));
}
