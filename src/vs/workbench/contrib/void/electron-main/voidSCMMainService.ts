/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { promisify } from 'util'
import { execFile as _execFile } from 'child_process'
import { IVoidSCMService } from '../common/voidSCMTypes.js'
import { getGitSampledDiffs, RunGit } from '../common/gitDiffSampling.js'

const execFile = promisify(_execFile)

//8000 and 10 were chosen after some experimentation on small-to-moderately sized changes
const MAX_DIFF_LENGTH = 8000
const MAX_DIFF_FILES = 10

const git: RunGit = async (args, path, options): Promise<string> => {
	try {
		const { stdout } = await execFile('git', args, { cwd: path, maxBuffer: 20 * 1024 * 1024 })
		return options?.trim === false ? stdout : stdout.trim()
	} catch (error) {
		const err = error as NodeJS.ErrnoException & { stderr?: string; stdout?: string; code?: number | string | null }
		const stderr = err.stderr?.toString()
		const message = stderr && stderr.trim().length > 0 ? stderr : (err.message ?? 'git command failed')
		throw new Error(message)
	}
}

const hasStagedChanges = async (path: string): Promise<boolean> => {
	const output = await git(['diff', '--staged', '--name-only'], path)
	return output.length > 0
}

export class VoidSCMService implements IVoidSCMService {
	readonly _serviceBrand: undefined

	async gitStat(path: string): Promise<string> {
		const useStagedChanges = await hasStagedChanges(path)
		return git(['diff', '--stat', ...(useStagedChanges ? ['--staged'] : [])], path)
	}

	async gitSampledDiffs(path: string): Promise<string> {
		const useStagedChanges = await hasStagedChanges(path)
		return getGitSampledDiffs({
			cwd: path,
			useStagedChanges,
			maxFiles: MAX_DIFF_FILES,
			maxDiffLength: MAX_DIFF_LENGTH,
			runGit: git,
		})
	}

	gitBranch(path: string): Promise<string> {
		return git(['branch', '--show-current'], path)
	}

	gitLog(path: string): Promise<string> {
		return git(['log', '--pretty=format:%h|%s|%ad', '--date=short', '--no-merges', '-n', '5'], path)
	}
}
