---
description: Comprehensive code review with actionable feedback
argument-hint: [file/directory/PR-number] (defaults to staged changes)
---

# Code Review Request

Deeply review the following code changes for quality, security, and best practices.

## Scope

$ARGUMENTS

## Context

- Current git status: !`git status --short`
- Recent commits: !`git log --oneline -5`

## Review Checklist

### Must Check

- [ ] **Security**: Input validation, SQL injection, XSS, authentication bypass
- [ ] **Error Handling**: Proper exception handling, edge cases covered
- [ ] **Testing**: Tests exist and cover the main functionality
- [ ] **Performance**: No obvious bottlenecks (N+1 queries, inefficient loops, unnecessary re-renders)
- [ ] **Code Style**: Consistent formatting, clear naming conventions

### Project-Specific Rules

- [ ] TypeScript types are specific (no `any`)
- [ ] "use client" directive present on interactive components
- [ ] API routes validate input and check auth
- [ ] Database queries use Drizzle ORM patterns from db-queries.ts / db-mutations.ts
- [ ] Tailwind CSS used for styling (no inline styles or CSS modules)
- [ ] Components use Radix UI primitives where applicable

## What to Review

Start by examining:

- CLAUDE.md and LOCAL_SETUP.md (if they exist)
- Key existing patterns in src/components/ and src/app/api/

Then run:

```bash
git status
git diff HEAD
git diff --stat HEAD
```

Check new untracked files:

```bash
git ls-files --others --exclude-standard
```

Read each new file in its entirety. Read each changed file in its entirety (not just the diff) to understand full context.

## Consider

Think hard about the findings from multiple angles:

- Best option based on the project context
- Best option for DRY code
- Best option for performance
- Best option for security
- Best option for maintainability

## Required Output Format

```markdown
## Review Summary

[One sentence overall assessment]

## Critical Issues (Must Fix)

[List critical security/breaking issues with file:line references]

- **[Issue]** in `file:line`: [Specific problem and fix]

## Important Issues (Should Fix)

[List important but non-breaking issues]

- **[Issue]** in `file:line`: [Problem and recommendation]

## Suggestions (Consider)

[List nice-to-have improvements]

- **[Suggestion]**: [Enhancement idea]

## Good Practices Observed

[List 2-3 things done well]

## Metrics

- Files reviewed: X
- Lines changed: +X -Y
- Test coverage: [Estimated]
- Complexity: [Low/Medium/High]
```

Focus on actionable feedback. For each issue, provide:

1. What is wrong
2. Why it matters
3. How to fix it (with specific code example when helpful)

Keep the review concise and prioritized. Maximum 15 issues total.