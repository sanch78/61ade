// Synthetic sign-in module of the feature demo (docs/shell.md#sign-in-modules): a plain ES module, loaded only on the
// signed-out pages, that fills the window's footer slot with one line following the theme. It receives only the
// restricted SignInApplication (no server, identity, CSRF token or form values).
/** @type {import("@61ade/admin").SignInModule} */
export default (app) => {
  const credentials = document.createElement("p");
  credentials.className = "demo-sign-in-credentials";
  const caption = document.createElement("span");
  caption.textContent = app.i18n.t("Nyilvános demófiók");
  credentials.append(caption);
  for (const value of ["demo@example.test", "61ade-demo"]) {
    const code = document.createElement("code");
    code.textContent = value;
    credentials.append(code);
  }
  app.slots.footer.append(credentials);
  const line = document.createElement("p");
  line.className = "demo-sign-in-footer";
  const paint = (theme) => { line.textContent = app.i18n.t("Demó bejelentkezési modul · téma: {theme}", { theme }); };
  paint(app.theme.current());
  app.theme.onChange(paint);
  app.slots.footer.append(line);
};
