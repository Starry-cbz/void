# Void Skills System - Complete Guide

## Overview

The Skills system in Void provides a powerful way to customize AI behavior with specialized knowledge, best practices, and project-specific conventions. Skills are loaded automatically and included in the AI's system prompt to guide its responses.

## Architecture

### Core Components

1. **SkillsService** (`browser/skillsService.ts`)
   - Manages loading, storing, and retrieving skills
   - Handles both global and local skill sources
   - Provides enable/disable functionality

2. **Skill Definitions** (`common/skillsServiceTypes.ts`)
   - Type definitions for skills
   - Settings interface for configuration

3. **Prompt Integration** (`common/prompt/prompts.ts`)
   - `buildSkillsPrompt()` function formats skills for AI consumption
   - Integrated into `chat_systemMessage()`

4. **Settings** (`common/voidSettingsTypes.ts`)
   - Global settings for enabling/disabling skills
   - Configuration for skill sources and limits

5. **Actions** (`browser/skillsActions.ts`)
   - Commands to reload and manage skills
   - Quick pick interface for toggling skills

## File Structure

```text
src/vs/workbench/contrib/void/
├── common/
│   ├── skillsServiceTypes.ts      # Type definitions
│   └── prompt/
│       └── prompts.ts             # Prompt integration
├── browser/
│   ├── skillsService.ts           # Main service implementation
│   └── skillsActions.ts           # VS Code commands
└── test/
    └── common/
        └── skillsService.test.ts  # Unit tests

.void/skills/                      # Local (workspace) skills directory
├── README.md                      # User documentation
├── TEMPLATE.skill.json            # Template for new skills
├── example-typescript.skill.json  # Example skill
├── react-patterns.skill.json      # React best practices
└── git-workflow.skill.json        # Git workflow guidelines
```

## How It Works

### 1. Skill Loading Process

```text
Application Start
    ↓
SkillsService initialized
    ↓
Load settings from VoidSettingsService
    ↓
If skills enabled:
    ├─→ Load global skills (~/.void/skills/)
    └─→ Load local skills (<workspace>/.void/skills/)
    ↓
Parse .skill.json files
    ↓
Validate required fields
    ↓
Store in Map<id, SkillDefinition>
    ↓
Fire onSkillsChanged event
```

### 2. Integration with Chat

```text
User sends message
    ↓
ConvertToLLMMessageService._generateChatMessagesSystemMessage()
    ↓
Check if skills enabled in settings
    ↓
Get enabled skills from SkillsService
    ↓
Pass skills to chat_systemMessage()
    ↓
buildSkillsPrompt() formats skills
    ↓
Include in system message sent to LLM
```

### 3. Prompt Format

Skills are formatted as:

```xml
<available_skills>
You have access to the following skills that provide specialized capabilities and domain knowledge:

1. **Skill Name** (skill-id)
   Description: What it does
   Instructions: Detailed guidelines
   Examples:
     - Example 1
     - Example 2
   Tags: tag1, tag2
   Source: Global/Workspace skill

## How to use skills:
- When a task matches a skill's description, follow the skill's instructions
- Skills provide best practices, patterns, and guidelines for specific tasks
- You can combine multiple skills when appropriate
- Always prioritize skill instructions over general guidelines when applicable
</available_skills>
```

## Creating Skills

### Required Fields

- `id`: Unique identifier (kebab-case recommended)
- `name`: Human-readable name
- `description`: Clear explanation of purpose
- `instructions`: Specific guidelines for the AI

### Optional Fields

- `version`: Semantic versioning
- `author`: Creator information
- `tags`: Categorization keywords
- `examples`: Usage examples (highly recommended)
- `enabled`: Default state (default: true)

### Best Practices

1. **Be Specific**: Vague instructions lead to inconsistent results
2. **Provide Examples**: Show exactly what you want
3. **Focus on One Area**: Each skill should address a specific domain
4. **Use Numbered Lists**: Easier for AI to follow
5. **Include Edge Cases**: Help AI handle unusual situations

## Example Skills

### TypeScript Best Practices

