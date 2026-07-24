---
description: Systematic debugging to find and fix root causes
argument-hint: [error message/stack trace/bug description]
---

# Debug Investigation

**Problem:** $ARGUMENTS

## Systematic Debugging Process

### 1. Parse & Understand

First, deeply analyze the error or bug report:

- Extract exact error messages and error codes
- Identify affected files and line numbers from stack traces
- Note any patterns or repeated elements
- Determine when this started happening

### 2. Reproduce & Isolate

Think hard about the conditions that trigger this issue:

- What user actions or inputs cause it?
- Does it happen consistently or intermittently?
- What's the minimal code path to reproduce?
- Are there any recent changes that correlate?

Check recent changes: !`git log --oneline -10 --name-only`

### 3. Root Cause Analysis

Investigate deeply to find the actual cause, not just symptoms:

- Search for error patterns in codebase
- Check related files and dependencies
- Look for similar issues in other parts of the code
- Examine data flow and state changes
- Review recent commits touching affected areas

### 4. Consider Multiple Angles

Think harder about different potential causes:

- **Data Issue**: Invalid input, edge cases, null/undefined values
- **Logic Error**: Incorrect conditions, off-by-one errors, wrong assumptions
- **Race Condition**: Async/timing issues, concurrent access problems
- **Integration Issue**: API changes, dependency updates, environment differences
- **Configuration**: Missing env vars, incorrect settings, permission issues
- **Resource Issue**: Memory leaks, connection limits, file handles

## Required Output Format

### 🔍 Issue Analysis

**Summary:** _[One sentence describing the actual problem]_

**Error Type:** _[Category: Logic/Data/Integration/Config/Performance/Security]_

**Affected Components:** _[List files/modules/services affected]_

### 🎯 Root Cause

**Found:** _[YES/NO/PARTIAL]_

**Cause:** _[Specific explanation of why this is happening]_

**Evidence:**

- _[Stack trace pointing to file:line]_
- _[Code snippet showing the problem]_
- _[Data or state that triggers it]_

### 🐛 Reproduction Steps

1. _[Step-by-step instructions to reproduce]_
2. _[Include any required data or state]_
3. _[Expected vs actual behavior]_

### 🔧 Fix Options

**Option 1: Immediate Fix**

- **Change:** _[Minimal code change to stop the error]_
- **Location:** `file:line`
- **Risk:** _[Low/Medium/High]_
- **Side effects:** _[Any potential impacts]_

**Option 2: Proper Solution**

- **Change:** _[Correct fix addressing root cause]_
- **Location:** `file:line`
- **Risk:** _[Low/Medium/High]_
- **Testing needed:** _[What to test]_

**Option 3: Defensive Programming**

- **Change:** _[Add validation/guards to prevent recurrence]_
- **Location:** `file:line`
- **Future prevention:** _[How this stops similar bugs]_

### 🛡️ Prevention Strategy

**Why it happened:** _[Process or code gap that allowed this bug]_

**Prevent recurrence:**

- _[Add test case for this scenario]_
- _[Add validation or type checking]_
- _[Update documentation or comments]_
- _[Add logging for better debugging]_

### 💡 Recommendation

**Immediate action:** _[What to do right now]_

**Follow-up:** _[Additional steps after fix is applied]_

### ✅ Verification

After applying the fix, verify:

- [ ] Error no longer occurs
- [ ] No regression in related features
- [ ] Tests pass including new test case
- [ ] Performance unchanged

### 🤔 Next Step?

1. **Apply immediate fix** - Quick resolution
2. **Implement proper solution** - Address root cause
3. **Need more investigation** - Gather additional data
4. **Escalate** - Requires architectural decision

_Please choose 1-4 or provide additional context_
