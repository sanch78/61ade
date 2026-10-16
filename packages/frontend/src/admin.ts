import { Sidebar } from "@dhtmlx/suite";
import "@dhtmlx/suite/codebase/suite.min.css";
import "./admin.css";

type Item = { id: string; label: string; description?: string };
type Group = Item & { items: Item[] };
const source = document.querySelector("#shell-data");
const container = document.querySelector<HTMLElement>("#navigation");
const workspace = document.querySelector<HTMLElement>("#workspace-content");
const breadcrumb = document.querySelector("#breadcrumb-label");

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text = "",
  css = "",
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.textContent = text;
  node.className = css;
  return node;
}

if (source && container && workspace && breadcrumb) {
  const { menu } = JSON.parse(source.textContent || "{}") as { menu: Group[] };
  const escape = (text: string) =>
    text.replace(
      /[&<>"']/g,
      (char) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[char]!,
    );
  const sidebar = new Sidebar(container, {
    width: "100%",
    navigationType: "click",
    data: [
      { id: "overview", value: "Áttekintés", type: "navItem" },
      ...menu.map((group) => ({
        id: group.id,
        value: escape(group.label),
        type: "navItem",
      })),
    ],
  });
  const select = (id: string, focus = false) => {
    const group = menu.find((item) => item.id === id);
    const leaf = menu
      .flatMap((group) => group.items)
      .find((item) => item.id === id);
    const owner = leaf
      ? menu.find((group) => group.items.includes(leaf))
      : group;
    sidebar.select(owner?.id || "overview", false);
    breadcrumb.textContent = leaf?.label || group?.label || "Áttekintés";
    workspace.replaceChildren();
    workspace.append(
      element("p", "ADMIN / V2", "eyebrow"),
      element("h1", leaf?.label || group?.label || "A munkád, egy helyen."),
    );
    if (leaf) {
      const empty = element("section", "", "empty-state");
      empty.append(
        element("span", "↗", "empty-icon"),
        element("span", "ELŐKÉSZÍTÉS ALATT", "version-label"),
        element("h2", "Itt épül az új munkafelület."),
        element(
          "p",
          "Ez a modul a következő fejlesztési lépésekben válik elérhetővé. Jelenleg a menü és a navigáció előnézetét látod.",
          "muted",
        ),
      );
      const back = element("button", "Vissza a modulokhoz", "secondary-button");
      back.onclick = () => navigate(owner?.id || "overview");
      empty.append(back);
      workspace.append(empty);
    } else {
      workspace.append(
        element(
          "p",
          group?.description ||
            "Válassz egy területet az új adminisztrációs felületen.",
          "workspace-lead",
        ),
      );
      const notice = element("div", "", "preview-notice");
      notice.append(
        element("span", "i", "notice-icon"),
        element(
          "p",
          "Fejlesztői előnézet. A menüpontok már bejárhatók, az üzleti funkciók még nem érhetők el.",
        ),
      );
      workspace.append(notice);
      const cards = element("div", "", "module-grid");
      for (const entry of group ? [group] : menu) {
        const card = element("section", "", "module-card");
        const header = element("div", "", "module-card-header");
        header.append(
          element(
            "span",
            String(menu.indexOf(entry) + 1).padStart(2, "0"),
            "module-number",
          ),
          element("span", "TERVEZETT", "module-status"),
        );
        card.append(
          header,
          element("h2", entry.label),
          element("p", entry.description || "", "muted"),
        );
        const list = element("ul");
        for (const item of entry.items) {
          const row = element("li");
          const button = element("button", item.label);
          button.append(element("span", "↗"));
          button.onclick = () => navigate(item.id);
          row.append(button);
          list.append(row);
        }
        card.append(list);
        cards.append(card);
      }
      workspace.append(cards);
      if (!menu.length)
        workspace.append(
          element(
            "p",
            "Ehhez a fiókhoz jelenleg nincs elérhető modulterület. Kérd az adminisztrátor segítségét.",
            "empty-state",
          ),
        );
    }
    if (focus) document.querySelector<HTMLElement>("#workspace")?.focus();
  };
  function navigate(id: string) {
    location.hash = encodeURIComponent(id);
  }
  const fromHash = (focus = false) => {
    let id = "overview";
    try {
      id = decodeURIComponent(location.hash.slice(1)) || id;
    } catch {
      /* Ignore malformed bookmarks. */
    }
    select(id, focus);
  };
  sidebar.events.on("click", (id: string | number) => navigate(String(id)));
  const onHash = () => fromHash(true);
  window.addEventListener("hashchange", onHash);
  window.addEventListener(
    "pagehide",
    () => {
      sidebar.destructor();
      window.removeEventListener("hashchange", onHash);
    },
    { once: true },
  );
  // A restored back/forward-cache page needs fresh identity/permission checks and widgets.
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) location.reload();
  });
  fromHash();
}
