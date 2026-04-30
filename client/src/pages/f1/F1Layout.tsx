import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import DashboardWelcomeBand from "../../components/DashboardWelcomeBand";
import { useAuth } from "../../contexts/AuthContext";
import type { F1LayoutOutletContext } from "./f1-layout-context";

export default function F1Layout() {
  const { user } = useAuth();
  const pathname = useLocation().pathname;
  const [hubLine, setHubLine] = useState("");
  const displayName = user?.fullName || user?.email || "Usuario";

  useEffect(() => {
    if (!/^\/app\/f1\/?$/.test(pathname)) setHubLine("");
  }, [pathname]);

  const outletCtx: F1LayoutOutletContext = { setF1HubDashboardLine: setHubLine };

  return (
    <div className="page-content page-content--f1 f1-section">
      <div className="dashboard">
        <DashboardWelcomeBand displayName={displayName} footballStatusLine="" f1HubReportedLine={hubLine} />
        <Outlet context={outletCtx} />
      </div>
    </div>
  );
}
