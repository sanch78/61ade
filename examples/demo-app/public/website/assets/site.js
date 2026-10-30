// packages/frontend/src/Splash.ts
function releaseSplash() {
  const splash2 = document.querySelector("#blade-splash");
  if (!splash2) return;
  if (document.documentElement.dataset.bladeSplash === "seen") {
    splash2.remove();
    return;
  }
  const played = splash2.getAnimations({ subtree: true }).filter((animation) => {
    const effect = animation.effect;
    return effect?.target !== splash2 && effect?.getTiming().iterations !== Infinity;
  });
  void Promise.allSettled(played.map((animation) => animation.finished)).then(() => {
    const remove = () => splash2.remove();
    splash2.addEventListener("transitionend", (event) => {
      if (event.target === splash2 && event.propertyName === "opacity") remove();
    });
    setTimeout(remove, 1e3);
    splash2.classList.add("blade-splash--leaving");
  });
}

// examples/demo-app/website/site.js
var root = document.documentElement;
var motion = !matchMedia("(prefers-reduced-motion: reduce)").matches;
var splash = document.querySelector("#blade-splash");
if (motion && splash && root.dataset.bladeSplash !== "seen") {
  document.querySelectorAll("[data-enter]").forEach((element, index) => element.style.setProperty("--i", index));
  root.classList.add("hero-wait");
  new MutationObserver((_, observer) => {
    if (!splash.classList.contains("blade-splash--leaving")) return;
    observer.disconnect();
    root.classList.replace("hero-wait", "hero-enter");
  }).observe(splash, { attributes: true, attributeFilter: ["class"] });
}
releaseSplash();
if (motion) {
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add("is-revealed");
      observer.unobserve(entry.target);
    }
  }, { rootMargin: "0px 0px -8% 0px" });
  document.querySelectorAll("[data-reveal]").forEach((element) => observer.observe(element));
  root.classList.add("reveal-ready");
}
var showcase = document.querySelector(".showcase");
var features = [...showcase.querySelectorAll(".feature")];
var wide = matchMedia("(min-width: 1081px)");
var active = 0;
var select = (index) => {
  active = index;
  features.forEach((feature, i) => {
    feature.classList.toggle("is-active", i === index);
    feature.querySelector("h3 button")?.setAttribute("aria-expanded", String(i === index));
  });
};
var layout = () => {
  showcase.classList.toggle("is-tabs", wide.matches);
  features.forEach((feature, index) => {
    const heading = feature.querySelector("h3");
    const button = heading.querySelector("button");
    if (wide.matches && !button) {
      const control = document.createElement("button");
      control.type = "button";
      control.setAttribute("aria-controls", `${feature.id}-body ${feature.id}-figure`);
      control.append(...heading.childNodes);
      control.addEventListener("click", () => {
        showcase.classList.remove("is-auto");
        select(index);
      });
      heading.append(control);
    } else if (!wide.matches && button) {
      button.replaceWith(...button.childNodes);
    }
  });
  select(active);
};
features.forEach((feature, index) => {
  feature.querySelector(".feature-body").id = `${feature.id}-body`;
  feature.querySelector(".feature-figure").id = `${feature.id}-figure`;
  feature.querySelector(".feature-progress").addEventListener("animationend", () => select((index + 1) % features.length));
});
layout();
wide.addEventListener("change", layout);
if (motion) {
  showcase.classList.add("is-auto");
  new IntersectionObserver(([entry]) => showcase.classList.toggle("is-visible", entry.isIntersecting), { threshold: 0.35 }).observe(showcase);
}
var credentials = document.querySelector(".credentials");
if (navigator.clipboard) {
  for (const entry of credentials.querySelectorAll("div")) {
    const value = entry.querySelector("code").textContent;
    const label = `${credentials.dataset.copy}: ${entry.querySelector("dt").textContent}`;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "copy";
    button.textContent = credentials.dataset.copy;
    button.setAttribute("aria-label", label);
    button.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(value);
      } catch {
        return;
      }
      button.textContent = credentials.dataset.copied;
      button.setAttribute("aria-label", credentials.dataset.copied);
      button.dataset.done = "";
      setTimeout(() => {
        button.textContent = credentials.dataset.copy;
        button.setAttribute("aria-label", label);
        delete button.dataset.done;
      }, 1600);
    });
    entry.append(button);
  }
}
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
