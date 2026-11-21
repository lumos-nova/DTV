import { useEffect, useState } from "react";
import { loadJSON, saveJSON } from "@/lib/storage";
import { normalizeMonitorWorkspace, type MonitorGridSize } from "./layout";

const STORAGE_KEY = "dtv_monitor_workspace_v1";

export function useMonitorWorkspace() {
  const [workspace, setWorkspace] = useState(() =>
    normalizeMonitorWorkspace(loadJSON<unknown>(STORAGE_KEY, null)),
  );

  useEffect(() => {
    saveJSON(STORAGE_KEY, workspace);
  }, [workspace]);

  const setGrid = (grid: MonitorGridSize) => {
    setWorkspace((previous) => ({ ...previous, grid }));
  };

  return { ...workspace, setWorkspace, setGrid };
}
