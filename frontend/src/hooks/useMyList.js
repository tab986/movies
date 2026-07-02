import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { fetchMyList, myListStatus, toggleMyList } from "../services/api";

const CHANGE_EVENT = "movies:my-list-changed";

function notifyChange() {
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useMyList() {
  const { isAuthenticated } = useAuth();
  const [ids, setIds] = useState([]);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) {
      setIds([]);
      setReady(true);
      return;
    }
    try {
      const movies = await fetchMyList();
      setIds(movies.map((m) => m.id));
    } catch {
      setIds([]);
    } finally {
      setReady(true);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    setReady(false);
    refresh();
    const onChange = () => refresh();
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => window.removeEventListener(CHANGE_EVENT, onChange);
  }, [refresh]);

  const isInList = useCallback((movieId) => ids.includes(Number(movieId)), [ids]);

  const toggle = useCallback(
    async (movieId) => {
      const result = await toggleMyList(movieId);
      notifyChange();
      return result.inList;
    },
    []
  );

  const checkStatus = useCallback(async (movieId) => {
    if (!isAuthenticated) return false;
    try {
      const result = await myListStatus(movieId);
      return result.inList;
    } catch {
      return false;
    }
  }, [isAuthenticated]);

  return { ids, isInList, toggle, checkStatus, ready, refresh, isAuthenticated };
}
