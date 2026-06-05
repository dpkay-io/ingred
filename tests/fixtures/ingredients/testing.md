---
triggers:
  - jest
  - vitest
  - testing-library
scope: engineering
---

# Testing Standards

- Test behavior, not implementation
- Each test should have a single assertion concept
- Use descriptive test names: "should [expected behavior] when [condition]"
- Prefer integration tests over unit tests for UI components
- Mock external APIs, never internal modules
