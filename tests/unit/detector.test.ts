import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePackageJson,
  parseCargoToml,
  parseGoMod,
  parseRequirementsTxt,
  parseGemfile,
  parseCsproj,
  parseFsproj,
  parseBuildSbt,
  parseMixExs,
  parseCabal,
  parseDepsEdn,
} from '../../src/parsers/manifest.js';

describe('parsePackageJson', () => {
  it('extracts dependencies and base tokens', () => {
    const content = JSON.stringify({
      dependencies: { react: '^18', 'react-dom': '^18' },
      devDependencies: { jest: '^29' },
    });
    const tokens = parsePackageJson(content);
    assert.ok(tokens.includes('node'));
    assert.ok(tokens.includes('javascript'));
    assert.ok(tokens.includes('react'));
    assert.ok(tokens.includes('react-dom'));
    assert.ok(tokens.includes('jest'));
  });

  it('detects typescript from devDependencies', () => {
    const content = JSON.stringify({
      devDependencies: { typescript: '^5' },
    });
    const tokens = parsePackageJson(content);
    assert.ok(tokens.includes('typescript'));
  });

  it('returns base tokens for malformed JSON', () => {
    const tokens = parsePackageJson('not json');
    assert.ok(tokens.includes('node'));
    assert.ok(tokens.includes('javascript'));
    assert.equal(tokens.length, 2);
  });
});

describe('parseCargoToml', () => {
  it('extracts crate names from dependencies', () => {
    const content = `[package]
name = "myapp"
version = "0.1.0"

[dependencies]
serde = "1.0"
tokio = { version = "1", features = ["full"] }
`;
    const tokens = parseCargoToml(content);
    assert.ok(tokens.includes('rust'));
    assert.ok(tokens.includes('cargo'));
    assert.ok(tokens.includes('serde'));
    assert.ok(tokens.includes('tokio'));
  });
});

describe('parseGoMod', () => {
  it('extracts module basenames from require block', () => {
    const content = `module example.com/myapp

go 1.21

require (
	github.com/gin-gonic/gin v1.9.0
	github.com/lib/pq v1.10.0
)
`;
    const tokens = parseGoMod(content);
    assert.ok(tokens.includes('go'));
    assert.ok(tokens.includes('golang'));
    assert.ok(tokens.includes('gin'));
    assert.ok(tokens.includes('pq'));
  });
});

describe('parseRequirementsTxt', () => {
  it('extracts package names and strips version specifiers', () => {
    const content = `django>=4.0
flask==2.3.0
requests~=2.28
gunicorn
# this is a comment
-e ./local-package
`;
    const tokens = parseRequirementsTxt(content);
    assert.ok(tokens.includes('python'));
    assert.ok(tokens.includes('django'));
    assert.ok(tokens.includes('flask'));
    assert.ok(tokens.includes('requests'));
    assert.ok(tokens.includes('gunicorn'));
    assert.ok(!tokens.includes(''));
  });
});

describe('parseGemfile', () => {
  it('extracts gem names', () => {
    const content = `source 'https://rubygems.org'
gem 'rails', '~> 7.0'
gem "puma"
gem 'sidekiq', '>= 6.0'
`;
    const tokens = parseGemfile(content);
    assert.ok(tokens.includes('ruby'));
    assert.ok(tokens.includes('rails'));
    assert.ok(tokens.includes('puma'));
    assert.ok(tokens.includes('sidekiq'));
  });
});

describe('parseCsproj', () => {
  it('extracts dotnet and csharp base tokens', () => {
    const tokens = parseCsproj('<Project Sdk="Microsoft.NET.Sdk"></Project>');
    assert.ok(tokens.includes('dotnet'));
    assert.ok(tokens.includes('csharp'));
  });

  it('extracts package references and normalizes dots to hyphens', () => {
    const content = `<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <PackageReference Include="Microsoft.AspNetCore.Mvc" Version="2.2.0" />
    <PackageReference Include="Newtonsoft.Json" Version="13.0.1" />
  </ItemGroup>
</Project>`;
    const tokens = parseCsproj(content);
    assert.ok(tokens.includes('microsoft-aspnetcore-mvc'));
    assert.ok(tokens.includes('newtonsoft-json'));
  });
});

