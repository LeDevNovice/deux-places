// French UI copy (src/web/AGENTS.md). Wording from docs/specs/design.md.

/** design.md §1.5: « Deux Places », two words, two capitals; never « 2 Places » in text. */
export const appName = "Deux Places";

/**
 * design.md §7.4 (À propos) shows the application's « version ». The PWA and the API are deployed
 * together (technique-v2 §6.1) and share the version of package.json: the API's is the one shown.
 */
export const versionOf = (version: string) => `Version ${version}`;
