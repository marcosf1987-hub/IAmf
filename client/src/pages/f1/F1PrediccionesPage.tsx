import { useTranslation } from "react-i18next";
import F1PredictionsPanel from "../../components/F1PredictionsPanel";

export default function F1PrediccionesPage() {
  const { t } = useTranslation("f1");
  return (
    <div className="f1-page-inner">
      <h2 className="f1-page-title">{t("predictionsPageTitle")}</h2>
      <F1PredictionsPanel />
    </div>
  );
}
