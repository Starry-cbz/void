# Void Skills

Skills provide specialized capabilities and domain knowledge to the AI assistant. They help the AI follow best practices, use specific patterns, and understand project-specific conventions.

## How It Works

Void automatically loads skills from two locations:

1. **Global Skills**: `~/.void/skills/` (user-wide skills)
2. **Local Skills**: `<workspace>/.void/skills/` (project-specific skills)

Skills are defined as JSON files with the `.skill.json` extension.

## Creating a Skill

Create a file with the `.skill.json` extension in either the global or local skills directory:

```json
{
  "id": "unique-skill-id",
  "name": "Skill Display Name",
  "description": "What this skill does and when to use it",
  "version": "1.0.0",
  "author": "Your Name",
  "tags": ["tag1", "tag2"],
  "instructions": "Detailed instructions for the AI on how to apply this skill",
  "examples": [
    "Example 1 of how to use this skill",
    "Example 2"
  ],
  "enabled": true
}
```

### Required Fields

- `id`: Unique identifier for the skill (use kebab-case)
- `name`: Human-readable name
- `description`: Clear description of what the skill provides
- `instructions`: Specific guidelines the AI should follow

### Optional Fields

- `version`: Version number
- `author`: Creator of the skill
- `tags`: Keywords for categorization
- `examples`: Usage examples to guide the AI
- `enabled`: Whether the skill is active (default: true)

## Example Skills

### TypeScript Best Practices

See `example-typescript.skill.json` for a complete example that enforces TypeScript coding standards.

### Project-Specific Conventions

You can create skills for:
- Coding style guides
- Architecture patterns
- Testing conventions
- Documentation standards
- API design principles
- Security best practices

## Configuration

Skills can be configured in Void settings:

- `enableSkills`: Enable/disable the entire skills system
- `enableGlobalSkills`: Load skills from user's home directory
- `enableLocalSkills`: Load skills from workspace directory
- `maxSkills`: Maximum number of skills to load (default: 100)
- `globalSkillsPath`: Custom path for global skills (default: `~/.void/skills`)

## How Skills Are Used

When you chat with the AI:
1. All enabled skills are loaded and included in the system prompt
2. The AI reads the skill instructions and examples
3. When your request matches a skill's purpose, the AI follows its guidelines
4. Skills work alongside tools and other context to provide better assistance

## Best Practices for Writing Skills

1. **Be Specific**: Clear, actionable instructions work better than vague guidelines
2. **Provide Examples**: Show the AI exactly what you want
3. **Keep It Focused**: Each skill should address one specific area
4. **Use Tags**: Help organize and categorize your skills
5. **Test and Iterate**: Try different instruction formats to see what works best

## Sharing Skills

Skills are just JSON files, so you can:
- Share them with your team via version control
- Create organization-wide skill libraries
- Publish collections of skills for common frameworks or languages
