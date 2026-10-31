// D2 Signage Napi műsor (docs/demos.md#toolkit-d2-playlist): the view kind `demo.playlist-preview`, a preview of one
// day's `signage_playlist.day` answer. The panels are the view's (`options.layout`, app.components.PageLayout): the
// 61ade CommandBar steps the day and opens `Naptár…`, a framework window with the `day` action's own RecordForm; the
// demo's shared player (player.ts) plays the day item by item. The request and its JSON answer are the calendar's
// `Napi műsor (API)` (docs/calendar.md). `signage.php` declares the view. Types only from 61ade; the rest is `app`.
import type { Application, ApplicationModule, CommandBar, PageRegion, ViewDefinition, ViewHost, ViewInstance } from "@61ade/admin";
import { Player, type PlayerItem, type PlayerKind } from "./player";

/** `options` of the `demo.playlist-preview` view (signage.php): the file resource whose `content_stream` plays media, the panels. */
type PreviewOptions = { media?: string; layout?: PageRegion };

/** One timeline entry of the `signage_playlist.day` answer (signage.php blade_demo_signage_playlist). */
interface Asset { id: string; title: string; kind: string; duration: number; file: { id: string; name: string; mime_type: string } | null;
  transition?: { type?: unknown; ms?: unknown } }
/** A scheduled playlist: its playable items in order, each played for its own play time and transition. */
interface Playlist { id: string; title: string; duration: number; items: Asset[] }
interface Slot { start: string; end: string; source: string; title: string | null; asset: Asset | null; playlist?: Playlist | null }
interface DayAnswer { date: string; weekday_name?: string; timeline: Slot[] }

