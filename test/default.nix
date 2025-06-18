{ pkgs, senddiscord }:
let

  testServer = pkgs.runCommandLocal "test-server" { } ''
    ${pkgs.bun}/bin/bun build ${./mock-discord-webhook.ts} \
      --compile \
      --minify \
      --sourcemap \
      --bytecode \
      --outfile program
    mkdir -p "$out/bin"
    mv program "$out/bin/mock-discord-webhook"
  '';

  mkTest =
    name:
    pkgs.runCommandLocal "test-${name}" {
      env.TEST_FILE = "${./.}/${name}.sh";
      buildInputs = [
        pkgs.curl
        pkgs.systemd-notify-fifo-server
        pkgs.jq
        testServer
        senddiscord
      ];
    } (builtins.readFile ./test.sh);

  mapTests =
    names:
    builtins.listToAttrs (
      builtins.map (name: {
        name = "test-" + name;
        value = mkTest name;
      }) names
    );

  normalTests = mapTests [
    "noheader-2"
    "noheader-3"
    "noheader-4"
    "resetafter-2"
    "resetafter-3"
    "resetafter-4"
    "long-line"
    "long-line-middle"
    "batch"
  ];

in
normalTests
