/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { ISkillsService as ISkillsServiceInterface, SkillDefinition, RawSkillDefinition, SkillsSettings } from '../common/skillsServiceTypes.js';
import { IVoidSettingsService } from '../common/voidSettingsService.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../base/common/event.js';

export const ISkillsService = createDecorator<ISkillsServiceInterface>('SkillsService');

const DEFAULT_GLOBAL_SKILLS_PATH = '.void/skills';
const LOCAL_SKILLS_PATH = '.void/skills';
const SKILL_FILE_EXTENSION = '.skill.json';

export class SkillsService extends Disposable implements ISkillsServiceInterface {
	readonly _serviceBrand: undefined;

	private skills: Map<string, SkillDefinition> = new Map();
	private settings: SkillsSettings = {
		enableSkills: true,
		enableGlobalSkills: true,
		enableLocalSkills: true,
		maxSkills: 100,
	};

	private readonly _onSkillsChanged = this._register(new Emitter<void>());
	public readonly onSkillsChanged = this._onSkillsChanged.event;

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IVoidSettingsService private readonly voidSettingsService: IVoidSettingsService,
	) {
		super();
		this.loadSettings();
		// Load skills asynchronously
		this.loadSkills().catch(err => {
			console.error('[SkillsService] Failed to load skills:', err);
		});
	}

	private loadSettings(): void {
		const state = this.voidSettingsService.state.globalSettings;
		if (state.enableSkills !== undefined) {
			this.settings.enableSkills = state.enableSkills;
		}
		if (state.enableGlobalSkills !== undefined) {
			this.settings.enableGlobalSkills = state.enableGlobalSkills;
		}
		if (state.enableLocalSkills !== undefined) {
			this.settings.enableLocalSkills = state.enableLocalSkills;
		}
		if (state.maxSkills !== undefined) {
			this.settings.maxSkills = state.maxSkills;
		}
		if (state.globalSkillsPath !== undefined) {
			this.settings.globalSkillsPath = state.globalSkillsPath;
		}
	}

	getAllSkills(): SkillDefinition[] {
		return Array.from(this.skills.values());
	}

	getEnabledSkills(): SkillDefinition[] {
		return this.getAllSkills().filter(skill => skill.enabled);
	}

	getSkillById(id: string): SkillDefinition | undefined {
		return this.skills.get(id);
	}

	async loadSkills(): Promise<void> {
		if (!this.settings.enableSkills) {
			return;
		}

		this.skills.clear();

		// Load global skills
		if (this.settings.enableGlobalSkills) {
			await this.loadGlobalSkills();
		}

		// Load local (workspace) skills
		if (this.settings.enableLocalSkills) {
			await this.loadLocalSkills();
		}

		this._onSkillsChanged.fire();
	}

	async reloadSkills(): Promise<void> {
		this.loadSettings();
		await this.loadSkills();
	}

	setSkillEnabled(id: string, enabled: boolean): void {
		const skill = this.skills.get(id);
		if (skill) {
			skill.enabled = enabled;
			this._onSkillsChanged.fire();
		}
	}

	getSettings(): SkillsSettings {
		return { ...this.settings };
	}

	async updateSettings(newSettings: Partial<SkillsSettings>): Promise<void> {
		this.settings = { ...this.settings, ...newSettings };
		
		// Update each setting individually using setGlobalSetting
		if (newSettings.enableSkills !== undefined) {
			await this.voidSettingsService.setGlobalSetting('enableSkills', newSettings.enableSkills);
		}
		if (newSettings.enableGlobalSkills !== undefined) {
			await this.voidSettingsService.setGlobalSetting('enableGlobalSkills', newSettings.enableGlobalSkills);
		}
		if (newSettings.enableLocalSkills !== undefined) {
			await this.voidSettingsService.setGlobalSetting('enableLocalSkills', newSettings.enableLocalSkills);
		}
		if (newSettings.maxSkills !== undefined) {
			await this.voidSettingsService.setGlobalSetting('maxSkills', newSettings.maxSkills);
		}
		if (newSettings.globalSkillsPath !== undefined) {
			await this.voidSettingsService.setGlobalSetting('globalSkillsPath', newSettings.globalSkillsPath);
		}
		
		// Reload skills with new settings
		await this.loadSkills();
	}

	private async loadGlobalSkills(): Promise<void> {
		try {
			const globalSkillsPath = this.settings.globalSkillsPath || DEFAULT_GLOBAL_SKILLS_PATH;
			const userHome = await this.getUserHomeDirectory();
			const globalSkillsUri = URI.joinPath(userHome, globalSkillsPath);

			await this.loadSkillsFromDirectory(globalSkillsUri, 'global');
		} catch (err) {
			console.warn('[SkillsService] Failed to load global skills:', err);
		}
	}

	private async loadLocalSkills(): Promise<void> {
		try {
			const folders = this.workspaceContextService.getWorkspace().folders;
			
			for (const folder of folders) {
				const localSkillsUri = URI.joinPath(folder.uri, LOCAL_SKILLS_PATH);
				await this.loadSkillsFromDirectory(localSkillsUri, 'local');
			}
		} catch (err) {
			console.warn('[SkillsService] Failed to load local skills:', err);
		}
	}

	private async loadSkillsFromDirectory(directoryUri: URI, source: 'global' | 'local'): Promise<void> {
		try {
			// Check if directory exists
			const stat = await this.fileService.stat(directoryUri);
			if (!stat.isDirectory) {
				return;
			}

			// Read directory contents
			const children = await this.fileService.resolve(directoryUri);
			if (!children.children) {
				return;
			}

			// Filter for skill files
			const skillFiles = children.children.filter(child => 
				child.name.endsWith(SKILL_FILE_EXTENSION) && child.isFile
			);

			// Load each skill file
			for (const file of skillFiles) {
				if (this.skills.size >= this.settings.maxSkills) {
					console.warn(`[SkillsService] Reached maximum number of skills (${this.settings.maxSkills})`);
					break;
				}

				try {
					await this.loadSkillFile(file.resource, source);
				} catch (err) {
					console.warn(`[SkillsService] Failed to load skill file ${file.name}:`, err);
				}
			}
		} catch (err) {
			// Directory might not exist, which is fine
			if ((err as any)?.fileOperationResult !== 1) { // FILE_NOT_FOUND
				throw err;
			}
		}
	}

	private async loadSkillFile(fileUri: URI, source: 'global' | 'local'): Promise<void> {
		const content = await this.fileService.readFile(fileUri);
		const rawSkill: RawSkillDefinition = JSON.parse(content.value.toString());

		// Validate required fields
		if (!rawSkill.id || !rawSkill.name || !rawSkill.description || !rawSkill.instructions) {
			throw new Error('Skill definition missing required fields (id, name, description, instructions)');
		}

		// Create skill definition
		const skill: SkillDefinition = {
			id: rawSkill.id,
			name: rawSkill.name,
			description: rawSkill.description,
			version: rawSkill.version,
			author: rawSkill.author,
			tags: rawSkill.tags,
			instructions: rawSkill.instructions,
			examples: rawSkill.examples,
			enabled: rawSkill.enabled !== false, // Default to true
			source,
			uri: fileUri,
		};

		// Add to skills map (later sources override earlier ones with same ID)
		this.skills.set(skill.id, skill);
	}

	private async getUserHomeDirectory(): Promise<URI> {
		// Get user home directory based on platform
		const env = await import('../../../../base/common/platform.js');
		
		if (env.isWindows) {
			const userProfile = process.env.USERPROFILE || process.env.HOME || 'C:\\Users\\Default';
			return URI.file(userProfile);
		} else {
			const home = process.env.HOME || '/tmp';
			return URI.file(home);
		}
	}
}

registerSingleton(ISkillsService, SkillsService, InstantiationType.Eager);