```json
{
  "id": "typescript-best-practices",
  "name": "TypeScript Best Practices",
  "description": "Guidelines for writing type-safe TypeScript code",
  "instructions": "When writing TypeScript:\n1. Use explicit types\n2. Prefer interfaces over types\n3. Enable strict mode\n4. Avoid 'any' type\n5. Use generics appropriately",
  "examples": [
    "interface User { id: number; name: string }",
    "function identity<T>(arg: T): T { return arg; }"
  ]
}
```

### Project-Specific Conventions

```json
{
  "id": "project-api-conventions",
  "name": "API Design Conventions",
  "description": "Our team's standards for REST API design",
  "instructions": "When designing APIs:\n1. Use kebab-case for URLs\n2. Return proper HTTP status codes\n3. Include request IDs in responses\n4. Version all endpoints (/api/v1/)\n5. Document all error responses",
  "tags": ["api", "rest", "conventions"]
}
```

## Configuration

### Global Settings

Access via Void settings or `settings.json`:

```json
{
  "void.enableSkills": true,
  "void.enableGlobalSkills": true,
  "void.enableLocalSkills": true,
  "void.maxSkills": 100,
  "void.globalSkillsPath": "~/.void/skills"
}
```

### Commands

- **Void: Reload Skills** - Reload all skills from disk
- **Void: Manage Skills** - Toggle skills on/off via quick pick

## Use Cases

### 1. Coding Standards

Enforce team coding conventions:

- Naming conventions
- File organization
- Comment styles
- Error handling patterns

### 2. Framework Guidelines

Framework-specific best practices:

- React hooks usage
- Angular module structure
- Vue composition API
- Next.js routing patterns

### 3. Security Practices

Security-focused guidelines:

- Input validation
- Authentication patterns
- Data encryption
- Secure API design

### 4. Testing Strategies

Testing conventions:

- Unit test structure
- Mocking strategies
- Integration test patterns
- Test naming conventions

### 5. Documentation Standards

Documentation requirements:

- JSDoc/TSDoc format
- README templates
- API documentation
- Code comment guidelines

## Advanced Features

### Skill Priority

When multiple skills apply:

1. More specific skills take precedence
2. Later-loaded skills override earlier ones with same ID
3. Local skills override global skills with same ID

### Dynamic Updates

Skills can be updated without restarting:

1. Edit `.skill.json` file
2. Run "Void: Reload Skills" command
3. Changes apply immediately to new conversations

### Conditional Skills

Future enhancement possibilities:

- Skills activated by file type
- Skills triggered by specific keywords
- Skills based on project structure
- Time-based skill activation

## Troubleshooting

### Skills Not Loading

1. Check if skills are enabled in settings
2. Verify `.skill.json` files are valid JSON
3. Ensure required fields are present
4. Check console for error messages
5. Verify file permissions

### Skills Not Applied

1. Confirm skill is enabled (check via "Manage Skills")
2. Review skill instructions for clarity
3. Check if skill description matches your query
4. Try reloading skills
5. Verify skill source (global vs local)

### Performance Issues

1. Reduce number of active skills
2. Shorten skill instructions
3. Remove unnecessary examples
4. Increase `maxSkills` limit if needed

## Future Enhancements

Potential improvements:

1. **Skill Marketplace**: Share and discover skills
2. **Skill Dependencies**: Skills that require other skills
3. **Skill Versioning**: Automatic updates and compatibility
4. **Skill Analytics**: Track which skills are most useful
5. **AI-Generated Skills**: Create skills from examples
6. **Context-Aware Skills**: Auto-activate based on context
7. **Skill Templates**: Pre-built skill collections
8. **Skill Validation**: Automated testing of skill effectiveness

## Contributing

To contribute skills to the community:

1. Create well-documented `.skill.json` files
2. Include comprehensive examples
3. Test with various scenarios
4. Share via GitHub or community channels
5. Follow semantic versioning

## Support

For issues or questions:

1. Check this documentation
2. Review example skills in `.void/skills/`
3. Examine console logs for errors
4. Report issues on GitHub
5. Join community discussions
