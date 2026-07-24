---
description: Create well-structured commits with conventional commit format
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git add:*), Bash(git commit:*)
argument-hint: [--no-verify] [--all] [specific files]
---

# Smart Commit Creation

**Options:** $ARGUMENTS

## Commit Process

### 1. Analyze Current State

First, understand what changes need to be committed:

Check status: !`git status --short`

### 2. Review Changes

Think deeply about the changes to determine if they should be split:

Get detailed diff: !`git diff --staged`

If no files are staged, check all changes: !`git diff`

### 3. Determine Commit Strategy

Analyze the diff to identify:
- Are there multiple unrelated changes?
- Do changes touch different concerns?
- Would splitting improve clarity?

**Split commits when:**
- Different features mixed together
- Bug fixes combined with features
- Refactoring mixed with functionality
- Documentation changes with code changes
- Test additions with implementation

### 4. Stage Appropriate Files

Based on analysis:
- If files need selective staging for logical commits
- If all changes are related, stage everything
- Group files by their logical purpose

## Commit Message Format

### Conventional Commit Structure

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Types & Their Usage

**Primary Types:**
- `feat`: New feature for the user
- `fix`: Bug fix for the user
- `docs`: Documentation only changes
- `style`: Formatting, missing semicolons, etc (no code change)
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `test`: Adding missing tests or correcting existing tests
- `chore`: Updating build tasks, package manager configs, etc

**Additional Types:**
- `perf`: Performance improvements
- `ci`: Changes to CI configuration files and scripts
- `build`: Changes affecting build system or dependencies
- `revert`: Reverts a previous commit

### Message Guidelines

**First Line (Subject):**
- Maximum 72 characters
- Present tense, imperative mood ("add" not "added")
- No period at the end
- Capitalize first letter

**Body (if needed):**
- Wrap at 72 characters
- Explain what and why, not how
- Include motivation for change
- Contrast with previous behavior

## Required Output Format

### For Single Commit

```bash
# Stage files (if not already staged)
git add [files]

# Create commit with message
git commit -m "<type>: <description>"
```

### For Multiple Commits

```bash
# First logical change
git add [related files group 1]
git commit -m "<type>: <description for change 1>"

# Second logical change
git add [related files group 2]
git commit -m "<type>: <description for change 2>"

# Continue for each logical group...
```

### Commit Message Examples

**Good Examples:**
- `feat: add user authentication with OAuth2`
- `fix: resolve memory leak in image processing`
- `docs: update API endpoints in README`
- `refactor: extract validation logic to separate module`
- `test: add integration tests for payment flow`
- `perf: optimize database queries with indexing`
- `chore: upgrade dependencies to latest versions`

**With Scope:**
- `feat(auth): implement two-factor authentication`
- `fix(api): handle null responses in user endpoint`
- `docs(cli): add examples for new commands`

## Decision Flow

After analyzing changes, provide:

### 📝 Commit Plan

**Changes Detected:**
- [Summary of what changed]

**Recommended Approach:**
- [ ] Single commit (all changes related)
- [ ] Split into X commits (changes address different concerns)

**Commit(s) to Create:**
1. `<type>: <message>` - [files included]
2. `<type>: <message>` - [files included] (if splitting)

### ⚠️ Pre-commit Checks

Before committing, verify:
- [ ] All tests pass
- [ ] Code is properly formatted
- [ ] No debug code or console logs
- [ ] Documentation updated if needed

### 🚀 Execute

Ready to commit with the plan above?

**Note:** Use `--no-verify` flag only when absolutely necessary and you understand the risks.