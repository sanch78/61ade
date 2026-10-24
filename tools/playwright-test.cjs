// Configure this together with BLADE_PLAYWRIGHT_BIN so test()/runner share one runtime.
const installation = process.env.BLADE_PLAYWRIGHT_MODULE;
if (!installation) throw new Error('Set BLADE_PLAYWRIGHT_MODULE to the system @playwright/test installation managed by Infra.');
module.exports = require(installation);
