// Configure this together with VAPA_PLAYWRIGHT_BIN so test()/runner share one runtime.
const installation = process.env.VAPA_PLAYWRIGHT_MODULE;
if (!installation) throw new Error('Set VAPA_PLAYWRIGHT_MODULE to the system @playwright/test installation managed by Infra.');
module.exports = require(installation);
