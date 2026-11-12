// French UI copy (src/web/AGENTS.md). Wording from docs/specs/design.md.

/** design.md §1.5: « Deux Places », two words, two capitals; never « 2 Places » in text. */
export const appName = "Deux Places";

/**
 * design.md §7.4 (À propos) shows the application's « version ». The PWA and the API are deployed
 * together (technique-v2 §6.1) and share the version of package.json: the API's is the one shown.
 */
export const versionOf = (version: string) => `Version ${version}`;

// The development page « Tester une notification dans 1 min » (plan J1.14). No maquette: plain
// sentences, tutoiement (design.md), nothing beyond what the page must say.
export const testNotificationButton = "Tester une notification dans 1 min";
export const testNotificationScheduled =
  "Notification prévue dans 1 min. Tu peux fermer l'application.";
export const testNotificationFailed =
  "La notification n'a pas pu être programmée.";
export const pushUnsupported =
  "Ce navigateur ne permet pas les notifications de Deux Places.";
export const pushDenied =
  "Les notifications sont refusées pour Deux Places : autorise-les dans les réglages du navigateur.";

/** The body of the test notification the service worker shows; its title is `appName`. */
export const testNotificationBody = "Les notifications fonctionnent.";
