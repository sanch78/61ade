/** Writes $text to the clipboard: the async Clipboard API, else a hidden textarea and `execCommand("copy")`. */
export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall back */ }
  const area = document.createElement("textarea"), focus = document.activeElement as HTMLElement | null;
  area.value = text; area.setAttribute("readonly", ""); area.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
  document.body.append(area); area.select();
  try { return document.execCommand("copy"); } catch { return false; } finally { area.remove(); focus?.focus?.(); }
}
