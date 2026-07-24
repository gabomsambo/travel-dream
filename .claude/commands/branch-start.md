---
description: Start new feature branch from latest base branch
argument-hint: [feature-name] [--from develop|main|master]
---

# Start New Branch: $1

**Base Branch:** $2 (defaults to develop, then main if develop doesn't exist)

## Branch Setup

### 1. Prepare Base Branch

Determine base branch and update it:

```bash
# Save current work if needed
git stash push -m "WIP: Stashing before branch switch"

# Determine base branch
# use git commands to determine branches, eg..
BASE_BRANCH=$(git show-branch --all | grep '^\*' | awk '{print $2}' | head -n 1)

# Switch to base branch
git checkout $BASE_BRANCH

# Pull latest changes
git pull origin $BASE_BRANCH
```

### 2. Create Feature Branch

Generate branch name from: $1

**Branch Naming Convention:**

- Feature: `feature/[ticket-id]-[description]`
- Bugfix: `bugfix/[ticket-id]-[description]`
- Hotfix: `hotfix/[description]`
- Chore: `chore/[description]`

### 3. Initial Setup

**Branch Configuration:**

```bash
# Set upstream tracking
git push -u origin "$BRANCH_NAME"

# Verify branch status
git status
git branch -vv
```

## Branch Information

**Created Branch:** `$BRANCH_NAME`
**Base Branch:** `$BASE_BRANCH`
**Remote Tracking:** `origin/$BRANCH_NAME`

## Next Steps

You're now on branch `$BRANCH_NAME` and ready to:

**Start development**

---

✅ **Branch created and ready for development!**
