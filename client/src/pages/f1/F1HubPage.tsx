import { useOutletContext } from "react-router-dom";
import F1HomeOverview from "../../components/F1HomeOverview";
import type { F1LayoutOutletContext } from "./f1-layout-context";

export default function F1HubPage() {
  const { setF1HubDashboardLine } = useOutletContext<F1LayoutOutletContext>();
  return (
    <div className="f1-hub">
      <F1HomeOverview onStatusLine={setF1HubDashboardLine} />
    </div>
  );
}