const KIND = "demo.playlist-preview";
/** Seconds an entry without content (`source: none`) takes in the preview. */
const GAP = 3;
const LONGEST = 3600;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const pad = (value: number) => String(value).padStart(2, "0");
/** The browser's local date, the default day. */
function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
/** A real calendar date `YYYY-MM-DD`, else undefined. */
function calendarDate(value: unknown): string | undefined {
  if (typeof value !== "string" || !DATE.test(value)) return undefined;
  const date = new Date(value + "T00:00:00Z");
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : undefined;
}
function shift(date: string, days: number): string {
  const next = new Date(date + "T00:00:00Z");
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

/**
 * The day as the player plays it: every timeline entry once, an asset for its play time (1–3600 s), a playlist as one
 * round of its assets (each for its own play time, with its transition), an empty entry for GAP seconds.
 */
function itemsOf(answer: DayAnswer, kinds: Record<PlayerKind, string>): PlayerItem[] {
  const slots = Array.isArray(answer?.timeline) ? answer.timeline : [];
  return slots.flatMap((slot, slotIndex) => {
    const playlist = slot && typeof slot.playlist === "object" && slot.playlist !== null && Array.isArray(slot.playlist.items) && slot.playlist.items.length ? slot.playlist : null;
    const entries = playlist ? playlist.items.map(asset => ({ asset: typeof asset === "object" && asset !== null ? asset : null, list: String(playlist.title ?? "") }))
      : [{ asset: slot && typeof slot.asset === "object" && slot.asset !== null ? slot.asset : null, list: undefined }];
    return entries.map(({ asset, list }, index): PlayerItem => {
      const mime = typeof asset?.file?.mime_type === "string" ? asset.file.mime_type : "";
      const kind: PlayerKind = !asset ? "none"
        : asset.kind === "scene" ? "scene"
        : (asset.kind === "image" || asset.kind === "video" || asset.kind === "audio") && mime.startsWith(asset.kind + "/") && typeof asset.file?.id === "string" ? asset.kind
        : "other";
      const transition = asset?.transition && typeof asset.transition.type === "string" ? { type: asset.transition.type, ms: Number(asset.transition.ms) || 0 } : undefined;
      return { key: `${slotIndex}.${index}`, kind, title: String((list !== undefined ? asset?.title : slot?.title) ?? asset?.title ?? "") || kinds[kind],
        seconds: asset ? Math.min(LONGEST, Math.max(1, Math.round(Number(asset.duration) || 0))) : GAP,
        file: asset?.file && kind !== "scene" ? { id: asset.file.id, mime_type: asset.file.mime_type } : null, asset: asset?.id,
        ...(transition ? { transition } : {}), time: `${slot.start}–${slot.end}`, meta: kinds[kind], ...(list !== undefined ? { list } : {}) };
    });
  });
}

/**
 * One opening of the preview. The day comes from `filter.date` of the address or is today; stepping the day or picking
 * it in `Naptár…` asks for it again and the player starts it at 0, paused. Everything is released with the host:
 * the components first, the page layout last.
 */
function preview(app: Application, host: ViewHost, view: ViewDefinition<PreviewOptions>): ViewInstance {
  const t = (key: string, params?: Record<string, unknown>) => app.i18n.t(key, params);
  if (!view.actions.some(action => action.name === "day")) throw new Error(t("A napi műsor nem kérhető le."));
  if (!view.options?.layout) throw new Error(t("A nézet elrendezése hiányzik."));
  const kinds: Record<PlayerKind, string> = { image: t("Kép"), video: t("Videó"), audio: t("Hang"), scene: t("Jelenet"), none: t("Nincs tartalom"), other: t("Egyéb tartalom") };
  const controller = new AbortController(), signal = controller.signal;
  host.signal.addEventListener("abort", () => controller.abort(), { once: true });
  let day = calendarDate(host.filters.date) ?? today(), asking: AbortController | undefined;

  const page = new app.components.PageLayout({ id: view.id, tree: view.options.layout });
  host.attach(page);
  const bar: CommandBar = new app.components.CommandBar({ signal, items: [
    { id: "previous-day", label: t("Előző nap"), icon: "dxi dxi-arrow-left" },
    { id: "day", label: day, disabled: true },
    { id: "next-day", label: t("Következő nap"), icon: "dxi dxi-arrow-right" },
    { id: "today", label: t("Ma"), icon: "dxi dxi-calendar-today" },
    { id: "pick", label: t("Naptár…"), icon: "dxi dxi-calendar-today" },
  ] });
  bar.mount(page.cell("commands"));
  const player = new Player({ app, signal, files: typeof view.options.media === "string" && view.options.media ? view.options.media : "files",
    scenes: view.actions.some(action => action.name === "scene"),
    caption: item => [item.time, item.list !== undefined ? t("Lejátszási lista: {title}", { title: item.list }) : "", item.title, item.meta].filter(Boolean).join(" · ") });
  page.attach("player", player.element);

  /** Shows a day's answer: the commands name the day, the player starts it paused. */
  const shown = (answer: DayAnswer) => {
    const label = `${day}${typeof answer?.weekday_name === "string" ? ` · ${answer.weekday_name}` : ""}`;
    bar.update("day", { label });
    host.setTitle(`${view.title}: ${label}`);
    player.show(itemsOf(answer, kinds));
  };
  /** Asks for `date` through the `day` action (a newer question wins). */
  const choose = async (date: string) => {
    day = date;
    asking?.abort();
    const request = asking = new AbortController();
    signal.addEventListener("abort", () => request.abort(), { once: true, signal: request.signal });
    bar.update("day", { label: day });
    player.wait(t("Betöltés…"));
    try {
      const answer = await app.server.call<DayAnswer>(view.resource!, "day", { values: { date: day }, signal: request.signal });
      if (!request.signal.aborted) shown(answer);
    } catch (error) {
      if (request.signal.aborted || (error as Error)?.name === "AbortError") return;
      player.wait(error instanceof Error ? error.message : String(error));
    }
  };
  /** `Naptár…`: the `day` action's form in a framework window; its answer is the day to show. */
  const pick = () => {
    const win = app.ui.window({ title: t("Nap választása"), width: 360, signal });
    const form = new app.components.RecordForm({ resource: view.resource!, action: "day", values: { date: day }, signal: win.signal });
    form.on("saved", ({ result }) => {
      const answer = result as DayAnswer, date = calendarDate(answer?.date);
      win.close();
      if (!date) return;
      asking?.abort();
      day = date;
      shown(answer);
    });
    form.on("cancelled", () => win.close());
    form.mount(win);
  };
  bar.on("click", ({ id }) => {
    if (id === "previous-day" || id === "next-day") void choose(shift(day, id === "next-day" ? 1 : -1));
    else if (id === "today") void choose(today());
    else if (id === "pick") pick();
  }, { signal });
  // The page layout goes after the components in its regions (registered last).
  signal.addEventListener("abort", () => page.destroy(), { once: true });
  void choose(day);
  return { destroy: () => controller.abort() };
}

const playlist: ApplicationModule = app => {
  app.kinds.register(KIND, { create: (host, view: ViewDefinition<PreviewOptions>) => preview(app, host, view) });
};
export default playlist;
