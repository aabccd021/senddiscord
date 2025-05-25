{ pkgs }:
let

  server =
    src:
    pkgs.runCommandLocal "server" { } ''
      ${pkgs.bun}/bin/bun build ${../index.ts} \
        --compile \
        --minify \
        --bytecode \
        --sourcemap \
        --outfile server
      mkdir -p $out/bin
      mv server $out/bin/server
    '';

  mkTest =
    prefix: dir: name:
    pkgs.runCommandLocal "${prefix}${name}" {
      env.TEST_FILE = "${dir}/${name}.sh";
      buildInputs = [
        pkgs.jq
        pkgs.jwt-cli
        pkgs.curl
        pkgs.tinyxxd
        server
      ];
    } (builtins.readFile ./test.sh);

  mapTests =
    prefix: dir: names:
    builtins.listToAttrs (
      builtins.map (name: {
        name = prefix + name;
        value = mkTest prefix dir name;
      }) names
    );

  normalTests = mapTests "test-google-normal-" ./normal [
  ];

in
normalTests
