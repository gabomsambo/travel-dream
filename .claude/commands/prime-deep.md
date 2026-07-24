---
description: Deep context priming with intelligent file discovery and focus area analysis
argument-hint: [focus-area] [specific-concern] (e.g., "frontend" "performance")
---

# Deep Project Priming

**Focus Area:** $1
**Specific Concern:** $2

## Project Discovery Process

### 1. Map the Structure

Run these to understand project layout:

- `tree -L 3 -I 'node_modules|__pycache__|.git|dist|build|coverage'`
- `find . -type d -name "src" -o -name "lib" -o -name "app" | head -10`
- `ls -la`

### 2. Read Foundation Files

Start with these core documents:

- README.md and CLAUDE.md (understand project goals and guidelines)
- Package files (package.json, requirements.txt, go.mod, Cargo.toml)
- Configuration files (._rc, _.config.\*, .env.example)
- Main entry points based on language

### 3. Focus Deep Dive: $1

Based on "$1" focus area, investigate these specific areas:

**If "frontend" or "ui":**

- Find and read main component files
- Identify state management approach
- Check routing configuration
- Review styling system

**If "backend" or "api":**

- Read API route definitions
- Find database models/schemas
- Check middleware setup
- Review service layers

**If "testing":**

- Find test examples
- Identify testing patterns
- Check test configuration
- Review test utilities

**If "performance":**

- Search for caching logic
- Find optimization configs
- Look for monitoring setup
- Check build configurations

**If "security":**

- Find authentication code
- Review authorization logic
- Check input validation
- Look for security configs

**If "database":**

- Read schema definitions
- Find migration files
- Check ORM setup
- Review query patterns

### 4. Address Specific Concern: $2

For "$2", search and read:

- Files containing related keywords
- Similar implementations already in codebase
- Relevant tests or examples
- Documentation about this concern

### 5. Identify Patterns

From your reading, note:

- **Code Style**: How is code organized and formatted?
- **Architecture**: What patterns are being followed?
- **Dependencies**: What libraries are heavily used?
- **Conventions**: Naming, file structure, common approaches

## Summary Report

### 📊 Project Intelligence

**Project Type:** [What kind of project is this?]

**Architecture:** [How is it structured?]

**Tech Stack:** [Languages, frameworks, databases]

**Key Patterns:** [Important patterns to follow]

### 🎯 Focus Area: $1

**Current Implementation:**

- [How this area is currently structured]
- [Key files and their purposes]
- [Dependencies and connections]

**Entry Points for $1:**

- `[Main file to start from]`
- `[Related files to understand]`
- `[Tests to review]`

### 🔍 Specific Concern: $2

**Findings:**

- [Current handling of this concern]
- [Related code locations]
- [Potential improvements]

### 💡 Ready to Work

Based on the deep prime, I understand:

- How to work in the $1 area
- Patterns to follow from `[example files]`
- How to address $2 based on `[existing patterns]`
