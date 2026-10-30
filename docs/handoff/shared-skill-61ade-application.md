# Shared-library handoff: the `61ade-application` skill

## Összefoglaló

- Elkészült az FB-0084 skill (`61ade-application`): alkalmazásépítés a
  61ade-re; a beállítás a `61ade-consumer` skillben marad.
- A közös könyvtárba egy külön, azt a könyvtárat birtokló munkamenet teszi át.
- Átvétel előtt ki kell venni a 61ade-linkeket, FB/ADR-számokat,
  demóútvonalakat és fogyasztóneveket (szabályok lent).
- Döntendő: lehet-e közös skill tárgya egy konkrét könyvtár; ha nem, a
  fogyasztók a 61ade-checkoutból linkelik.

## Scope

This note is input for a session that owns the shared agent library. That
session decides on the publication and makes it. 61ade sessions treat the
library as read-only. The content was written in 61ade on 2026-10-30
([FB-0084](../feedback.md#fb-0084)); the 61ade copy stays the source until the
shared copy exists.

## What to publish

- **Source:** [`.agents/skills/61ade-application/SKILL.md`](../../.agents/skills/61ade-application/SKILL.md)
  and its `agents/openai.yaml`, as of the 61ade `main` commit that carries
  FB-0084. Take the latest commit that changes that directory.
- **Target:** `skills/61ade-application/SKILL.md` in the shared agent library,
  published through that library's own workflow. Consuming projects link it
  into `.agents/skills/` and `.claude/skills/` with the supported onboarding
  operation.
- **Switch-over in 61ade:** onboarding refuses name collisions. A 61ade
  session must therefore replace the local directory with the link to the
  shared copy in the same step (both discovery locations), and keep only the
  project facts in 61ade's own docs.
- **Not in scope:** `61ade-consumer` stays a 61ade project skill. It holds
  the operational checklist (links, deploy, autoloader, guarded tests,
  accounts, update smoke check). The new skill links to it by name.

## Rewrite rules for the shared copy

The shared library holds reusable rules only (shared main prompt, "Shared
content and ownership"). Rewrite the copy as follows:

1. **Locate the contracts generically.** Replace every relative link into
   61ade (`../../../docs/…`) with a document name and section heading,
   resolved against the 61ade checkout. Proposed opening paragraph:
   > The contracts live in the 61ade checkout that your project's `AGENTS.md`
   > declares. Without such a declaration, take the target of your committed
   > PHP package link, which points at `<checkout>/packages/php`. Each
   > reference below names a document under `<checkout>/docs/` and a section
   > heading in it, for example "toolkit reference, Module loading". Read that
   > section before acting; it wins over this skill.

   Section headings are more stable than anchors, and an agent can find them
   with a search.
2. **Drop project references and evidence:** feedback and ADR numbers, gate
   and migration labels (G1, M1–M23), and feature-demo paths and row names
   (D1–D4). Replace them with "the feature demo described in the demos guide".
   Also drop the names of individual consumers.
3. **Keep rules and name values by section.** Keep the rule ("a module
   initialization has a time limit; keep it short"). Leave the number to the
   named section (module loading, sandbox protocol, browser tests), so the
   shared copy does not drift when 61ade changes a limit. The local copy keeps
   only the 5 s module limit and the 128-task guard budget, because both
   shape decisions.
4. **Platform facts stay as they are.** These already appear in the shared
   main prompt: the guarded Playwright runner and the read-only rule for
   shared libraries.
5. **Name the companion skill without a path.** Write "the project's
   61ade consumer checklist (`61ade-consumer` in the 61ade checkout)" instead
   of the relative link.
6. **Keep the frontmatter.** Keep `name: 61ade-application`, and keep the
   description's "use when / do not use" split.

## Open decision for the library owner

The skill's subject is one shared library. If the shared library accepts
only library-neutral skills, use this fallback: keep the skill in 61ade, and
let consumers link `<checkout>/.agents/skills/61ade-application` directly.
One caveat applies. An agent that reads the file through such a link may
resolve its relative links against the consumer's tree. The skill therefore
tells the reader to open it at its path inside the 61ade checkout. Rule 1's
heading references avoid the problem in either placement.

## Validation done in 61ade

The skill was dry-run on 2026-10-30, by reading only, against three cases:
a fresh synthetic project, the [StoryBloX](storyblox.md) note and the
[allflow](allflow.md) note. Results are in [FB-0084](../feedback.md#fb-0084).
The `skill-creator` evals were not run, because 61ade has no eval
infrastructure. Run them after publication if the shared library has it.
