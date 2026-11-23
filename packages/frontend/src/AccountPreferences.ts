import { narrow } from "./Viewport";

/** Sends one patch as JSON text (`Server.ts` `savePreferences`): answers the HTTP status, rejects on a network failure. */
type Send = (values: string, keepalive: boolean) => Promise<number>;
type Part = [key: string, group: string, holds: (field: string) => boolean];
type Batch = { body: string; sent: [string, string | null][] };

const LEGACY = "blade-ui:1:", GUIDES = "blade-guide:2:", MIGRATED = "blade-prefs-migrated:1:", OWNER = "blade-theme-owner:";
const SIZES = new Set(["columns", "regions"]), TENANT = new Set(["filters", "tree"]);
/** The server's limits (`UserPreferences`), on ASCII JSON; the patch limit leaves room for the request envelope. */
const ENTRY_BYTES = 32768, PATCH_BYTES = 61440 - 128;
/** Automatic attempts per page after a failed save. */
const ATTEMPTS = 8;
const KEY = /^(?:@theme|@skin|(?!@|window:)[^\x00-\x1f\x7f|]{1,200}(?:\|(?:wide|narrow|t:[^\x00-\x1f\x7f|]{1,100}))?)$/u;
/** JSON text with non-ASCII escaped: the bytes the server stores and measures. */
const ascii = (text: string) => text.replace(/[\u0080-￿]/g, char => "\\u" + char.charCodeAt(0).toString(16).padStart(4, "0"));
const stored = (key: string): string | null => { try { return localStorage.getItem(key); } catch { return null; } };
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const pick = (state: Record<string, unknown>, holds: (field: string) => boolean) =>
  Object.fromEntries(Object.entries(state).filter(([field, value]) => field !== "__proto__" && holds(field) && value !== undefined));
const hidden = () => typeof document !== "undefined" && document.visibilityState === "hidden";
const refused = (status: number) => status === 400 || status === 413 || status === 422;
const saved = (status: number) => status >= 200 && status < 300;

/**
 * The signed-in user's settings document (docs/user-preferences-plan.md). Reads are synchronous from memory. A write
 * goes to memory at once and to the server after one second of quiet, one save at a time, and on page hide. For one
 * entry the last write wins; a change that never reached the server is lost when the page closes. Not configured (no
 * workspace, sign-in page, guest, no table) every call falls through to the browser value.
 */
class AccountPreferences {
  private entries?: Map<string, string>;
  /** Changed entries not known to be saved, with their newest text (null: removed). */
  private dirty = new Map<string, string | null>();
  private user = "";
  private path = "";
  private tenant: string | null = null;
  private tenancy = false;
  private generation = 0;
  private send?: Send;
  private migrated = false;
  private sending = false;
  private stopped = false;
  private failures = 0;
  /** At most this many entries per patch, after a refusal, until nothing is left to save. */
  private limit = Infinity;
  private inflight: Promise<unknown> = Promise.resolve();
  private timer?: ReturnType<typeof setTimeout>;

  get active(): boolean { return !!this.entries; }
  /** The user can reset the account's document, also one this release cannot read. */
  get resettable(): boolean { return !!this.send; }

  configure(options: { entries: Record<string, unknown>; generation?: number; unreadable?: boolean; user: string; tenant: string | null; tenancy?: boolean; send: Send }): void {
    // An unreadable document is neither served nor overwritten: the page stays browser-local until the user resets it.
    if (options.unreadable) { this.entries = undefined; this.dirty.clear(); this.user = options.user; this.send = options.send; this.stopped = this.migrated = true; return; }
    this.entries = new Map(Object.entries(options.entries).map(([key, value]) => [key, ascii(JSON.stringify(value))]));
    this.generation = options.generation ?? 0;
    this.user = options.user; this.tenant = options.tenant; this.tenancy = options.tenancy ?? options.tenant !== null;
    this.send = options.send; this.path = location.pathname;
    this.dirty.clear(); this.stopped = this.sending = false; this.failures = 0; this.limit = Infinity; this.inflight = Promise.resolve();
    // After a reset nothing is filled from this browser, even on a device that never migrated.
    this.migrated = this.generation > 0 || stored(this.marker(MIGRATED)) === "1";
    if (!this.migrated) void this.migrate();
    if (typeof addEventListener === "function") {
      addEventListener("online", () => this.resume());
      // Another tab's `app.preferences` write, which a project store read at once before the account store.
      addEventListener("storage", event => this.foreign(event.key, event.newValue));
      addEventListener("visibilitychange", () => { if (!hidden()) this.resume(); });
    }
  }

