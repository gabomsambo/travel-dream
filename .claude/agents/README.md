# Subagents Library

This is a library of specialized AI subagents for Claude Code that operate in isolated contexts for focused task execution.

## What Are Subagents?

Subagents are essentially **system prompts** that launch new AI agents with specialized roles. The key difference from command prompts is:
- **Subagents**: System prompts that create new agent instances with isolated contexts
- **Commands**: User prompts that execute within the current conversation

While subagents are a Claude Code-specific feature, these prompts can be used with any AI coding assistant - simply copy the system prompt content and use it as a regular prompt. It won't have the isolated context or automatic delegation features of Claude Code, but the specialized instructions and workflows will still guide any AI to perform the intended tasks.

## Critical: Understanding Subagent Communication

When writing subagent prompts, remember this communication flow:
1. **User** → prompts → **Main Agent**
2. **Main Agent** → prompts → **Subagent** (using your system prompt)
3. **Subagent** → responds → **Main Agent**

**You never directly prompt the subagent** - the main agent does. This means your subagent system prompt must:
- **Define expected inputs**: What the main agent might ask for
- **Structure output format**: How to respond back to the main agent
- **Preserve information**: Ensure no critical details are lost in responses

This is especially important for research/analysis subagents - they must have clear output structures (lists, sections, summaries) to ensure all discovered information reaches the main agent. Without defined output formats, subagents may inadvertently filter out important findings.

**Key principle:** Write subagent prompts assuming you won't control how they're invoked, only how they respond.

## Powerful Combination: Commands + Subagents

A powerful pattern in Claude Code is combining slash commands with subagents. You can invoke subagents from within slash commands by using `@` followed by the agent's relative path. For example:
- `@codebase-analysts/codebase-analyst` - Invokes the codebase analyst subagent
- `@core-dev/code-reviewer` - Invokes the code reviewer subagent

This allows you to create detailed workflow commands that orchestrate multiple specialized agents at specific points in the workflow, combining the reusability of commands with the specialized expertise of subagents.

## How to Use

1. Create a `.claude/agents/` directory in your repository
2. Copy one or more agent files (or entire folders) from this library into your `.claude/agents/` directory
3. Agents become available for automatic delegation in Claude Code
4. You can also create your own custom agent prompts as markdown files
5. For other AI coding assistants, copy the system prompt content and use it as a regular prompt

## Important Note

These subagents are written as **general-purpose templates** that work across different tech stacks. While they're ready to use as-is, they'll perform significantly better when customized for your specific:
- Tech stack and frameworks
- Project structure and patterns
- Coding standards and conventions
- Development tools and workflows
- Team preferences and requirements

**Recommendation:** Before using, adapt the agents to match your project's specific technologies and patterns.

## Subagent Categories

- **architecture** - System design, planning, and migration strategies
- **codebase-analysts** - Deep codebase exploration and pattern analysis for features
- **core-dev** - Code review, debugging, testing, performance, and refactoring
- **data-operations** - Database architecture and data management
- **devops** - CI/CD orchestration and error detection
- **documentation** - Automated documentation generation
- **project-management** - Sprint planning and task organization
- **pydantic-ai** - Specialized agents for Pydantic AI framework development
- **quality-assurance** - Security audits, test generation, and dependency analysis
- **agent-architect.md** - Meta-agent that creates new subagents