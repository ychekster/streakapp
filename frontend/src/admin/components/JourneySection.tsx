/**
 * Аналитика → Воронка → «Путь с сайта»: люди, открывшие страницу за период, и где они
 * отваливаются. Две ветки (backend/analytics/journey.py): установка приложения и переход в
 * Telegram; у шага — сколько до него дошло и доля от прошлого шага. Нажатие на шаг — кто на
 * нём остановился (AdminJourneyScreen), оттуда — путь человека с первого клика.
 */

import { fetchJourney } from "../../api/admin";
import { useResource } from "../../hooks/useResource";
import { habitColorStyle } from "../../theme";
import type { JourneyPath, JourneyPathKey } from "../../types/admin";
import type { HabitColor } from "../../types/habit";
import { useAdminFormat } from "../adminFormat";
import { useAdminStrings } from "../adminStrings";
import { Block, TableCard } from "../analytics/kit";
import styles from "../analytics/Analytics.module.css";

/** Кто остановился на шаге `step` ветки `path` за `days` дней; `title` — заголовок экрана. */
export interface JourneyQuery {
  days: number;
  path: JourneyPathKey;
  step: string;
  title: string;
}

const COLORS: Record<JourneyPathKey, HabitColor> = { install: "purple", telegram: "blue" };

export function JourneySection({
  days,
  onOpen,
}: {
  days: number;
  onOpen: (query: JourneyQuery) => void;
}) {
  const strings = useAdminStrings();
  const report = useResource(() => fetchJourney(days), String(days));
  if (report.status === "error") {
    return <p className={styles.footnote}>{strings.journeyLoadFailed}</p>;
  }
  if (!report.data) {
    return null;
  }
  return (
    <>
      {report.data.paths.map((path) => (
        <PathBlock key={path.path} path={path} days={days} onOpen={onOpen} />
      ))}
    </>
  );
}

function PathBlock({
  path,
  days,
  onOpen,
}: {
  path: JourneyPath;
  days: number;
  onOpen: (query: JourneyQuery) => void;
}) {
  const strings = useAdminStrings();
  const format = useAdminFormat();
  const an = strings.an;
  const top = Math.max(1, ...path.steps.map((step) => step.people));
  const title = `${strings.journeyHeading}: ${strings.journeyPaths[path.path] ?? path.path}`;
  return (
    <div className={styles.block} style={habitColorStyle(COLORS[path.path])}>
      <Block title={title} info={strings.journeyFooter}>
        <TableCard title={title}>
          {path.steps.map((step, index) => {
            const name = strings.webFunnelSteps[step.key] ?? step.key;
            const meta =
              index && step.from_previous !== null
                ? an.fromPrevious(format.percent(step.from_previous))
                : null;
            return (
              <button
                key={step.key}
                type="button"
                className={styles.step}
                onClick={() =>
                  onOpen({
                    days,
                    path: path.path,
                    step: step.key,
                    title: index ? strings.journeyStuckTitle(name) : strings.journeyLeftLanding,
                  })
                }
              >
                <span className={styles.stepHead}>
                  <span className={styles.stepName}>{name}</span>
                  <span className={styles.stepCount}>{format.count(step.people)}</span>
                </span>
                <span className={styles.stepBar}>
                  <span
                    className={styles.stepFill}
                    style={{ width: `${(step.people / top) * 100}%` }}
                  />
                </span>
                {meta ? <span className={styles.stepMeta}>{meta}</span> : null}
              </button>
            );
          })}
        </TableCard>
      </Block>
    </div>
  );
}
