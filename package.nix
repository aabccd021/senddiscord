{ pkgs }:
let

  npm_deps = import ./npm_deps.nix { pkgs = pkgs; };

  server = pkgs.runCommand "senddiscord-server" { } ''
    cp -Lr ${./src} ./src
    cp -Lr ${npm_deps}/lib/node_modules ./node_modules
    cp -L ${./tsconfig.json} ./tsconfig.json
    ${pkgs.bun}/bin/bun build ./src/index.ts \
      --compile \
      --minify \
      --sourcemap \
      --bytecode \
      --outfile program
    mkdir -p "$out/bin"
    mv program "$out/bin/senddiscord-server"
  '';

in

pkgs.writeShellApplication {
  name = "senddiscord-server";
  runtimeInputs = [
    pkgs.systemd
  ];
  text = ''
    exec ${server}/bin/senddiscord-server "$@"
  '';
}
