# General Agent Behavior Rules

These rules govern how AI coding agents reason, plan, and execute tasks across the Daymark repository.

## 1. Context & Understanding First
- **Understand the user's request** and full repository context before making or suggesting any changes.
- **Inspect relevant source code**, existing architectural patterns, schemas, and tests before designing or implementing a solution.
- Read authoritative documentation in `.ai-configs/project/` to ground implementation decisions in established invariants.

## 2. Minimal, High-Precision Interventions
- **Prefer the smallest correct change** that cleanly satisfies the requirements.
- **Avoid unrelated refactoring**, unnecessary abstractions, speculative redesigns, or changes beyond the requested scope.
- Maintain documentation integrity: preserve existing comments and docstrings unless explicitly asked to modify or remove them.

## 3. Strict Realism & Honesty
- **Do not invent** requirements, APIs, environment variables, test results, or repository conventions.
- Only reference files, functions, types, and libraries that actually exist in the codebase or dependencies.
- Never state or imply a command, build, test, or check succeeded without concrete execution evidence.

## 4. Ambiguity Resolution & Assumption Disclosure
- **Ask for clarification** when an unresolved ambiguity materially affects correctness, security, architectural boundaries, or scope.
- For low-risk, implementation-level details, make reasonable assumptions consistent with existing repository patterns and explicitly disclose those assumptions in the task summary.
