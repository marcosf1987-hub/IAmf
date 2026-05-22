import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { useAppDiscipline } from "../contexts/AppDisciplineContext";
import { useF1DashboardStatusLine } from "../hooks/useF1DashboardStatusLine";

function WaveIcon() {
  return (
    <span className="dashboard-emoji" aria-hidden>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 12c2-3 4-5 6-5s4 2 6 5" />
        <path d="M8 12c2-3 4-5 6-5s4 2 6 5" />
        <path d="M14 12c2-3 4-5 6-5s4 2 6 5" />
      </svg>
    </span>
  );
}

export type DashboardWelcomeBandProps = {
  displayName: string;
  dashTab?: "football" | "f1";
  footballStatusLine: string;
  f1StatusLineFromDashboard?: string;
  f1HubReportedLine?: string;
};

const F1_HUB_PATH = /^\/app\/f1\/?$/;

export default function DashboardWelcomeBand({
  displayName,
  dashTab = "football",
  footballStatusLine,
  f1StatusLineFromDashboard = "",
  f1HubReportedLine = "",
}: DashboardWelcomeBandProps) {
  const { t } = useTranslation("app");
  const { pathname } = useLocation();
  const { setDiscipline } = useAppDiscipline();

  const onAnyF1Route = pathname.startsWith("/app/f1");
  const isF1Hub = F1_HUB_PATH.test(pathname);
  const hookEnabled = onAnyF1Route && !isF1Hub;
  const hookLine = useF1DashboardStatusLine(hookEnabled);

  const activeTab: "football" | "f1" = onAnyF1Route ? "f1" : dashTab;

  const f1DisplayLine =
    activeTab === "f1"
      ? isF1Hub
        ? f1HubReportedLine
        : onAnyF1Route
          ? hookLine
          : f1StatusLineFromDashboard
      : "";

  const statusLabel = activeTab === "f1" ? t("welcome.statusF1") : t("welcome.statusFootball");
  const statusText =
    activeTab === "f1" ? f1DisplayLine || t("welcome.syncingF1") : footballStatusLine;

  return (
    <>
      <header className="dashboard-header-block">
        <h1 className="dashboard-welcome">
          {t("welcome.hello", { name: displayName })} <WaveIcon />
        </h1>
        <p className="dashboard-model-status">
          <span className="dashboard-model-status-label">{statusLabel}</span> {statusText}
        </p>
      </header>

      <div className="dashboard-mode-tabs" role="tablist" aria-label={t("welcome.dashTabs")}>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "football"}
          className={`dashboard-mode-tab${activeTab === "football" ? " dashboard-mode-tab--active" : ""}`}
          onClick={() => setDiscipline("football", { navigateToHub: true })}
        >
          {t("discipline.football")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "f1"}
          className={`dashboard-mode-tab${activeTab === "f1" ? " dashboard-mode-tab--active" : ""}`}
          onClick={() => setDiscipline("f1", { navigateToHub: true })}
        >
          {t("discipline.f1")}
        </button>
      </div>
    </>
  );
}
