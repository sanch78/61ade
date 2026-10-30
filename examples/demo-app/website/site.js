import { releaseSplash } from '../../../packages/frontend/src/Splash.ts';
import '../../../packages/frontend/src/splash.css';
import './site.css';

releaseSplash();

const dialog = document.querySelector('.image-dialog');
const preview = dialog.querySelector('img');
const caption = dialog.querySelector('figcaption');
for (const link of document.querySelectorAll('[data-preview]')) {
  link.addEventListener('click', event => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    preview.src = link.href;
    preview.alt = link.querySelector('img').alt;
    caption.textContent = preview.alt;
    dialog.showModal();
  });
}
dialog.querySelector('button').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
dialog.addEventListener('close', () => { preview.removeAttribute('src'); });
for (const link of document.querySelectorAll('.mobile-nav a')) {
  link.addEventListener('click', () => { link.closest('details').open = false; });
}
