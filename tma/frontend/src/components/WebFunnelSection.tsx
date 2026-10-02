/**
 * Admin Analytics → «Веб-приложение»: the web app funnel (spec §10) for the same period
 * as the rest of the screen — each step with its count, distinct devices, and the split
 * by platform and by install source. The same numbers as `scripts/funnel.py`.
 */

import { useAdminFormat } from "../adminFormat";
import { useAdminStrings } from "../adminStrings";
import { fetchWebFunnel } from "../api/admin";
import { useResource } from "../hooks/useResource";
import { Card, Section } from "./Section";
import { ListItem } from "./ListItem";
import styles from "./WebFunnelSection.module.css";

function split(counts: Record<string, number>): string {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([key, value]) => `${key} ${value}`)
    .join(", ");
}

export function WebFunnelSection({ days }: { days: number }) {
  const strings = useAdminStrings();
  const format = useAdminFormat();
  const funnel = useResource(() => fetchWebFunnel(days), String(days));
  const steps = funnel.data?.filter((step) => step.total > 0) ?? [];

  return (
    <Section title={strings.webFunnelHeading} footer={strings.webFunnelFooter}>
      <Card>
        {funnel.status === "error" ? (
          <ListItem label={strings.webFunnelLoadFailed} />
        ) : steps.length === 0 ? (
          <ListItem label={funnel.status === "loading" ? "…" : strings.webFunnelEmpty} />
        ) : (
          steps.map((step) => (
            <ListItem
              key={step.event}
              alignTop
              label={
                <span className={styles.step}>
                  <span>{strings.webFunnelSteps[step.event] ?? step.event}</span>
                  <span className={styles.split}>
                    {split(step.by_platform)} · {split(step.by_src)}
                  </span>
                </span>
              }
            >
              <span className={styles.count}>
                {format.count(step.total)} ({format.count(step.unique)})
              </span>
            </ListItem>
          ))
        )}
      </Card>
    </Section>
  );
}
