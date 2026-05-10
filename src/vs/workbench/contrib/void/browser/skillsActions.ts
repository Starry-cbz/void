/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ISkillsService } from './skillsService.js';
import { VOID_RELOAD_SKILLS_ACTION_ID, VOID_LIST_SKILLS_ACTION_ID } from './actionIDs.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { localize } from '../../../../nls.js';

// Reload skills action
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: VOID_RELOAD_SKILLS_ACTION_ID,
			title: { value: localize('void.reloadSkills', "Void: Reload Skills"), original: 'Void: Reload Skills' },
			category: { value: localize('void.category', "Void"), original: 'Void' },
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const skillsService = accessor.get(ISkillsService);
		const notificationService = accessor.get(INotificationService);

		try {
			await skillsService.reloadSkills();
			const skillCount = skillsService.getAllSkills().length;
			const enabledCount = skillsService.getEnabledSkills().length;
			notificationService.info(`Skills reloaded: ${enabledCount}/${skillCount} enabled`);
		} catch (error) {
			notificationService.error(`Failed to reload skills: ${error}`);
		}
	}
});

// List and manage skills action
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: VOID_LIST_SKILLS_ACTION_ID,
			title: { value: localize('void.manageSkills', "Void: Manage Skills"), original: 'Void: Manage Skills' },
			category: { value: localize('void.category', "Void"), original: 'Void' },
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const skillsService = accessor.get(ISkillsService);
		const quickInputService = accessor.get(IQuickInputService);
		const notificationService = accessor.get(INotificationService);

		const allSkills = skillsService.getAllSkills();
		
		if (allSkills.length === 0) {
			notificationService.info('No skills found. Create .skill.json files in .void/skills/ directory.');
			return;
		}

		const items: IQuickPickItem[] = allSkills.map(skill => ({
			label: `${skill.enabled ? '✓' : '○'} ${skill.name}`,
			description: skill.id,
			detail: skill.description,
			picked: skill.enabled,
		}));

		const selected = await quickInputService.pick(items, {
			placeHolder: 'Toggle skills on/off',
			canPickMany: true,
		});

		if (selected) {
			const selectedIds = new Set(selected.map(s => s.description!));
			
			for (const skill of allSkills) {
				const shouldBeEnabled = selectedIds.has(skill.id);
				if (skill.enabled !== shouldBeEnabled) {
					skillsService.setSkillEnabled(skill.id, shouldBeEnabled);
				}
			}

			const enabledCount = skillsService.getEnabledSkills().length;
			notificationService.info(`Updated skills: ${enabledCount}/${allSkills.length} enabled`);
		}
	}
});
