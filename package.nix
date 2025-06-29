{ pkgs, inputs }:
let

  bunNix = import ./bun.nix;
  nodeModules = inputs.bun2nix.lib.x86_64-linux.mkBunNodeModules { packages = bunNix; };

  server = pkgs.runCommand "senddiscord-server" { } ''
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
