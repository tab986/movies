import { useCallback, useEffect, useState } from "react";
import { fetchMyList, myListStatus, toggleMyList } from "../services/api";

const CHANGE_EVENT = "movies:my-list-changed";

function notifyChange() {
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useMyList() {
  const [ids, setIds] = useState([]);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const movies = await fetchMyList();
      setIds(movies.map((m) => m.id));
    } catch {
      setIds([]);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    refresh();
    const onChange = () => {
      refresh();
    };
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => window.removeEventListener(CHANGE_EVENT, onChange);
  }, [refresh]);

  const isInList = useCallback((movieId) => ids.includes(Number(movieId)), [ids]);

  const toggle = useCallback(async (movieId) => {
    const result = await toggleMyList(movieId);
    notifyChange();
    return result.inList;
  }, []);

  const checkStatus = useCallback(async (movieId) => {
    try {
      const result = await myListStatus(movieId);
      return result.inList;
    } catch {
      return false;
    }
  }, []);

  return { ids, isInList, toggle, checkStatus, ready, refresh };
}