describe('parseFsproj', () => {
  it('extracts dotnet and fsharp base tokens', () => {
    const tokens = parseFsproj('<Project Sdk="Microsoft.NET.Sdk"></Project>');
    assert.ok(tokens.includes('dotnet'));
    assert.ok(tokens.includes('fsharp'));
    assert.ok(!tokens.includes('csharp'));
  });

  it('extracts package references', () => {
    const content = `<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <PackageReference Include="FSharp.Core" Version="6.0.0" />
  </ItemGroup>
</Project>`;
    const tokens = parseFsproj(content);
    assert.ok(tokens.includes('fsharp-core'));
  });
});

describe('parseBuildSbt', () => {
  it('extracts scala and sbt base tokens', () => {
    const tokens = parseBuildSbt('');
    assert.ok(tokens.includes('scala'));
    assert.ok(tokens.includes('sbt'));
  });

  it('extracts artifact names from libraryDependencies', () => {
    const content = `
libraryDependencies ++= Seq(
  "org.typelevel" %% "cats-core" % "2.9.0",
  "com.typesafe.akka" %% "akka-actor" % "2.7.0",
  "io.circe" %% "circe-generic" % "0.14.5"
)
`;
    const tokens = parseBuildSbt(content);
    assert.ok(tokens.includes('cats-core'));
    assert.ok(tokens.includes('akka-actor'));
    assert.ok(tokens.includes('circe-generic'));
  });

  it('deduplicates tokens', () => {
    const content = `
"org.scalatest" %% "scalatest" % "3.2.0"
"org.scalatest" %% "scalatest" % "3.2.1"
`;
    const tokens = parseBuildSbt(content);
    assert.equal(tokens.filter((t) => t === 'scalatest').length, 1);
  });
});

describe('parseMixExs', () => {
  it('extracts elixir base token', () => {
    const tokens = parseMixExs('defmodule MyApp.MixProject do\nend');
    assert.ok(tokens.includes('elixir'));
  });

  it('extracts deps from mix.exs format', () => {
    const content = `
defp deps do
  [
    {:phoenix, "~> 1.7.0"},
    {:ecto, "~> 3.10"},
    {:jason, "~> 1.4"}
  ]
end
`;
    const tokens = parseMixExs(content);
    assert.ok(tokens.includes('phoenix'));
    assert.ok(tokens.includes('ecto'));
    assert.ok(tokens.includes('jason'));
  });

  it('deduplicates tokens', () => {
    const content = `{:phoenix, "~> 1.7"}\n{:phoenix, "~> 1.6"}`;
    const tokens = parseMixExs(content);
    assert.equal(tokens.filter((t) => t === 'phoenix').length, 1);
  });
});

describe('parseCabal', () => {
  it('extracts haskell and cabal base tokens', () => {
    const tokens = parseCabal('');
    assert.ok(tokens.includes('haskell'));
    assert.ok(tokens.includes('cabal'));
  });

  it('extracts build-depends packages and skips base', () => {
    const content = `
library
  build-depends:
      base >= 4.14 && < 5
    , aeson >= 2.0
    , text
    , bytestring
  hs-source-dirs: src
`;
    const tokens = parseCabal(content);
    assert.ok(!tokens.includes('base'));
    assert.ok(tokens.includes('aeson'));
    assert.ok(tokens.includes('text'));
    assert.ok(tokens.includes('bytestring'));
  });
});

describe('parseDepsEdn', () => {
  it('extracts clojure base token', () => {
    const tokens = parseDepsEdn('{}');
    assert.ok(tokens.includes('clojure'));
  });

  it('extracts artifact names from org/artifact pairs', () => {
    const content = `
{:deps {org.clojure/clojure {:mvn/version "1.11.1"}
        ring/ring-core {:mvn/version "1.9.6"}
        compojure/compojure {:mvn/version "1.7.0"}}}
`;
    const tokens = parseDepsEdn(content);
    assert.ok(tokens.includes('clojure'));
    assert.ok(tokens.includes('ring-core'));
    assert.ok(tokens.includes('compojure'));
  });

  it('deduplicates tokens', () => {
    const content = `org.example/mylib {:mvn/version "1.0"}\norg.other/mylib {:mvn/version "2.0"}`;
    const tokens = parseDepsEdn(content);
    assert.equal(tokens.filter((t) => t === 'mylib').length, 1);
  });
});
