/**
 * Политика конфиденциальности и условия использования на обоих языках интерфейса
 * (экран LegalScreen, открывается из настроек).
 *
 * Тексты описывают то, что приложение действительно делает: какие данные хранит
 * бэкенд (tma/backend/models.py), что запоминается на устройстве (preferences.ts), что
 * удаление привычки мягкое. Если это меняется — тексты и дату обновления нужно
 * поправить вместе с кодом.
 */

export interface LegalSection {
  heading: string;
  paragraphs: string[];
}

export interface LegalDocument {
  title: string;
  updated: string;
  intro: string;
  sections: LegalSection[];
}

const PRIVACY_RU: LegalDocument = {
  title: "Политика конфиденциальности",
  updated: "Обновлено 21 сентября 2026 г.",
  intro:
    "StreakApp — мини-приложение в Telegram для отслеживания привычек. Здесь описано, какие данные приложение получает, зачем они нужны и как с ними обращаются.",
  sections: [
    {
      heading: "Какие данные мы получаем",
      paragraphs: [
        "Данные Telegram: ваш идентификатор, имя пользователя (@username), имя и язык Telegram. Telegram передаёт их приложению при каждом открытии. Номер телефона, контакты и переписка приложению недоступны.",
        "Данные, которые вы вводите сами: привычки (название, расписание, время напоминания, цвет), отметки о выполнении и настройки — часовой пояс, язык, тему оформления и режим «Отмечать за вчера».",
      ],
    },
    {
      heading: "Зачем они нужны",
      paragraphs: [
        "Только для работы приложения: чтобы показывать ваши привычки и серии, считать «сегодня» в вашем часовом поясе и присылать напоминания в чат с ботом.",
        "Мы не показываем рекламу, не продаём и не передаём ваши данные третьим лицам и не используем их для составления профилей.",
      ],
    },
    {
      heading: "Где хранятся данные",
      paragraphs: [
        "На сервере приложения. Каждый запрос подписан Telegram: сервер проверяет подпись и отдаёт вам только ваши данные.",
        "Язык и тема оформления дополнительно запоминаются на вашем устройстве, чтобы приложение сразу открывалось в нужном виде.",
      ],
    },
    {
      heading: "Удаление данных",
      paragraphs: [
        "Удалённая привычка сразу пропадает из приложения, но история её отметок остаётся на сервере. Чтобы удалить все свои данные, напишите разработчику — контакт указан в описании бота.",
      ],
    },
    {
      heading: "Изменения политики",
      paragraphs: [
        "Если политика изменится, новая версия появится на этой странице с новой датой обновления.",
      ],
    },
  ],
};

const TERMS_RU: LegalDocument = {
  title: "Условия использования",
  updated: "Обновлено 21 сентября 2026 г.",
  intro: "Пользуясь StreakApp, вы соглашаетесь с этими условиями.",
  sections: [
    {
      heading: "Приложение",
      paragraphs: [
        "StreakApp помогает соблюдать привычки: отмечать выполнение, следить за сериями и получать напоминания в Telegram. Приложение бесплатное и работает внутри Telegram.",
      ],
    },
    {
      heading: "Ваш аккаунт",
      paragraphs: [
        "Вход — через ваш аккаунт Telegram, отдельной регистрации нет. Вы отвечаете за то, что добавляете в приложение. Не используйте его для противоправных целей и не пытайтесь нарушить его работу.",
      ],
    },
    {
      heading: "Без гарантий",
      paragraphs: [
        "Приложение предоставляется «как есть». Мы стараемся, чтобы оно работало стабильно, но не гарантируем бесперебойную работу, своевременную доставку напоминаний и сохранность данных.",
        "Не полагайтесь на StreakApp там, где сбой может причинить вред, — например, для приёма лекарств.",
      ],
    },
    {
      heading: "Изменения",
      paragraphs: [
        "Мы можем менять приложение и эти условия или прекратить работу приложения. Новая версия условий появится на этой странице с новой датой обновления.",
      ],
    },
    {
      heading: "Telegram",
      paragraphs: [
        "StreakApp — независимое приложение и не связано с Telegram. Пользование самим Telegram регулируется его собственными условиями.",
      ],
    },
    {
      heading: "Контакты",
      paragraphs: [
        "Вопросы о приложении задавайте разработчику — контакт указан в описании бота.",
      ],
    },
  ],
};

const PRIVACY_EN: LegalDocument = {
  title: "Privacy Policy",
  updated: "Updated September 21, 2026",
  intro:
    "StreakApp is a Telegram mini app for tracking habits. This policy explains what data the app receives, why it needs it and how it is handled.",
  sections: [
    {
      heading: "What we receive",
      paragraphs: [
        "Telegram data: your user ID, username, first name and Telegram language. Telegram passes them to the app every time you open it. The app has no access to your phone number, contacts or messages.",
        "Data you enter: habits (name, schedule, reminder time, color), completion marks and settings — time zone, language, theme and Mark as Yesterday.",
      ],
    },
    {
      heading: "Why we need it",
      paragraphs: [
        "Only to run the app: to show your habits and streaks, work out “today” in your time zone and send reminders to your chat with the bot.",
        "We don’t show ads, don’t sell or share your data with third parties and don’t use it for profiling.",
      ],
    },
    {
      heading: "Where it is stored",
      paragraphs: [
        "On the app’s server. Every request is signed by Telegram: the server checks the signature and returns only your own data.",
        "Your language and theme are also remembered on your device, so the app opens looking right straight away.",
      ],
    },
    {
      heading: "Deleting your data",
      paragraphs: [
        "A deleted habit disappears from the app immediately, but its completion history stays on the server. To delete all of your data, contact the developer — the contact is in the bot’s description.",
      ],
    },
    {
      heading: "Changes to this policy",
      paragraphs: [
        "If this policy changes, the new version will appear on this page with a new update date.",
      ],
    },
  ],
};

const TERMS_EN: LegalDocument = {
  title: "Terms of Use",
  updated: "Updated September 21, 2026",
  intro: "By using StreakApp, you agree to these terms.",
  sections: [
    {
      heading: "The app",
      paragraphs: [
        "StreakApp helps you keep up your habits: mark them as done, follow your streaks and get reminders in Telegram. The app is free and runs inside Telegram.",
      ],
    },
    {
      heading: "Your account",
      paragraphs: [
        "You sign in with your Telegram account — there is no separate registration. You are responsible for what you add to the app. Don’t use it for anything unlawful and don’t try to disrupt it.",
      ],
    },
    {
      heading: "No warranty",
      paragraphs: [
        "The app is provided “as is”. We work to keep it running smoothly but don’t guarantee uninterrupted service, on-time reminders or that your data will be preserved.",
        "Don’t rely on StreakApp where a failure could cause harm — for example, for taking medication.",
      ],
    },
    {
      heading: "Changes",
      paragraphs: [
        "We may change the app and these terms, or stop running the app. The new version of the terms will appear on this page with a new update date.",
      ],
    },
    {
      heading: "Telegram",
      paragraphs: [
        "StreakApp is an independent app and is not affiliated with Telegram. Your use of Telegram itself is governed by Telegram’s own terms.",
      ],
    },
    {
      heading: "Contact",
      paragraphs: [
        "Questions about the app go to the developer — the contact is in the bot’s description.",
      ],
    },
  ],
};

export const LEGAL_RU = { privacy: PRIVACY_RU, terms: TERMS_RU };
export const LEGAL_EN = { privacy: PRIVACY_EN, terms: TERMS_EN };
