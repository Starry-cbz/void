/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';

/**
 * Skill definition structure
 */
export interface SkillDefinition {
	/** Unique identifier for the skill */
	id: string;
	/** Display name of the skill */
	name: string;
	/** Description of what the skill does */
	description: string;
	/** Version of the skill */
	version?: string;
	/** Author of the skill */
	author?: string;
	/** Category or tags for the skill */
	tags?: string[];
	/** Instructions/prompt for the AI on how to use this skill */
	instructions: string;
	/** Example usage (optional) */
	examples?: string[];
	/** Whether the skill is enabled */
	enabled: boolean;
	/** Source location (global or local path) */
	source: 'global' | 'local';
	/** File URI where the skill is defined */
	uri: URI;
}

/**
 * Raw skill definition as read from JSON file
 */
export interface RawSkillDefinition {
	id: string;
	name: string;
	description: string;
	version?: string;
	author?: string;
	tags?: string[];
	instructions: string;
	examples?: string[];
	enabled?: boolean;
}

/**
 * Settings for skills system
 */
export interface SkillsSettings {
	/** Enable or disable skills system */
	enableSkills: boolean;
	/** Enable global skills */
	enableGlobalSkills: boolean;
	/** Enable local (workspace) skills */
	enableLocalSkills: boolean;
	/** Maximum number of skills to load */
	maxSkills: number;
	/** Custom global skills directory path (optional) */
	globalSkillsPath?: string;
}

/**
 * Service interface for managing skills
 */
export interface ISkillsService {
	readonly _serviceBrand: undefined;
	
	/** Get all available skills */
	getAllSkills(): SkillDefinition[];
	
	/** Get enabled skills only */
	getEnabledSkills(): SkillDefinition[];
	
	/** Get a specific skill by ID */
	getSkillById(id: string): SkillDefinition | undefined;
	
	/** Load skills from global and local sources */
	loadSkills(): Promise<void>;
	
	/** Reload skills (useful after changes) */
	reloadSkills(): Promise<void>;
	
	/** Enable or disable a skill */
	setSkillEnabled(id: string, enabled: boolean): void;
	
	/** Get skills settings */
	getSettings(): SkillsSettings;
	
	/** Update skills settings */
	updateSettings(settings: Partial<SkillsSettings>): void;
}
