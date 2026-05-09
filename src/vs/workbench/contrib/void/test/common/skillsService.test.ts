/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { strict as assert } from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { SkillDefinition } from '../../common/skillsServiceTypes.js';

suite('SkillsService', () => {
	test('should create valid skill definition', () => {
		const skill: SkillDefinition = {
			id: 'test-skill',
			name: 'Test Skill',
			description: 'A test skill',
			instructions: 'Test instructions',
			enabled: true,
			source: 'local',
			uri: URI.file('/test/path/test.skill.json'),
		};

		assert.equal(skill.id, 'test-skill');
		assert.equal(skill.name, 'Test Skill');
		assert.equal(skill.enabled, true);
		assert.equal(skill.source, 'local');
	});

	test('should handle optional fields', () => {
		const skill: SkillDefinition = {
			id: 'minimal-skill',
			name: 'Minimal Skill',
			description: 'Minimal description',
			instructions: 'Minimal instructions',
			enabled: true,
			source: 'global',
			uri: URI.file('/global/skills/minimal.skill.json'),
			version: '1.0.0',
			author: 'Test Author',
			tags: ['test', 'minimal'],
			examples: ['Example 1', 'Example 2'],
		};

		assert.equal(skill.version, '1.0.0');
		assert.equal(skill.author, 'Test Author');
		assert.deepEqual(skill.tags, ['test', 'minimal']);
		assert.deepEqual(skill.examples, ['Example 1', 'Example 2']);
	});

	test('should distinguish between global and local skills', () => {
		const globalSkill: SkillDefinition = {
			id: 'global-skill',
			name: 'Global Skill',
			description: 'Available globally',
			instructions: 'Global instructions',
			enabled: true,
			source: 'global',
			uri: URI.file('/home/user/.void/skills/global.skill.json'),
		};

		const localSkill: SkillDefinition = {
			id: 'local-skill',
			name: 'Local Skill',
			description: 'Workspace specific',
			instructions: 'Local instructions',
			enabled: true,
			source: 'local',
			uri: URI.file('/workspace/.void/skills/local.skill.json'),
		};

		assert.equal(globalSkill.source, 'global');
		assert.equal(localSkill.source, 'local');
	});
});
