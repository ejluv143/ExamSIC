{ pkgs, lib, config, ... }:

let
  # BETTER_AUTH_SECRET signs login sessions. Generated once per machine and kept in
  # .devenv/state (gitignored), so no secret is committed.
  loadAuthSecret = ''
    secret_file="${config.devenv.state}/auth-secret"
    if [ ! -s "$secret_file" ]; then
      mkdir -p "$(dirname "$secret_file")"
      (umask 077 && ${lib.getExe pkgs.openssl} rand -base64 32 > "$secret_file")
    fi
    export BETTER_AUTH_SECRET="$(cat "$secret_file")"
  '';

  # Development-only credentials for the local Garage bucket. Garage key ids are "GK" + 24 hex digits and secrets
  # 64 hex digits; fixed values keep the S3_* variables below static.
  s3 = {
    bucket = "examora";
    keyName = "examora";
    accessKeyId = "GK0e5a0a00e5a0a00e5a0a00e";
    secretAccessKey = "e5a0a00e5a0a00e5a0a00e5a0a00e5a0a00e5a0a00e5a0a00e5a0a00e5a0a00e";
  };
in
{
  # Node 22 matches `engines.node`; corepack provides the pnpm pinned in `packageManager`.
  languages.javascript = {
    enable = true;
    package = pkgs.nodejs_22;
    corepack.enable = true;
  };
  env.COREPACK_ENABLE_DOWNLOAD_PROMPT = "0";

  # Postgres for `apps/rpc` (Drizzle). Data lives in `.devenv/state/postgres`.
  services.postgres = {
    enable = true;
    package = pkgs.postgresql_17;
    listen_addresses = "127.0.0.1";
    port = 5434;
    initialDatabases = [ { name = "examora"; } ];
  };
  env.DATABASE_URL = "postgresql://127.0.0.1:${toString config.services.postgres.port}/examora";
  # The API (apps/rpc) listens here; the web app calls it and forwards /api/auth/* to it.
  env.PORT = "3001";
  env.API_URL = "http://127.0.0.1:3001";
  # Better Auth's public URL is the web app's: browsers never talk to the API directly.
  env.BETTER_AUTH_URL = "http://localhost:3000";

  # S3-compatible storage for question images and students' drawings (apps/rpc, see README): Garage, with data in
  # .devenv/state/garage. On start it creates the bucket, imports the key above with read and write on it, and
  # sets CORS so the browser can POST uploads straight to it and read signed images. The S3 API is on 3910 (or the
  # next free port), clear of Garage's default 3900 used by other projects.
  services.garage = {
    enable = true;
    s3Address = "127.0.0.1:3910";
    adminAddress = "127.0.0.1:3913";
    buckets = [ s3.bucket ];
    afterStart = ''
      if ! $GARAGE key info ${s3.keyName} &>/dev/null; then
        $GARAGE key import --yes -n ${s3.keyName} ${s3.accessKeyId} ${s3.secretAccessKey}
      fi
      $GARAGE bucket allow --read --write --owner ${s3.bucket} --key ${s3.keyName}
      # Garage's CLI can't set CORS; the S3 API can. Any origin is fine for a local development bucket.
      AWS_ACCESS_KEY_ID=${s3.accessKeyId} AWS_SECRET_ACCESS_KEY=${s3.secretAccessKey} \
        ${lib.getExe pkgs.awscli2} s3api put-bucket-cors \
          --endpoint-url ${config.env.GARAGE_S3_ENDPOINT} --region ${config.services.garage.region} \
          --bucket ${s3.bucket} \
          --cors-configuration '{"CORSRules":[{"AllowedOrigins":["*"],"AllowedMethods":["GET","HEAD","POST","PUT"],"AllowedHeaders":["*"],"ExposeHeaders":["ETag"],"MaxAgeSeconds":3600}]}'
      echo "Garage bucket '${s3.bucket}' is ready for key '${s3.keyName}'."
    '';
  };
  # The module starts Garage's internal RPC port at 3901, which another project's Garage may hold; keep it beside ours.
  processes.garage.ports.rpc.allocate = lib.mkForce 3911;
  env.S3_BUCKET = s3.bucket;
  env.S3_REGION = config.services.garage.region;
  env.S3_ENDPOINT = config.env.GARAGE_S3_ENDPOINT;
  env.S3_ACCESS_KEY_ID = s3.accessKeyId;
  env.S3_SECRET_ACCESS_KEY = s3.secretAccessKey;

  enterShell = loadAuthSecret;

  # `devenv up` starts Postgres, then the API (after migrating and seeding the test and demo accounts),
  # then the web app on http://localhost:3000.
  processes.api = {
    exec = ''
      ${loadAuthSecret}
      pnpm install && pnpm db:migrate && pnpm db:seed && pnpm dev:rpc
    '';
    # The Garage configure task finishes once the bucket, key and CORS are set up.
    after = [ "devenv:processes:postgres" "devenv:garage:configure" ];
    ready = {
      http.get = { port = 3001; path = "/health"; };
      period = 1;
      timeout = 180;
    };
  };
  processes.web = {
    # `next dev` reads PORT; keep it off the API's.
    exec = "PORT=3000 pnpm dev:web";
    after = [ "devenv:processes:api" ];
  };
}
