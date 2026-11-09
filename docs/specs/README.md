# Spécifications (lecture seule pour l'agent)

| Fichier | Contenu | Fait foi pour |
| --- | --- | --- |
| `produit.md` | Spécification de l'outil : règles RG, parcours, écrans, moteur, critères d'acceptation | Le comportement. Ses sections 6 (données), 7 (API) et 9 (stack) sont remplacées par `technique-v2.md` |
| `design.md` | Nom, identité, palette, typographie, composants, spécification écran par écran | L'apparence et les libellés |
| `maquettes.pdf` | 43 planches des écrans dans leurs états | L'apparence ; à comparer aux captures |
| `technique-v2.md` | Architecture Effect 4 + Cloudflare, coût zéro, registre ADR | L'implémentation |

Le plan se trouve dans `docs/plan/` (`plan.json` pour l'agent, `commits.md` pour l'humain).
Exportés des documents Claude le 9 novembre 2026 ; les liens `claude.ai` qu'ils contiennent ne
sont pas accessibles à l'agent et ne sont pas nécessaires. Toute modification passe par l'humain.
