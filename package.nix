{ pkgs, inputs }:
let

  nodeModules = inputs.bun2nix.lib.x86_64-linux.mkBunNodeModules (import ./bun.nix);

  server = pkgs.runCommand "discord-webhook-dispatcher" { } ''
    cp -Lr ${./src} ./src
    cp -Lr ${nodeModules}/node_modules ./node_modules
    cp -L ${./tsconfig.json} ./tsconfig.json
    cp -L ${./package.json} ./package.json
    ${pkgs.bun}/bin/bun build ./src/index.ts \
      --compile \
      --minify \
      --sourcemap \
      --bytecode \
      --outfile program
    mkdir -p "$out/bin"
    mv program "$out/bin/discord-webhook-dispatcher"
  '';

in

pkgs.writeShellApplication {
  name = "discord-webhook-dispatcher";
  runtimeInputs = [
    pkgs.systemd
  ];
  text = ''
    exec ${server}/bin/discord-webhook-dispatcher "$@"
  '';
}