  private marker(prefix: string): string { return prefix + JSON.stringify([this.path, this.user]); }
  private accepts(key: string): boolean { return KEY.test(key); }
  private foreign(key: string | null, value: string | null): void {
    if (!this.entries || !key?.startsWith(LEGACY)) return;
    try {
      const [path, user, resource] = JSON.parse(key.slice(LEGACY.length));
      if (path !== this.path || user !== this.user || typeof resource !== "string" || !resource.startsWith("scope:") || !this.accepts(resource)) return;
      if (value !== null) JSON.parse(value);
      const text = value === null ? null : ascii(value);
      if (text === null) this.entries.delete(resource); else this.entries.set(resource, text);
      // The other tab's text already holds this tab's change, so an unsaved entry continues from it.
      if (this.dirty.has(resource)) this.dirty.set(resource, text);
    } catch {}
  }

  /** The account's value of $key; before this browser's values were migrated, a missing one comes from $fallback. */
  value<T>(key: string, fallback: () => T | undefined): T | undefined {
    if (!this.entries || !this.accepts(key)) return fallback();
    const text = this.entries.get(key);
    return text !== undefined ? JSON.parse(text) as T : this.migrated ? undefined : fallback();
  }

  /** Updates memory and marks the entry for the next save; undefined removes it. An oversized value stays in this page. */
  write(key: string, value: unknown): void {
    if (!this.entries || !this.accepts(key)) return;
    const text = value === undefined ? null : ascii(JSON.stringify(value));
    if ((this.entries.get(key) ?? null) === text) return;
    if (text === null) this.entries.delete(key); else this.entries.set(key, text);
    if (this.stopped) return;
    if (text !== null && text.length > ENTRY_BYTES) {
      console.warn(`61ade: preference "${key}" exceeds 32 KiB and is not saved.`);
      this.dirty.delete(key);
      return;
    }
    this.dirty.set(key, text); this.schedule(1000);
  }

  /**
   * The theme or skin to apply: the account's, mirrored for the sign-in page, else the browser's value unless it
   * belongs to another account (or to this one after its entry was removed).
   */
  theme(key: "@theme" | "@skin", name: string): string | undefined {
    const local = stored(name) ?? undefined;
    if (!this.entries) return local;
    const text = this.entries.get(key);
    if (text !== undefined) {
      const value = JSON.parse(text);
      if (typeof value !== "string") return undefined;
      this.ownTheme(name, value, this.user);
      return value;
    }
    const owner = stored(OWNER + name);
    return !owner || (owner === this.user && !this.migrated) ? local : undefined;
  }
  /** Stores the user's choice in the mirror with its owner (none on a page without an account) and in the account. */
  chooseTheme(key: "@theme" | "@skin", name: string, value: string): void {
    this.ownTheme(name, value, this.entries ? this.user : "");
    this.write(key, value);
  }
  private ownTheme(name: string, value: string, owner: string): void {
    try { localStorage.setItem(name, value); localStorage.setItem(OWNER + name, owner); } catch {}
  }

  /** The entries of a `UiPreferences` resource: shared, per device class, and per tenant while one is active. */
  private parts(resource: string): Part[] {
    const tenant = this.tenant === null ? undefined : `${resource}|t:${this.tenant}`;
    return [[resource, "shared", field => !SIZES.has(field) && !(tenant && TENANT.has(field))],
      [`${resource}|${narrow() ? "narrow" : "wide"}`, "sizes", field => SIZES.has(field)],
      ...(tenant ? [[tenant, "tenant", (field: string) => TENANT.has(field)] as Part] : [])];
  }
  private managed(user: string, resource: string): boolean { return !!this.entries && user === this.user && this.accepts(resource); }
  /** Old browser entries carry no tenant, so with tenancy their filter values and tree ids are never used. */
  private legacyField(field: string): boolean { return !this.tenancy || !TENANT.has(field); }

  /**
   * The state of $resource from its entries (a part not migrated yet from $local); $synced remembers each part's text
   * and the device class of the sizes.
   */
  compose(user: string, resource: string, local: Record<string, unknown>, synced: Record<string, string>): Record<string, unknown> {
    if (!this.managed(user, resource)) return local;
    const state: Record<string, unknown> = {};
    for (const [key, group, holds] of this.parts(resource)) {
      const value = this.value<unknown>(key, () => pick(local, field => holds(field) && this.legacyField(field)));
      const part = object(value) ? pick(value, holds) : {};
      Object.assign(state, part); synced[group] = JSON.stringify(part);
    }
    synced.device = narrow() ? "narrow" : "wide";
    return state;
  }

