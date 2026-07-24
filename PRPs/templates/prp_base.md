name: "Base PRP Template - Context-Rich with Validation Loops"
description: |

## Purpose
Template optimized for AI agents to implement features with sufficient context and self-validation capabilities to achieve working code through iterative refinement.

## Core Principles
1. **Context is King**: Include ALL necessary documentation, examples, and caveats
2. **Validation Loops**: Provide executable tests/lints the AI can run and fix
3. **Information Dense**: Use keywords and patterns from the codebase
4. **Progressive Success**: Start simple, validate, then enhance
5. **Global rules**: Follow all rules in CLAUDE.md and existing codebase patterns

---

## Goal
[What needs to be built - be specific about the end state and desires]

## Why
- [Business value and user impact]
- [Integration with existing features]
- [Problems this solves and for whom]

## What
[User-visible behavior and technical requirements]

### Success Criteria
- [ ] [Specific measurable outcomes]

## All Needed Context

### Documentation & References (list all context needed to implement the feature)
```yaml
# MUST READ - Include these in your context window
- url: [Official docs URL]
  why: [Specific sections/methods you'll need]

- file: [path/to/example.tsx]
  why: [Pattern to follow, gotchas to avoid]

- doc: [Library documentation URL]
  section: [Specific section about common pitfalls]
  critical: [Key insight that prevents common errors]

- docfile: [PRPs/ai_docs/file.md]
  why: [docs that the user has pasted in to the project]

```

### Current Codebase tree (run `tree` in the root of the project) to get an overview of the codebase
```bash

```

### Desired Codebase tree with files to be added and responsibility of file
```bash

```

### Known Gotchas of our codebase & Library Quirks
```typescript
// CRITICAL: Next.js App Router uses server components by default
// Add "use client" directive for interactive components
// Example: Radix UI components need "use client"

// CRITICAL: Database queries use Drizzle ORM with Turso
// Example: Use db.select().from(table).where(eq(table.column, value))

// CRITICAL: Auth uses NextAuth v5 - check session with auth() in server components
// Example: const session = await auth(); if (!session) redirect("/login")

// CRITICAL: API routes use Next.js Route Handlers (app/api/)
// Example: export async function POST(req: Request) { ... }
```

## Implementation Blueprint

### Data models and structure

Create the core data models, we ensure type safety and consistency.
```typescript
// Examples:
// - Drizzle schema tables (src/db/schema/)
// - TypeScript interfaces/types (src/types/)
// - Zod validation schemas
// - API request/response types
```

### List of tasks to be completed to fulfill the PRP in the order they should be completed

```yaml
Task 1:
MODIFY src/existing_module.tsx:
  - FIND pattern: "export function ExistingComponent"
  - INJECT after line containing "return ("
  - PRESERVE existing prop types and structure

CREATE src/components/new-feature.tsx:
  - MIRROR pattern from: src/components/similar-feature.tsx
  - MODIFY component name and core logic
  - KEEP error handling pattern identical

...(...)

Task N:
...

```

### Per task pseudocode as needed added to each task
```typescript
// Task 1
// Pseudocode with CRITICAL details - don't write entire code
export async function newFeature(param: string): Promise<Result> {
  // PATTERN: Always validate input first (see src/lib/validators.ts)
  const validated = validateInput(param); // throws if invalid

  // PATTERN: Use existing db query patterns (see src/lib/db-queries.ts)
  const result = await db
    .select()
    .from(tableName)
    .where(eq(tableName.id, validated.id));

  // PATTERN: Standardized API response format
  return NextResponse.json({ data: result });
}
```

### Integration Points
```yaml
DATABASE:
  - migration: "Add column to existing table or create new table"
  - schema: "Update src/db/schema/[table].ts"
  - queries: "Add to src/lib/db-queries.ts or db-mutations.ts"

CONFIG:
  - add to: .env.local (if new env vars needed)
  - pattern: "NEXT_PUBLIC_ prefix for client-side, plain for server-side"

ROUTES:
  - add to: src/app/(app)/[new-page]/page.tsx (for new pages)
  - add to: src/app/api/[new-endpoint]/route.ts (for new API routes)

COMPONENTS:
  - add to: src/components/ (shared components)
  - pattern: "Use Radix UI primitives + Tailwind CSS for styling"
```

## Validation Loop

### Level 1: Syntax & Style
```bash
# Run these FIRST - fix any errors before proceeding
npm run lint                    # ESLint check
npx tsc --noEmit               # TypeScript type checking

# Expected: No errors. If errors, READ the error and fix.
```

### Level 2: Unit Tests - each new feature/file/function use existing test patterns
```typescript
// CREATE __tests__/new-feature.test.tsx with these test cases:
describe('NewFeature', () => {
  it('should handle happy path', () => {
    // Arrange - set up the scenario
    // Act - execute the code
    // Assert - verify it works correctly
  });

  it('should handle validation error', () => {
    // Test invalid input handling
  });

  it('should handle edge cases', () => {
    // Test edge cases specific to this feature
  });
});
```

```bash
# Run and iterate until passing:
npm run test -- --testPathPattern="new-feature"
# If failing: Read error, understand root cause, fix code, re-run
```

### Level 3: Integration Test
```bash
# Start the dev server
npm run dev

# Test the endpoint/page
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/[new-route]

# Expected: 200
# If error: Check terminal output for stack trace
```

### Level 4: Build Check
```bash
# Full production build to catch any issues
npm run build

# Expected: Build completes without errors
```

## Final Validation Checklist
- [ ] All tests pass: `npm run test`
- [ ] No linting errors: `npm run lint`
- [ ] No type errors: `npx tsc --noEmit`
- [ ] Build succeeds: `npm run build`
- [ ] Manual test successful: [specific page/endpoint to check]
- [ ] Error cases handled gracefully
- [ ] Responsive design verified (if UI change)
- [ ] Documentation updated if needed

---

## Anti-Patterns to Avoid
- Don't create new patterns when existing ones work
- Don't skip validation because "it should work"
- Don't ignore failing tests - fix them
- Don't use `any` type - be specific with TypeScript types
- Don't hardcode values that should be config/env vars
- Don't mix server and client code without proper boundaries
- Don't catch all exceptions - be specific
- Don't forget "use client" directive for interactive components