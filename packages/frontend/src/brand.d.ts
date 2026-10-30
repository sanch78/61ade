/** SVG sources imported as text (esbuild `.svg` text loader, tools/build.mjs). */
declare module "*.svg" {
  const markup: string;
  export default markup;
}
