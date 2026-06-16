import { useCallback, useEffect, useState } from "react";
import type { FootballDataSyncStatus, SyncMatchResultsResponse } from "../lib/api";

type Props = {
  fetchStatus: () => Promise<FootballDataSyncStatus>;
  runSync: (options?: { fullScan?: boolean }) => Promise<SyncMatchResultsResponse>;
  loading?: boolean;
  onError?: (message: string) => void;
};

export default function MatchResultsSyncPanel({ fetchStatus, runSync, loading, onError }: Props) {
  const [status, setStatus] = useState<FootballDataSyncStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [fullScan, setFullScan] = useState(true);

  const reloadStatus = useCallback(async () => {
    try {
      const s = await fetchStatus();
      setStatus(s);
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "Error al cargar estado del sync");
      setStatus(null);
    }
  }, [fetchStatus, onError]);

  useEffect(() => {
    if (!loading) void reloadStatus();
  }, [loading, reloadStatus]);

  async function handleSync() {
    setBusy(true);
    setMessage("");
    try {
      const result = await runSync({ fullScan });
      setMessage(result.message);
      await reloadStatus();
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "Error al sincronizar resultados");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <p className="placeholder-text">Cargando estado del sync…</p>;
  }

  if (!status) return null;

  return (
    <>
      <div className="platform-overview-cards platform-match-sync-cards">
        <div className="platform-overview-card">
          <div className="platform-overview-card-label">API key configurada</div>
          <div className="platform-overview-card-value">{status.apiKeyConfigured ? "Sí" : "No"}</div>
        </div>
        <div className="platform-overview-card">
          <div className="platform-overview-card-label">Auto-sync</div>
          <div className="platform-overview-card-value">
            {status.autoSyncEnabled ? `Cada ${status.autoSyncIntervalMs / 60_000} min` : "Off"}
          </div>
        </div>
        <div className="platform-overview-card">
          <div className="platform-overview-card-label">Con resultado</div>
          <div className="platform-overview-card-value">
            {status.matchesWithResult}/{status.totalMatches}
          </div>
        </div>
        <div className="platform-overview-card">
          <div className="platform-overview-card-label">Filas pendientes</div>
          <div className="platform-overview-card-value">{status.pendingRows}</div>
        </div>
      </div>
      {!status.apiKeyConfigured && (
        <div className="auth-error" style={{ marginTop: "0.75rem" }}>
          Falta <strong>FOOTBALL_DATA_API_KEY</strong> en las variables del servicio backend en Railway.
        </div>
      )}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.75rem",
          alignItems: "center",
          marginTop: "1rem",
        }}
      >
        <button
          type="button"
          className="btn-primary"
          onClick={() => void handleSync()}
          disabled={busy || !status.apiKeyConfigured}
        >
          {busy ? "Sincronizando…" : "Sincronizar resultados ahora"}
        </button>
        <label className="admin-date-range-alltime" style={{ margin: 0 }}>
          <input
            type="checkbox"
            checked={fullScan}
            onChange={(e) => setFullScan(e.target.checked)}
            disabled={busy}
          />
          Escaneo completo (todos los partidos API)
        </label>
      </div>
      {message && (
        <div className="auth-success" style={{ marginTop: "0.75rem" }}>
          {message}
        </div>
      )}
    </>
  );
}
