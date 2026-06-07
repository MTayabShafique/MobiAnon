import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const API       = 'http://localhost:5000';
const CACHE_KEY = 'bicycleDataSourcesCache';

const EMPTY = { preloaded: 0, userUploaded: 0, bounds: {} };

// Read cached counts synchronously to avoid a zero-count flicker.
const readCache = () => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const writeCache = (data) => {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch { /* non-fatal */ }
};

/** Return cached data-source counts, then refresh them from the API. */
const useDataSources = () => {
  // First paint uses cached values when available.
  const [dataSourceInfo, setDataSourceInfo] = useState(() => readCache() ?? EMPTY);

  const refreshDataSources = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/api/upload/data-sources`);
      setDataSourceInfo(data.data);
      writeCache(data.data);         // keep the cache fresh for next navigation
    } catch {
      // Non-fatal — stale cache values remain visible
    }
  }, []);

  // Refresh on mount; callers can refresh again after uploads or deletes.
  useEffect(() => {
    refreshDataSources();
  }, [refreshDataSources]);

  return { dataSourceInfo, refreshDataSources };
};

export default useDataSources;
