import { useEffect, useState } from "react";
import { EMPTY_STATUS, normalizeStatus } from "../utils/status.js";

export function useSchoolStatus() {
  const [status, setStatus] = useState(EMPTY_STATUS);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadStatus() {
      try {
        const response = await fetch("./school-status.json", { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        if (!cancelled) {
          setStatus(normalizeStatus(data));
          setError("");
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      }
    }

    loadStatus();
    const timer = window.setInterval(loadStatus, 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return { status, error };
}
