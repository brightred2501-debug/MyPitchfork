import { normalizeDraft } from "./draft.js";

const STORAGE_KEY = "my-pitchfork-review-draft";

export function loadStoredDraft(storage) {
  try {
    const target = storage || globalThis.localStorage;
    const stored = target.getItem(STORAGE_KEY);
    if (!stored) return null;

    return normalizeDraft(JSON.parse(stored));
  } catch {
    return null;
  }
}

export function persistDraft(draft, storage) {
  const target = storage || globalThis.localStorage;

  if (draft) {
    target.setItem(STORAGE_KEY, JSON.stringify(draft));
  } else {
    target.removeItem(STORAGE_KEY);
  }
}