  /** Before a size changes: a state whose sizes came from the other device class takes the current class's sizes. */
  sizes(user: string, resource: string, state: Record<string, unknown>, synced: Record<string, string>): void {
    const device = narrow() ? "narrow" : "wide";
    if (!this.managed(user, resource) || synced.device === device) return;
    const value = this.value<unknown>(`${resource}|${device}`, () => undefined), part = object(value) ? pick(value, field => SIZES.has(field)) : {};
    for (const field of SIZES) delete state[field];
    Object.assign(state, part);
    synced.sizes = JSON.stringify(part); synced.device = device;
  }

  /** Writes the parts of $state that changed, so a size kept for one device class never moves to the other. */
  store(user: string, resource: string, state: Record<string, unknown>, synced: Record<string, string>): void {
    if (!this.managed(user, resource)) return;
    for (const [key, group, holds] of this.parts(resource)) {
      const part = pick(state, holds), text = JSON.stringify(part);
      if (synced[group] === text || (group === "sizes" && synced.device !== (narrow() ? "narrow" : "wide"))) continue;
      synced[group] = text; this.write(key, Object.keys(part).length ? part : undefined);
    }
  }

  private schedule(delay: number): void { clearTimeout(this.timer); this.timer = setTimeout(() => this.flush(), delay); }
  /** A visible, online page takes up what automatic retries left, within the attempts of this page. */
  private resume(): void { if (!this.stopped && this.failures < ATTEMPTS && this.dirty.size) this.schedule(1000); }
  private track<T>(request: Promise<T>): Promise<T> { this.inflight = Promise.allSettled([this.inflight, request]); return request; }
  /** Another generation answered: a reset happened, so this page saves nothing more. */
  private superseded(): void { this.stopped = true; this.migrated = true; this.dirty.clear(); clearTimeout(this.timer); }

  /** The next patch of $source within the request limit. */
  private batch(source: Map<string, string | null>, fill = false, limit = Infinity): Batch | undefined {
    const set: string[] = [], remove: string[] = [], sent: [string, string | null][] = [];
    let size = 64;
    for (const [key, text] of source) {
      if (sent.length >= limit) break;
      const name = ascii(JSON.stringify(key)), entry = text === null ? name : name + ":" + text;
      if (size + entry.length + 1 > PATCH_BYTES) break;
      size += entry.length + 1; (text === null ? remove : set).push(entry); sent.push([key, text]);
    }
    if (!sent.length) return undefined;
    const body = [`"generation":${this.generation}`, set.length ? `"set":{${set.join(",")}}` : "", remove.length ? `"remove":[${remove.join(",")}]` : "", fill ? `"fill":true` : ""].filter(Boolean).join(",");
    return { body: `{${body}}`, sent };
  }

  /** One save at a time: a refused patch is split until its bad entry is dropped; a failed one is retried in this page. */
  private flush(): void {
    clearTimeout(this.timer);
    if (!this.send || this.stopped || this.sending) return;
    const batch = this.batch(this.dirty, false, this.limit);
    if (!batch) return;
    this.sending = true;
    const done = (status: number) => {
      this.sending = false;
      if (this.stopped) return;
      if (status === 409) return this.superseded();
      if (status === 401 || status === 403) { this.stopped = true; return; }
      if (saved(status)) {
        this.failures = 0;
        this.settle(batch);
        if (!this.dirty.size) this.limit = Infinity;
      } else if (refused(status)) {
        if (batch.sent.length > 1) this.limit = Math.ceil(batch.sent.length / 2);
        else { console.warn(`61ade: the server refused preference "${batch.sent[0][0]}".`); this.settle(batch); }
      } else {
        if (++this.failures < ATTEMPTS && !hidden()) this.schedule(Math.min(30000, 1000 * 2 ** this.failures));
        return;
      }
      if (this.dirty.size) this.schedule(1000);
    };
    this.track(this.send(batch.body, false)).then(done, () => done(0));
  }

  /** A sent entry is clean only while it still holds the sent text. */
  private settle(batch: Batch): void {
    for (const [key, text] of batch.sent) if (this.dirty.get(key) === text) this.dirty.delete(key);
  }

