{
  pkgs ? import <nixpkgs> { },
  ...
}:
let
  lib = pkgs.lib;
  extractTarball =
    src:
    pkgs.runCommand "extracted-${src.name}" { } ''
      mkdir "$out"
      ${pkgs.libarchive}/bin/bsdtar -xf ${src} --strip-components 1 -C "$out"
    '';
  packages = {
    "node_modules/@types/bun/" = extractTarball (
      pkgs.fetchurl {
        url = "https://registry.npmjs.org/@types/bun/-/bun-1.2.21.tgz";
        hash = "sha512-NiDnvEqmbfQ6dmZ3EeUO577s4P5bf4HCTXtI6trMc6f6RzirY5IrF3aIookuSpyslFzrnvv2lmEWv5HyC1X79A==";
      }
    );
    "node_modules/@types/node/" = extractTarball (
      pkgs.fetchurl {
        url = "https://registry.npmjs.org/@types/node/-/node-24.3.1.tgz";
        hash = "sha512-3vXmQDXy+woz+gnrTvuvNrPzekOi+Ds0ReMxw0LzBiK3a+1k0kQn9f2NWk+lgD4rJehFUmYy2gMhJ2ZI+7YP9g==";
      }
    );
    "node_modules/@types/react/" = extractTarball (
      pkgs.fetchurl {
        url = "https://registry.npmjs.org/@types/react/-/react-19.1.12.tgz";
        hash = "sha512-cMoR+FoAf/Jyq6+Df2/Z41jISvGZZ2eTlnsaJRptmZ76Caldwy1odD4xTr/gNV9VLj0AWgg/nmkevIyUfIIq5w==";
      }
    );
    "node_modules/bun-types/" = extractTarball (
      pkgs.fetchurl {
        url = "https://registry.npmjs.org/bun-types/-/bun-types-1.2.21.tgz";
        hash = "sha512-sa2Tj77Ijc/NTLS0/Odjq/qngmEPZfbfnOERi0KRUYhT9R8M4VBioWVmMWE5GrYbKMc+5lVybXygLdibHaqVqw==";
      }
    );
    "node_modules/csstype/" = extractTarball (
      pkgs.fetchurl {
        url = "https://registry.npmjs.org/csstype/-/csstype-3.1.3.tgz";
        hash = "sha512-M1uQkMl8rQK/szD0LNhtqxIPLpimGm8sOBwU7lLnCpSbTyY3yeU1Vc7l4KT5zT4s/yOxHH5O7tIuuLOCnLADRw==";
      }
    );
    "node_modules/superstruct/" = extractTarball (
      pkgs.fetchurl {
        url = "https://registry.npmjs.org/superstruct/-/superstruct-2.0.2.tgz";
        hash = "sha512-uV+TFRZdXsqXTL2pRvujROjdZQ4RAlBUS5BTh9IGm+jTqQntYThciG/qu57Gs69yjnVUSqdxF9YLmSnpupBW9A==";
      }
    );
    "node_modules/undici-types/" = extractTarball (
      pkgs.fetchurl {
        url = "https://registry.npmjs.org/undici-types/-/undici-types-7.10.0.tgz";
        hash = "sha512-t5Fy/nfn+14LuOc2KNYg75vZqClpAiqscVvMygNnlsHBFpSXdJaYtXMcdNLpl/Qvc3P2cB3s6lOV51nqsFq4ag==";
      }
    );
  };
  packageCommands = lib.pipe packages [
    (lib.mapAttrsToList (
      modulePath: package: ''
        mkdir -p "$out/lib/${modulePath}"
        cp -Lr ${package}/* "$out/lib/${modulePath}"
        chmod -R u+w "$out/lib/${modulePath}"
      ''
    ))
    (lib.concatStringsSep "\n")
  ];
in
(pkgs.runCommand "node_modules" { buildInputs = [ pkgs.nodejs ]; } ''
  ${packageCommands}
  mkdir -p "$out/lib/node_modules/.bin"
  ln -s "$out/lib/node_modules/.bin" "$out/bin"
'')
