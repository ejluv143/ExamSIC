const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

// NativeWind needs Tailwind 3 and the web app uses 4: see tailwind-v3.js. Loaded here, and in the child processes.
require("./tailwind-v3");
process.env.NODE_OPTIONS = `${process.env.NODE_OPTIONS ?? ""} --require ${path.join(projectRoot, "tailwind-v3.js")}`.trim();

const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(projectRoot);

// The repo is an npm workspace: the packages (`@examinus/*`) live outside this app, and their `.ts` sources and
// `exports` maps must resolve.
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, "node_modules"), path.resolve(workspaceRoot, "node_modules")];
config.resolver.unstable_enablePackageExports = true;

// The web app pins React 19.2.8 at the root; React Native 0.88 needs 19.3.0, which npm keeps in apps/mobile/node_modules.
// A shared package (`@examinus/taking`) asks for `react` from its own folder and would get the root copy: two Reacts in
// one bundle break hooks. These always resolve from the app.
const singletons = ["react", "react-dom", "react-native"];
// NativeWind's runtime (`react-native-css-interop`) is imported by the code its Babel plugin writes, in app files and in
// libraries alike. npm keeps it inside nativewind/node_modules (its lightningcss pin conflicts with the web app's), so
// those imports resolve from NativeWind's folder: the one copy NativeWind itself uses.
const nativewindRoot = path.dirname(require.resolve("nativewind/package.json"));
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const pinned = singletons.some((name) => moduleName === name || moduleName.startsWith(`${name}/`));
  const interop = moduleName === "react-native-css-interop" || moduleName.startsWith("react-native-css-interop/");
  const originModulePath = pinned ? path.join(projectRoot, "index.ts") : interop ? path.join(nativewindRoot, "index.js") : null;
  const origin = originModulePath ? { ...context, originModulePath } : context;
  return origin.resolveRequest(origin, moduleName, platform);
};

module.exports = withNativeWind(config, { input: "./global.css" });
