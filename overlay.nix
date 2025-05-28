{ pkgs }:
{

  discord-webhook-dispatcher = pkgs.runCommand "discord-webhook-dispatcher" { } ''
    ${pkgs.bun}/bin/bun build ${./index.ts} \
      --compile \
      --minify \
      --sourcemap \
      --bytecode \
      --outfile program
    mkdir -p "$out/bin"
    mv program "$out/bin/discord-webhook-dispatcher"
  '';
}
