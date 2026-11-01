/**
 * The trademark loading screen (docs/brand.md#splash) that the shell template renders: once the shell is built and the
 * screen's own animation has played (glint included; the idle glint loops and is not awaited), the black screen fades
 * into the application and leaves the page. It plays in full once per browser window or tab; on later pages the head gate
 * has hidden it (`data-blade-splash="seen"`) and it is only removed. There is no option to skip or shorten it.
 */
let left: () => void = () => {};
const leaving = new Promise<void>(resolve => { left = resolve; });

/**
 * Resolves once the screen has left the page, at once where there is none: what must not open under or over it (the
 * OAuth-only overlay) waits for this. On a page where the head gate hid it, that is the release right after the shell.
 */
export function splashLeft(): Promise<void> {
  return document.querySelector("#blade-splash") ? leaving : Promise.resolve();
}

export function releaseSplash(): void {
  const splash = document.querySelector<HTMLElement>("#blade-splash");
  if (!splash) { left(); return; }
  if (document.documentElement.dataset.bladeSplash === "seen") { splash.remove(); left(); return; }
  const played = splash.getAnimations({ subtree: true }).filter(animation => {
    const effect = animation.effect as KeyframeEffect | null;
    return effect?.target !== splash && effect?.getTiming().iterations !== Infinity;
  });
  void Promise.allSettled(played.map(animation => animation.finished)).then(() => {
    const remove = () => { splash.remove(); left(); };
    splash.addEventListener("transitionend", event => { if (event.target === splash && event.propertyName === "opacity") remove(); });
    setTimeout(remove, 1000);
    splash.classList.add("blade-splash--leaving");
  });
}
