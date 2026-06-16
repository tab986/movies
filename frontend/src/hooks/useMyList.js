import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "movies:my-list";
const CHANGE_EVENT = "movies:my-list-changed";

function readIds() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed.map(Number).filter((n) => Number.isInteger(n) && n > 0) : [];
  } catch {
    return [];
  }
}

function writeIds(ids) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useMyList() {
  const [ids, setIds] = useState(readIds);

  useEffect(() => {
    const sync = () => setIds(readIds());
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const isInList = useCallback((movieId) => ids.includes(Number(movieId)), [ids]);

  const toggle = useCallback((movieId) => {
    const id = Number(movieId);
    const next = readIds();
    const idx = next.indexOf(id);
    if (idx >= 0) {
      next.splice(idx, 1);
      writeIds(next);
      setIds(next);
      return false;
    }
    next.unshift(id);
    writeIds(next);
    setIds(next);
    return true;
  }, []);

  return { ids, isInList, toggle };
}
