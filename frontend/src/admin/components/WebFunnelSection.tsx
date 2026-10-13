/**
 * Admin Analytics → «Веб-приложение»: the web app funnel (spec §10) for the same period
 * as the rest of the screen — each step with its count and distinct devices in brackets.
 * The split by platform and source is in `scripts/funnel.py`.
 */

import { useAdminFormat } from "../adminFormat";
import { useAdminStrings } from "../adminStrings";
import { fetchWebFunnel } from "../../api/admin";
import { useResource } from "../../hooks/useResource";
import { Card, Section } from "../../components/Section";
import { ListItem } from "../../components/ListItem";
import styles from "./WebFunnelSection.module.css";

export function WebFunnelSection({ days }: { days: number }) {
  const strings = useAdminStrings();
  const format = useAdminFormat();
  const funnel = useResource(() => fetchWebFunnel(days), String(days));
  const steps = funnel.data?.filter((step) => step.total > 0) ?? [];

  return (
    <Section title={strings.webFunnelHeading}>
      <Card>
        {funnel.status === "error" ? (
          <ListItem label={strings.webFunnelLoadFailed} />
        ) : steps.length === 0 ? (
          <ListItem label={funnel.status === "loading" ? "…" : strings.webFunnelEmpty} />
        ) : (
          steps.map((step) => (
            <ListItem key={step.event} label={strings.webFunnelSteps[step.event] ?? step.event}>
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
