{ pkgs }:
{

  discord-webhook-dispatcher = pkgs.runCommand "discord-webhook-dispatcher" { } ''
    cp -Lr ${./src} ./src
    ${pkgs.bun}/bin/bun build ./src/index.ts \
      --compile \
      --minify \
      --sourcemap \
      --bytecode \
      --outfile program
    mkdir -p "$out/bin"
    mv program "$out/bin/discord-webhook-dispatcher"
  '';

}
