{ pkgs, ... }:

{
  # Node 22 matches `engines.node`; corepack provides the pnpm pinned in `packageManager`.
  languages.javascript = {
    enable = true;
    package = pkgs.nodejs_22;
    corepack.enable = true;
  };
  env.COREPACK_ENABLE_DOWNLOAD_PROMPT = "0";

  # `devenv up` starts the web app on http://localhost:3000.
  processes.web.exec = "pnpm install && pnpm dev:web";
}