  /** The page is leaving: in-flight and queued entries go out with their newest values in a request that outlives it. */
  leave(): void {
    clearTimeout(this.timer);
    if (!this.send || this.stopped) return;
    const batch = this.batch(this.dirty, false, this.limit);
    if (batch) this.track(this.send(batch.body, true)).catch(() => {});
  }

  /** This user's browser values of this path, as entries the document does not have. */
  private legacy(): Map<string, string> {
    const out = new Map<string, string>();
    const add = (key: string, value: unknown) => {
      if (!this.accepts(key) || this.entries!.has(key) || value === undefined) return;
      const text = ascii(JSON.stringify(value));
      if (text.length <= ENTRY_BYTES) out.set(key, text);
    };
    try {
      for (let index = 0; index < localStorage.length; index++) {
        const name = localStorage.key(index);
        if (!name) continue;
        try {
          if (name.startsWith(GUIDES)) {
            const [path, user, view] = JSON.parse(name.slice(GUIDES.length));
            if (path === this.path && user === this.user && localStorage.getItem(name) === "1") add("guide:" + view, 1);
          } else if (name.startsWith(LEGACY)) {
            const [path, user, resource] = JSON.parse(name.slice(LEGACY.length));
            if (path !== this.path || user !== this.user || typeof resource !== "string" || !this.accepts(resource)) continue;
            const state = JSON.parse(localStorage.getItem(name) ?? "null");
            if (!object(state)) continue;
            if (resource.startsWith("scope:")) add(resource, state);
            else for (const [key, , holds] of this.parts(resource)) {
              const part = pick(state, field => holds(field) && this.legacyField(field));
              if (Object.keys(part).length) add(key, part);
            }
          }
        } catch {}
      }
      // Only a theme this user chose: a shared browser may hold another account's or a guest's.
      for (const [key, name] of [["@theme", "blade-theme"], ["@skin", "blade-skin"]]) {
        const value = localStorage.getItem(name);
        if (value && localStorage.getItem(OWNER + name) === this.user && /^[a-z][a-z0-9-]{0,39}$/.test(value)) add(key, value);
      }
    } catch {}
    return out;
  }

  /** Fill-only upload of this browser's values, once per user and path; the marker is set when each is resolved. */
  private async migrate(): Promise<void> {
    const legacy = this.legacy() as Map<string, string | null>;
    let limit = Infinity;
    for (let batch = this.batch(legacy, true); batch; batch = this.batch(legacy, true, limit)) {
      if (this.stopped) return;
      let status: number;
      try { status = await this.track(this.send!(batch.body, false)); } catch { return; }
      if (this.stopped) return;
      if (status === 409) return this.superseded();
      if (saved(status)) {
        for (const [key, text] of batch.sent) { legacy.delete(key); if (text !== null && !this.entries!.has(key)) this.entries!.set(key, text); }
      } else if (refused(status)) {
        if (batch.sent.length > 1) limit = Math.ceil(batch.sent.length / 2);
        else { console.warn(`61ade: the server refused preference "${batch.sent[0][0]}".`); legacy.delete(batch.sent[0][0]); }
      } else return;
    }
    if (this.stopped) return;
    this.migrated = true;
    try { localStorage.setItem(this.marker(MIGRATED), "1"); } catch {}
  }

  /** Empties the account's document after what is in flight, then this browser's copies. Upload resume stays. */
  async reset(): Promise<void> {
    if (!this.send) return;
    clearTimeout(this.timer); this.stopped = true;
    await this.inflight;
    let status = 0;
    try { status = await this.send('{"reset":true}', false); } catch {}
    if (!saved(status)) { this.stopped = false; if (this.dirty.size) this.schedule(1000); throw new Error("reset failed"); }
    this.dirty.clear();
    try {
      const names: string[] = [];
      for (let index = 0; index < localStorage.length; index++) names.push(localStorage.key(index) ?? "");
      for (const name of names) {
        const prefix = [LEGACY, GUIDES].find(item => name.startsWith(item));
        if (!prefix) continue;
        try { if (JSON.parse(name.slice(prefix.length))[1] === this.user) localStorage.removeItem(name); } catch {}
      }
      for (const name of ["blade-theme", "blade-skin", OWNER + "blade-theme", OWNER + "blade-skin"]) localStorage.removeItem(name);
    } catch {}
  }
}

/** The page's one account store, configured by the shell from the bootstrap. */
export const account = new AccountPreferences();
