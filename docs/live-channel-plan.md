# Live channel: implementation plan

Status: approved plan, 2026-10-29 (D1–D4 decided as proposed). L0
implemented and verified on the demo. L1 and L2 run as one batch (protocol and
browser ship together, so the demo never runs mismatched halves). L1–L6 not
implemented. Owner request and decisions: [FB-0075](feedback.md#fb-0075).
Current behavior: [live data](workspaces.md#élő-adat-konfigurálása-és-futtatása),
[demo unit](demos.md#websocket-live-data).

## 1. Purpose and scope

Replace the per-list live transport with the established model: **one live
channel per signed-in browser tab**. It opens after sign-in and stays open.
Every list on the page, including sub-view previews, subscribes and
unsubscribes over that channel. Changes reach the server's watchers as **events
from the framework's write path**, not as a fixed-interval re-query per
socket.

In scope: the browser channel, the WebSocket protocol, the live server and the
bridge, change notification from the executor, external writes, the session
lifecycle, the polling transport kept as a configured mode, demo, tests and
docs.

Out of scope: one socket shared by several tabs (`SharedWorker`; see
[decision D1](#6-owner-decisions)), live updates for calendars, file manager
and diagrams (they reload on navigation today), cross-host fan-out, and a
message broker.

## 2. Starting state (source inventory, 2026-10-29)

- **Client:** every `Workspace` creates its own `Realtime`
  (`packages/frontend/src/Workspace.ts:187`), and each `Realtime` owns one
  WebSocket with one subscription (`Realtime.ts`). A sub-view preview is a
  further `Workspace` with its own socket (`Workspace.ts:272`). Navigation
  destroys the view and its socket (`AdminShell.ts:273`). A hidden tab closes
  the socket and reopens it on return.
- **Per-socket server polling:** `tools/live-server.mjs` runs `tick()` every
  `BLADE_LIVE_INTERVAL` (2 s) for each connection. Each tick is one bridge
  request that re-runs the list query (`Workspace::observe`) and hashes the
  window. Unchanged ticks send nothing, but they always query.
- **Bridge:** one long-running PHP process (`packages/php/bin/live-bridge.php`)
  serializes every observation of every connection and application. Since
  [FB-0074](feedback.md#fb-0074) it serves several application files by path.
- **Limits:** at most 100 connections per server across all applications. One
  subscription per connection. A 4403 on one subscription closes the whole
  socket.
- **Auth:** a single-use ticket from `__ticket`, valid for 1 h and bound to the
  session and tenant (`Live/Tickets.php`). Every observation rechecks the
  session, idle timeout (30 min since the last HTTP request), credential
  version, login security, tenant membership and ACL.
- **Writes:** every UI/API write goes through `Executor::execute` / `bulk` /
  `edit` and commits there (`Feature/Executor.php`). External writes (CLI,
  other systems) bypass it. Writes can change other resources' lists through
  computed columns, related fields, `afterSave` hooks, ACL tables and tenant
  membership, so exact per-resource dependency tracking is not available.
- **Operations:** the demo unit is Infra-managed. Every change to the bridge,
  the server or loaded PHP needs `sudo systemctl restart` by the owner
  (FB-0068, FB-0073, FB-0074). Browser tests run only against this checkout
  and take a global lock.
- **Polling transport:** each list sends its own `__watch` request per
  interval.

## 3. Target design

### Browser

- `AdminShell` owns one `LiveChannel` per page, opened once the user is signed
  in and closed on sign-out, tenant switch (the shell reloads anyway) and page
  unload.
- A list obtains a `Subscription` handle from the channel (`subscribe(resource,
  query) → handle`; `handle.update(query)`, `handle.close()`). The existing
  `Realtime` callbacks (`update`, `state`, `denied`) remain the list-facing
  contract, so `Workspace` changes stay small.
- Reconnect, backoff, heartbeat and re-subscription after reconnect live in the
  channel once, not in each list. A hidden tab pauses its subscriptions
  without closing the channel. Whether to close it after a grace period is a
  tuning item in L5.
- Polling mode uses the same handles: one batched `__watch` request per
  interval carries every subscription of the tab.

### Protocol (WebSocket, JSON text frames)

| Direction | Message | Meaning |
| --- | --- | --- |
| C→S | `hello {protocol, ticket}` | First frame; authenticates the connection. |
| S→C | `ready {protocol}` | Authenticated; subscriptions may follow. |
| C→S | `subscribe {id, resource, query}` | Opens or replaces subscription `id`. |
| C→S | `unsubscribe {id}` | Ends it. |
| S→C | `update {id, version, order, upserts, removed, previous, next, total, matched}` | As today, per subscription. |
| S→C | `denied {id, status, error}` | This subscription only; the channel stays open. |
| close | 4401 | Session gone or expired: the shell shows the sign-in state. |
| close | 4409 | Protocol mismatch (stale page after an update): the client reloads once. |

Limits per connection (for example 64 subscriptions) and per server are
enforced with explicit errors, not silent drops.

### Server

- The live server keeps a per-connection subscription map. The bridge takes
  `{application path, ticket/session, subscription}` per request, unchanged in
  principle.
- **Change log:** after commit, the executor appends one hint
  `{seq, resource, tenant}` to `<runtime>/live/changes`. The file is
  append-only, rotated by size, and written under the runtime the web pool
  already writes. The live server watches each served application's change log
  (`fs.watch` plus a cheap stat fallback). It re-evaluates that application's
  subscriptions in coalesced batches (about 100 ms), with subscriptions to the
  written resource first. The version hash still suppresses unchanged results.
  This is correct without a dependency graph, and fast because work happens
  only when something was written.
- **External writes:** a per-application **sweep** re-evaluates subscriptions
  at a slow, configurable interval (`LiveConfig::$sweep`, default proposed
  15 s, `0` disables it). External writers that use the framework autoloader
  can call `Blade\Live\Changes::record($runtime, $resource)` for an immediate
  update.
- **Deduplication:** identical `(application, actor, tenant, resource, query)`
  subscriptions share one evaluation. Results stay per actor because the ACL is
  per actor.
- **Session lifecycle:** every evaluation rechecks the session, as today.
  Additionally, each connection's session is rechecked on a timer (for example
  60 s), so an idle channel still closes with 4401 after sign-out or expiry.
  Live traffic does not extend the session idle timeout
  ([decision D3](#6-owner-decisions)).

### Self-reload (no restart per code change)

The bridge records the mtimes of its included files and exits with a reserved
code when one changes. The live server respawns the bridge instead of exiting.
When the server's own bundle changes, it closes connections with 1012
(service restart) and exits non-zero, so the supervisor (systemd
`Restart=on-failure`, deploy-jobs service mode) starts the new bundle. Clients
reconnect with backoff. This removes the owner `sudo` step after framework
changes ([decision D2](#6-owner-decisions)).

## 4. Phases

Order is dependency. Each phase ends with its checks, usage docs, demo state
and a feedback update, per the
[development rules](development.md#mandatory-framework-development-rules).

### L0 — Self-reload of bridge and server

- Bridge: included-file mtime check per loop, exit code 75 on change. Server:
  respawn on 75 and exit 1 on any other bridge exit. Bundle mtime watch with
  1012 close and exit.
- Checks: a local server/bridge run in the scratchpad (touch a PHP file →
  respawn, no dropped process); build `--check`; on the demo, edit
  `common.php` and observe the reload in the journal without `sudo`.
- After L0 is deployed with one last owner restart, later phases need none.

### L1 — Multiplexed protocol in server and bridge

- `hello`/`ready`, a subscription map, `subscribe`/`unsubscribe`, per-
  subscription `denied`, connection and subscription limits, and the protocol
  version with 4409. The interval tick stays for now, per subscription.
- Checks: a PHP/Node protocol test in `tests/shell` with a local server against
  a scratch demo instance (auth, two subscriptions, denial of one, unsubscribe,
  limits, mismatch).

### L2 — Browser channel

- `LiveChannel` owned by `AdminShell`; the `Realtime` API becomes a
  subscription handle; `Workspace` and sub-view previews use the shell's
  channel. Batched `__watch` for polling (server: `__watch` accepts a list of
  subscriptions, each answered separately).
- Checks: typecheck, build, `workspace.spec.cjs` extended so the page holds
  exactly one `/live` socket while switching three views and expanding two
  sub-view rows; polling run with one `__watch` request per interval;
  `subview.spec.cjs`, `subview-demos.spec.cjs`, `tenancy.spec.cjs`,
  `list-integration.spec.cjs`.

### L3 — Change log and event-driven evaluation

- `Blade\Live\Changes` (append, rotate, read since `seq`); executor hook after
  commit (execute, bulk, edit, uploads); server watcher, coalescing and
  resource-first ordering; the 2 s tick replaced by the sweep.
- Checks: `lists.php` / new `live.php` (hint written once per committed write,
  none on rollback, tenant recorded); browser: a write in tab A appears in tab B
  within 1 s (UI write), and an external CLI write appears within the sweep
  interval or immediately via `Changes::record`.

### L4 — Deduplication and bridge capacity

- Shared evaluations for identical subscriptions; a measured decision whether
  the single bridge needs a small pool (`BLADE_LIVE_WORKERS`, default 1).
- Checks: a reproducible load script in `tools/` (N connections × M
  subscriptions, writes per second → bridge requests, latency). The numbers
  are recorded in the feedback entry; a planned measurement is not a passed
  check.

### L5 — Session lifecycle and hidden tabs

- Periodic session recheck per connection; sign-out closes the channel; tenant
  switch; hidden-tab pause and resume; a 4401 shows the existing session-ended
  state once, without reconnect loops.
- Checks: browser: sign out in tab A → tab B channel closes 4401; tenant
  switch; account disabled in the admin → 4401 within the recheck interval.

### L6 — Documentation and consumer contract

- Rewrite the live section in `workspaces.md`, `development.md` (service,
  self-reload, limits), `configuration.md` (`sweep`), `demos.md`,
  `security-model.md` (channel auth, change log contents: no row data),
  `usage.md`; remove superseded statements. Mark the breaking protocol change
  in [breaking changes](development.md#breaking-changes) (dist and server bundle
  ship together; 4409 covers stale pages).

## 5. Execution with agents

- **Sequential phases, one checkout.** Only this checkout is served at
  https://61ade.sanch.hu/ and browser tests take a global lock, so phases run
  one after another in the canonical checkout. Worktrees would miss the
  owner's uncommitted work and cannot be browser-tested.
- **Per phase:** one implementation agent gets the phase section, the files
  involved and its checks. It reports changed files and check output. Then one
  independent review agent reads the diff without the implementer's
  conclusions and looks for correctness and security defects (auth bypass,
  cross-application or cross-tenant leaks, reconnect storms, resource limits).
  The lead (main session) fixes or rejects the findings, runs the focused
  checks itself, updates FB-0075 and asks the owner before a commit.
- **Owner touchpoints:** approval of this plan and the decisions below; one
  unit restart after L0; acceptance after L2 (single socket visible in
  DevTools) and after L3 (cross-tab update speed).

## 6. Owner decisions

Decided 2026-10-29: every proposed option below (per-tab channel, bridge and
server self-reload, no session extension, 15 s sweep).

- **D1 — Scope of one channel:** per browser tab (proposed; standard practice,
  no `SharedWorker`), or one shared channel per browser session across tabs (a
  later, separate phase).
- **D2 — Self-reload (L0):** the server exits for a supervisor restart when its
  own bundle changes (proposed), or bridge respawn only, with the owner
  restarting for server bundle changes.
- **D3 — Session idle timeout:** live traffic does not extend the 30-minute
  idle timeout (proposed, unchanged security behavior), or an open channel
  counts as activity.
- **D4 — Sweep default:** 15 s (proposed) for external writes; the
  2 s responsiveness for UI writes comes from the change log.

## 7. Risks

- **Stale pages after a deploy** speak the old protocol: 4409 plus one reload;
  verified in L1/L2.
- **Change-log growth and permissions:** size rotation; the file contains no
  row data (resource name, tenant id, sequence only); written by the web pool
  and read by the service under the same identity.
- **Coarse invalidation** costs a re-evaluation of an application's
  subscriptions per write burst. Coalescing and deduplication bound it; L4
  measures it before any finer dependency tracking is considered.
- **Single bridge** remains a serialization point; L4 decides on a pool with
  numbers.
