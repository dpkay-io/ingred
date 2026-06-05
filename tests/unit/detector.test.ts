import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePackageJson,
  parseCargoToml,
  parseGoMod,
  parseRequirementsTxt,
  parseGemfile,
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
