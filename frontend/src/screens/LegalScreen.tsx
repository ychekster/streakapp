/**
 * Документ — политика конфиденциальности или условия использования (legal.ts): крупный
 * заголовок и текст в белой карточке. Вложенный экран настроек: пока он открыт,
 * «Закрыть» Telegram заменена на «Назад», а нижняя навигация скрыта.
 */

import { Screen } from "../components/Screen";
import { Card } from "../components/Section";
import type { LegalDocument } from "../legal";
import styles from "./LegalScreen.module.css";

interface LegalScreenProps {
  doc: LegalDocument;
}

export function LegalScreen({ doc }: LegalScreenProps) {
  return (
    <Screen title={doc.title} withTabBar={false} enterAnimation>
      <Card padded>
        <article className={styles.document}>
          <p className={styles.updated}>{doc.updated}</p>
          <p className={styles.paragraph}>{doc.intro}</p>
          {doc.sections.map((section) => (
            <section key={section.heading} className={styles.section}>
              <h2 className={styles.heading}>{section.heading}</h2>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph} className={styles.paragraph}>
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
        </article>
      </Card>
    </Screen>
  );
}
