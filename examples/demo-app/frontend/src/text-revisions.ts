// D10 `Szövegváltozatok` (modules/text-revisions.json): the record command `demo.text-diff` ("Különbség") compares the
// selected revision with the one before it in the public TextDiff component (docs/toolkit.md#textdiff). Which revision
// came before is the project's own rule, answered by its read action `previous`; both texts are then read through
// `get`, so the server's ACL and field ACL decide what is compared.
import type { ApplicationModule, Row } from "@61ade/admin";

const textRevisions: ApplicationModule = app => {
  const t = (key: string, parameters?: Record<string, unknown>) => app.i18n.t(key, parameters);
  app.commands.register("demo.text-diff", {
    label: "Különbség",
    icon: "bi bi-file-diff",
    placement: "record",
    run: async ({ app, view, row, signal }) => {
      if (!row || !view.resource) return;
      const resource = view.resource;
      const { previous } = await app.server.call<{ previous: string | null }>(resource, "previous", { id: String(row.id), signal });
      if (!previous) { app.ui.toast(t("Ez a dokumentum első változata: nincs mivel összevetni.")); return; }
      const [before, after] = await Promise.all([previous, String(row.id)].map(id => app.server.call<Row>(resource, "get", { id, signal })));
      // A text the field ACL withholds is not an empty text: say so instead of comparing nothing.
      if (typeof before.body !== "string" || typeof after.body !== "string") throw new Error(t("A változat szövege nem olvasható."));
      const name = (revision: Row) => t("{number}. változat", { number: revision.sequence });
      const diff = new app.components.TextDiff({ before: before.body, after: after.body, beforeLabel: name(before), afterLabel: name(after) });
      // The window closes with the list (`signal`); the summary labels its title.
      const win = app.ui.window({ titlePrefix: t("Különbség") + ":", title: `${name(before)} → ${name(after)} (${diff.summary().label})`, width: 1200, height: 800, fit: false, signal });
      diff.mount(win);
      diff.focus();
    },
  });
};
export default textRevisions;
