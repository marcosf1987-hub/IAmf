import { Trans, useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import MarketingLayout from "../components/MarketingLayout";
import UpcomingEventsCarousel from "../components/UpcomingEventsCarousel";
import { getCurrentPhase, formatTimeLeftLong } from "../lib/prode-phases";

export default function HomePage() {
  const { t } = useTranslation("home");
  const phase = getCurrentPhase();

  return (
    <MarketingLayout>
        <div className="home-hero">
          <h1>{t("hero.title")}</h1>
          <div className="home-cta">
            <Link to="/signup" className="btn-primary btn-large">
              {t("hero.ctaStart")}
            </Link>
            <Link to="/login" className="btn-secondary btn-large">
              {t("hero.ctaLogin")}
            </Link>
          </div>
          <p className="home-lead home-subtitle">{t("hero.subtitle")}</p>
          <p className="home-lead">{t("hero.lead")}</p>
          <section className="dashboard-tip home-tip" aria-label={t("hero.tipLabel")}>
            <p className="dashboard-tip-text">{t("hero.tip")}</p>
          </section>
          <p className="home-countdown">
            {phase ? (
              <Trans
                i18nKey="hero.countdown"
                ns="home"
                values={{ time: formatTimeLeftLong(phase.deadline) }}
                components={{ strong: <strong /> }}
              />
            ) : (
              t("hero.countdownClosed")
            )}
          </p>
        </div>

        <UpcomingEventsCarousel className="home-upcoming-carousel" />

        <section className="home-features">
          <div className="feature-card">
            <div className="feature-icon" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
            </div>
            <h3>{t("features.analyze.title")}</h3>
            <p>{t("features.analyze.body")}</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3 10.5 7.5 6 9l4.5 1.5L12 15l1.5-4.5L18 9l-4.5-1.5L12 3Z" />
              </svg>
            </div>
            <h3>{t("features.predict.title")}</h3>
            <p>{t("features.predict.body")}</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
                <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                <path d="M4 22h16" />
                <path d="M10 15V17c0 .5-.4 1-1 1s-1 .5-1 1v2" />
                <path d="M14 15V17c0 .5.4 1 1 1s1 .5 1 1v2" />
                <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
              </svg>
            </div>
            <h3>{t("features.compete.title")}</h3>
            <p>{t("features.compete.body")}</p>
          </div>
        </section>
    </MarketingLayout>
  );
}
