import { Trans, useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { markContextPickerShownToday, useAppDiscipline } from "../contexts/AppDisciplineContext";

export default function ContextChoicePage() {
  const { t } = useTranslation("app");
  const navigate = useNavigate();
  const { setDiscipline } = useAppDiscipline();

  function chooseFootball() {
    markContextPickerShownToday();
    setDiscipline("football", { navigateToHub: true });
  }

  function chooseF1() {
    markContextPickerShownToday();
    setDiscipline("f1", { navigateToHub: true });
  }

  function skip() {
    markContextPickerShownToday();
    navigate("/app", { replace: true });
  }

  return (
    <div className="context-choice-page">
      <header className="context-choice-hero">
        <p className="context-choice-eyebrow">{t("context.eyebrow")}</p>
        <h1 className="context-choice-title">
          <Trans i18nKey="context.title" ns="app" components={{ em: <em className="context-choice-title-accent" /> }} />
        </h1>
        <p className="context-choice-lead">{t("context.lead")}</p>
      </header>

      <div className="context-choice-cards">
        <button type="button" className="context-choice-card context-choice-card--football" onClick={chooseFootball}>
          <div className="context-choice-card-media" aria-hidden>
            <span className="context-choice-card-badge context-choice-card-badge--tag">{t("context.wcBadge")}</span>
            <div className="context-choice-card-media-shine" />
            <div className="context-choice-card-overlay">
              <span className="context-choice-overlay-line">
                <span className="context-choice-overlay-strong">{t("context.wcTitle")}</span>
                <span className="context-choice-overlay-sep"> — </span>
                <span className="context-choice-overlay-sub">{t("context.wcSub")}</span>
              </span>
            </div>
          </div>
          <div className="context-choice-card-foot">
            <p className="context-choice-card-desc">{t("context.wcDesc")}</p>
          </div>
        </button>

        <button type="button" className="context-choice-card context-choice-card--f1" onClick={chooseF1}>
          <div className="context-choice-card-media" aria-hidden>
            <span className="context-choice-card-badge context-choice-card-badge--tag">{t("context.f1Badge")}</span>
            <div className="context-choice-card-media-shine context-choice-card-media-shine--f1" />
            <div className="context-choice-card-overlay">
              <span className="context-choice-overlay-line">
                <span className="context-choice-overlay-strong">{t("context.f1Title")}</span>
                <span className="context-choice-overlay-sep"> — </span>
                <span className="context-choice-overlay-sub">{t("context.f1Sub")}</span>
              </span>
            </div>
          </div>
          <div className="context-choice-card-foot">
            <p className="context-choice-card-desc">{t("context.f1Desc")}</p>
          </div>
        </button>
      </div>

      <p className="context-choice-footer">
        <button type="button" className="context-choice-skip btn-secondary btn-sm" onClick={skip}>
          {t("context.skip")}
        </button>
      </p>
    </div>
  );
}
