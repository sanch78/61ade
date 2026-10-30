// examples/demo-app/frontend/src/index.ts
var none = () => {
};
var assets = none;
var playlist = none;
var readings = none;
var tasks = none;
var demo = async (app) => {
  const failures = [];
  for (const part of [assets, playlist, readings, tasks]) {
    try {
      await part(app);
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length) throw new AggregateError(failures, "61ade feature demo: a module part failed");
};
var index_default = demo;
export {
  index_default as default
};
