// App Attest needs its entitlement on iOS: `production`, or `development` for builds signed with a development profile
// (APP_ATTEST_ENV=development at prebuild; the API's own APP_ATTEST_ENV must match).
const { withEntitlementsPlist } = require("expo/config-plugins");

module.exports = function withAppAttest(config) {
  return withEntitlementsPlist(config, (mod) => {
    mod.modResults["com.apple.developer.devicecheck.appattest-environment"] = process.env.APP_ATTEST_ENV === "development" ? "development" : "production";
    return mod;
  });
};
