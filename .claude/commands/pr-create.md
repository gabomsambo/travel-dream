---
description: Create a well-structured pull request with proper description
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(git push:*), Bash(gh pr:*)
argument-hint: [--draft] [--base=branch] [title]
---

# Pull Request Creation

**Options:** $ARGUMENTS

## PR Preparation

### 1. Analyze Changes

Review what will be included in the PR:

Current status: !`git status --short`
Recent commits: !`git log origin/main..HEAD --oneline`
Full diff: !`git diff origin/main...HEAD --stat`

### 2. Understand Context

Think deeply about the changes:
- What problem does this solve?
- What is the impact on users?
- What should reviewers focus on?
- Are there any breaking changes?

### 3. Identify PR Type

Based on the changes, determine:
- Feature addition
- Bug fix
- Refactoring
- Documentation
- Performance improvement
- Security fix

## PR Structure

### Title Format

Follow conventional commit style:
```
<type>(<scope>): <description>
```

Examples:
- `feat(auth): add OAuth2 integration`
- `fix(api): handle null responses correctly`
- `docs(readme): update installation steps`
- `refactor(core): simplify error handling`

### Description Template

Structure the PR description with:

```markdown
## Summary
[Brief description of what this PR does]

## Problem
[What issue does this solve? Link to issue if applicable]

## Solution
[How does this PR solve the problem?]

## Changes
- [List key changes]
- [Be specific about modifications]
- [Include any side effects]

## Testing
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing completed
- [ ] Performance impact assessed

## Screenshots (if UI changes)
[Add screenshots or recordings]

## Breaking Changes
[List any breaking changes or "None"]

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] Tests added/updated
- [ ] No console logs or debug code

## Related
- Closes #[issue number]
- Related to #[other PR/issue]
```

## Required Output Format

### 📋 PR Summary

**Branch:** [current branch]
**Base:** [target branch]
**Files Changed:** [count]
**Lines:** +[additions] -[deletions]

### 📝 Generated PR Content

**Title:**
```
[Generated title based on changes]
```

**Description:**
```markdown
[Generated description following template]
```

### 🎯 Review Focus Points

Suggest reviewers pay attention to:
1. [Critical change area 1]
2. [Complex logic in file:lines]
3. [Potential impact area]

### 🚀 Create PR

**Command to execute:**
```bash
# Push branch if needed
git push -u origin [branch-name]

# Create PR
gh pr create \
  --title "[title]" \
  --body "[description]" \
  --base [base-branch] \
  [--draft if specified]
```

### ⚠️ Pre-PR Checklist

Before creating:
- [ ] All commits are logical and well-messaged
- [ ] No merge commits from main (rebase if needed)
- [ ] Branch is up to date with base
- [ ] Tests are passing
- [ ] No leftover debug code

### 💡 PR Best Practices

**DO:**
- Keep PRs focused and small
- Include context and motivation
- Add screenshots for UI changes
- Link related issues
- Request specific reviewers

**DON'T:**
- Mix unrelated changes
- Submit without testing
- Forget to update documentation
- Include generated files
- Leave TODOs without tickets