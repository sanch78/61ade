/**
 * Escape on a modal Suite window while a non-modal one is open (FB-0199). Suite closes a modal window on Escape only
 * when it is the last of all windows it lists, and it lists the non-modal ones after the modal ones, so with a
 * long-lived non-modal window (`app.ui.window({modal: false})`, the view guide) open, no modal window above it closed
 * on Escape. In exactly that case the topmost modal window (the last in the document) that holds the focus is closed
 * through its own close button, as a click on it would, before Suite's handlers run. An Escape that another layer
 * takes first is left alone: a framework dialog, a popup or menu that is open, or an already handled key.
 */
let installed=false;

function escape(event:KeyboardEvent):void{
  if((event.key!=="Escape"&&event.key!=="Esc")||event.defaultPrevented)return;
  if(!document.querySelector(".dhx_popup--window"))return;
  // A framework dialog, or a Suite popup or menu (a combo list, a context menu), takes the key first.
  if(document.querySelector(".blade-dialog-overlay, .dhx_menu, .dhx_popup:not(.dhx_popup--window):not(.dhx_popup--window_modal)"))return;
  const modals=Array.from(document.querySelectorAll<HTMLElement>(".dhx_popup--window_modal"));
  const top=modals[modals.length-1];
  if(!top||!document.activeElement||!top.contains(document.activeElement))return;
  const close=top.querySelector<HTMLElement>('.dhx_window-header [data-dhx-id="close"]');
  if(!close)return;
  event.preventDefault();
  event.stopImmediatePropagation();
  close.click();
}

/** Starts the Escape fix once per page (capture phase, before Suite's own key handlers). */
export function installWindowEscape():void{
  if(installed)return;
  installed=true;
  window.addEventListener("keydown",escape,true);
}
