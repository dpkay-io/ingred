---
triggers:
  - react
  - typescript
scope: engineering
priority: 10
---

# React Patterns

- Always use functional components with hooks
- Prefer `useState` over `useReducer` for simple state
- Use `React.memo` only when profiling shows a bottleneck
- Keep components under 100 lines; extract helpers into hooks
- Co-locate tests with components: `Component.test.tsx`
