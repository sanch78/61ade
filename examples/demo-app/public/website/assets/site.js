// packages/frontend/src/Splash.ts
function releaseSplash() {
  const splash = document.querySelector("#blade-splash");
  if (!splash) return;
  if (document.documentElement.dataset.bladeSplash === "seen") {
    splash.remove();
    return;
  }
  const played = splash.getAnimations({ subtree: true }).filter((animation) => {
    const effect = animation.effect;
    return effect?.target !== splash && effect?.getTiming().iterations !== Infinity;
  });
  void Promise.allSettled(played.map((animation) => animation.finished)).then(() => {
    const remove = () => splash.remove();
    splash.addEventListener("transitionend", (event) => {
      if (event.target === splash && event.propertyName === "opacity") remove();
    });
    setTimeout(remove, 1e3);
    splash.classList.add("blade-splash--leaving");
  });
}

// examples/demo-app/website/site.js
releaseSplash();
var dialog = document.querySelector(".image-dialog");
var preview = dialog.querySelector("img");
var caption = dialog.querySelector("figcaption");
for (const link of document.querySelectorAll("[data-preview]")) {
  link.addEventListener("click", (event) => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    preview.src = link.href;
    preview.alt = link.querySelector("img").alt;
    caption.textContent = preview.alt;
    dialog.showModal();
  });
}
dialog.querySelector("button").addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close();
});
dialog.addEventListener("close", () => {
  preview.removeAttribute("src");
});
for (const link of document.querySelectorAll(".mobile-nav a")) {
  link.addEventListener("click", () => {
    link.closest("details").open = false;
  });
}
