// NativeWind 4 only works with Tailwind 3, while the web app (apps/web) uses Tailwind 4, which npm keeps at the repo
// root. NativeWind looks for `tailwindcss` from its own folder and would find that one, so its lookups are sent to the
// Tailwind 3 in apps/mobile/node_modules. metro.config.js loads this file, and passes it to the processes Metro and
// NativeWind start (the Tailwind CLI runs in one) through NODE_OPTIONS.
const Module = require("node:module");

const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  const tailwind = request === "tailwindcss" || request.startsWith("tailwindcss/");
  if (tailwind && /node_modules[\\/](nativewind|react-native-css-interop)[\\/]/.test(parent?.filename ?? "")) {
    return resolveFilename.call(this, request, parent, isMain, { ...options, paths: [__dirname] });
  }
  return resolveFilename.call(this, request, parent, isMain, options);
};
