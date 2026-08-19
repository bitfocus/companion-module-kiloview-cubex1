import { InstanceStatus } from '@companion-module/base'

export default {
	initActions: function () {
		let self = this
		let actions = {}

		const inputChoicesWithNone = [{ id: 'none', label: '- None (Disconnect) -' }, ...self.CHOICES_INPUTS]

		const runAction = async (description, fn, action = null) => {
			if (!self.DEVICE) {
				self.log('error', `Action "${description}" skipped: not connected to device.`)
				return
			}

			if (!self.canRunPanelAction()) {
				return
			}

			const options = action?.options
			if (options) {
				for (const key of ['output', 'input', 'playlist', 'template']) {
					if (options[key] === undefined) {
						continue
					}
					if (key === 'input' && options[key] === 'none') {
						continue
					}
					if (self.isPlaceholderChoiceId(options[key])) {
						self.log('error', `Action "${description}" skipped: no valid ${key} selected.`)
						return
					}
				}
			}

			try {
				await fn()
				await self.refreshStateAfterAction()
			} catch (error) {
				await self.handleRequestError(error, `Action "${description}" failed`)
			}
		}

		// ------------------------------------------------------------------
		// Routing
		// ------------------------------------------------------------------

		actions.routeInputToOutput = {
			name: 'Route: Set Input Source for Output',
			options: [
				{
					type: 'dropdown',
					label: 'Output',
					id: 'output',
					default: self.CHOICES_OUTPUTS[0].id,
					choices: self.CHOICES_OUTPUTS,
				},
				{
					type: 'dropdown',
					label: 'Input Source',
					id: 'input',
					default: inputChoicesWithNone[0].id,
					choices: inputChoicesWithNone,
				},
			],
			callback: async function (action) {
				let options = action.options
				const input_src_id = options.input === 'none' ? null : parseInt(options.input)
				await runAction(
					'Route Input to Output',
					() => self.DEVICE.setPanelOutputInputSrc(self.STATE.panel_id, parseInt(options.output), input_src_id),
					action,
				)
			},
		}

		actions.clearOutput = {
			name: 'Route: Disconnect Output',
			options: [
				{
					type: 'dropdown',
					label: 'Output',
					id: 'output',
					default: self.CHOICES_OUTPUTS[0].id,
					choices: self.CHOICES_OUTPUTS,
				},
			],
			callback: async function (action) {
				let options = action.options
				await runAction(
					'Disconnect Output',
					() => self.DEVICE.setPanelOutputInputSrc(self.STATE.panel_id, parseInt(options.output), null),
					action,
				)
			},
		}

		actions.routeInputToAllOutputs = {
			name: 'Route: Select Input on All Outputs',
			description: 'Routes the input to all outputs (outputs with an active playlist are skipped)',
			options: [
				{
					type: 'dropdown',
					label: 'Input Source',
					id: 'input',
					default: self.CHOICES_INPUTS[0].id,
					choices: self.CHOICES_INPUTS,
				},
				{
					type: 'dropdown',
					label: 'Select / Deselect',
					id: 'select',
					default: 'select',
					choices: [
						{ id: 'select', label: 'Select on all outputs' },
						{ id: 'deselect', label: 'Deselect from all outputs' },
					],
				},
			],
			callback: async function (action) {
				let options = action.options
				await runAction(
					'Select Input on All Outputs',
					() =>
						self.DEVICE.setPanelInputSrcSelectAll(
							self.STATE.panel_id,
							parseInt(options.input),
							options.select === 'select',
						),
					action,
				)
			},
		}

		// ------------------------------------------------------------------
		// Playlists (carousel rotation lists)
		// ------------------------------------------------------------------

		actions.setOutputPlaylist = {
			name: 'Playlist: Set Playlist for Output',
			options: [
				{
					type: 'dropdown',
					label: 'Output',
					id: 'output',
					default: self.CHOICES_OUTPUTS[0].id,
					choices: self.CHOICES_OUTPUTS,
				},
				{
					type: 'dropdown',
					label: 'Playlist',
					id: 'playlist',
					default: self.CHOICES_ROTATION_LISTS[0].id,
					choices: self.CHOICES_ROTATION_LISTS,
				},
				{
					type: 'checkbox',
					label: 'Loop Playlist',
					id: 'loop',
					default: true,
				},
			],
			callback: async function (action) {
				let options = action.options
				await runAction(
					'Set Playlist for Output',
					() =>
						self.DEVICE.setPanelOutputRotationList(
							self.STATE.panel_id,
							parseInt(options.output),
							parseInt(options.playlist),
							options.loop,
						),
					action,
				)
			},
		}

		actions.stopOutputPlaylist = {
			name: 'Playlist: Stop Playlist on Output',
			options: [
				{
					type: 'dropdown',
					label: 'Output',
					id: 'output',
					default: self.CHOICES_OUTPUTS[0].id,
					choices: self.CHOICES_OUTPUTS,
				},
			],
			callback: async function (action) {
				let options = action.options
				const output = self.getOutputById(options.output)
				const loop = output?.rotation_list_loop ?? true
				await runAction(
					'Stop Playlist on Output',
					() => self.DEVICE.setPanelOutputRotationList(self.STATE.panel_id, parseInt(options.output), null, loop),
					action,
				)
			},
		}

		actions.setOutputPlaylistLoop = {
			name: 'Playlist: Set Playlist Looping for Output',
			options: [
				{
					type: 'dropdown',
					label: 'Output',
					id: 'output',
					default: self.CHOICES_OUTPUTS[0].id,
					choices: self.CHOICES_OUTPUTS,
				},
				{
					type: 'dropdown',
					label: 'Looping',
					id: 'loop',
					default: 'loop',
					choices: [
						{ id: 'loop', label: 'Loop' },
						{ id: 'noloop', label: 'Do Not Loop' },
						{ id: 'toggle', label: 'Toggle' },
					],
				},
			],
			callback: async function (action) {
				let options = action.options

				if (!self.DEVICE || !self.canRunPanelAction()) {
					return
				}

				const output = self.getOutputById(options.output)

				if (!output || output.rotation_list_id === null || output.rotation_list_id === undefined) {
					self.log('warn', 'Output has no active playlist; cannot set looping.')
					return
				}

				let loop = options.loop === 'loop'
				if (options.loop === 'toggle') {
					loop = !(output.rotation_list_loop === true)
				}

				await runAction(
					'Set Playlist Looping',
					() =>
						self.DEVICE.setPanelOutputRotationListLoop(
							self.STATE.panel_id,
							parseInt(options.output),
							output.rotation_list_id,
							loop,
						),
					action,
				)
			},
		}

		// ------------------------------------------------------------------
		// Output lock / favorite
		// ------------------------------------------------------------------

		actions.setOutputLock = {
			name: 'Output: Lock / Unlock Output',
			options: [
				{
					type: 'dropdown',
					label: 'Output',
					id: 'output',
					default: self.CHOICES_OUTPUTS[0].id,
					choices: self.CHOICES_OUTPUTS,
				},
				{
					type: 'dropdown',
					label: 'Lock Mode',
					id: 'mode',
					default: self.CHOICES_LOCK_MODE[0].id,
					choices: self.CHOICES_LOCK_MODE,
				},
			],
			callback: async function (action) {
				let options = action.options

				let lock = options.mode === 'lock'
				if (options.mode === 'toggle') {
					const output = self.getOutputById(options.output)
					lock = !(output?.lock === true)
				}

				await runAction(
					'Lock/Unlock Output',
					() => self.DEVICE.setPanelOutputLock(self.STATE.panel_id, parseInt(options.output), lock),
					action,
				)
			},
		}

		actions.setOutputCollect = {
			name: 'Output: Favorite / Unfavorite Output',
			options: [
				{
					type: 'dropdown',
					label: 'Output',
					id: 'output',
					default: self.CHOICES_OUTPUTS[0].id,
					choices: self.CHOICES_OUTPUTS,
				},
				{
					type: 'dropdown',
					label: 'Favorite Mode',
					id: 'mode',
					default: self.CHOICES_COLLECT_MODE[0].id,
					choices: self.CHOICES_COLLECT_MODE,
				},
			],
			callback: async function (action) {
				let options = action.options

				let collect = options.mode === 'collect'
				if (options.mode === 'toggle') {
					const output = self.getOutputById(options.output)
					collect = !(output?.collect === true)
				}

				await runAction(
					'Favorite/Unfavorite Output',
					() => self.DEVICE.setPanelOutputCollect(self.STATE.panel_id, parseInt(options.output), collect),
					action,
				)
			},
		}

		// ------------------------------------------------------------------
		// Templates
		// ------------------------------------------------------------------

		actions.switchTemplate = {
			name: 'Template: Switch to Template',
			options: [
				{
					type: 'dropdown',
					label: 'Template',
					id: 'template',
					default: self.CHOICES_TEMPLATES[0].id,
					choices: self.CHOICES_TEMPLATES,
				},
				{
					type: 'checkbox',
					label: 'Save Current Template before Switching',
					id: 'save',
					default: false,
				},
			],
			callback: async function (action) {
				let options = action.options
				const current = self.getActiveTemplate()

				if (!current) {
					self.log('error', 'Cannot switch templates: no active template found.')
					return
				}

				await runAction(
					'Switch Template',
					() => self.DEVICE.switchTemplate(self.STATE.panel_id, current.id, parseInt(options.template), options.save),
					action,
				)
			},
		}

		actions.saveCurrentTemplate = {
			name: 'Template: Save Current Template',
			description: 'Saves the current panel state into the active template',
			options: [],
			callback: async function () {
				const current = self.getActiveTemplate()

				if (!current) {
					self.log('error', 'Cannot save template: no active template found.')
					return
				}

				await runAction('Save Current Template', () => self.DEVICE.saveCurrentTemplate(self.STATE.panel_id, current.id))
			},
		}

		actions.saveAsNewTemplate = {
			name: 'Template: Save Template As',
			options: [
				{
					type: 'textinput',
					label: 'New Template Name',
					id: 'name',
					default: '',
					useVariables: true,
				},
			],
			callback: async function (action) {
				const current = self.getActiveTemplate()

				if (!current) {
					self.log('error', 'Cannot save template: no active template found.')
					return
				}

				const name = action.options.name

				if (!name) {
					self.log('error', 'Cannot save template: no template name given.')
					return
				}

				await runAction('Save Template As', () => self.DEVICE.saveAsNewTemplate(self.STATE.panel_id, current.id, name))
			},
		}

		actions.addTemplate = {
			name: 'Template: Add Template',
			options: [
				{
					type: 'textinput',
					label: 'Template Name',
					id: 'name',
					default: '',
					useVariables: true,
				},
			],
			callback: async function (action) {
				const name = action.options.name

				if (!name) {
					self.log('error', 'Cannot add template: no template name given.')
					return
				}

				await runAction('Add Template', () => self.DEVICE.addTemplate(self.STATE.panel_id, name))
			},
		}

		actions.deleteTemplate = {
			name: 'Template: Delete Template',
			options: [
				{
					type: 'dropdown',
					label: 'Template',
					id: 'template',
					default: self.CHOICES_TEMPLATES[0].id,
					choices: self.CHOICES_TEMPLATES,
				},
			],
			callback: async function (action) {
				let options = action.options
				await runAction(
					'Delete Template',
					() => self.DEVICE.deleteTemplate(self.STATE.panel_id, parseInt(options.template)),
					action,
				)
			},
		}

		actions.undoTemplateOperation = {
			name: 'Template: Undo Last Operation',
			options: [],
			callback: async function () {
				const current = self.getActiveTemplate()

				if (!current) {
					self.log('error', 'Cannot undo: no active template found.')
					return
				}

				await runAction('Undo Template Operation', () =>
					self.DEVICE.cancelTemplateOperate(self.STATE.panel_id, current.id),
				)
			},
		}

		// ------------------------------------------------------------------
		// System
		// ------------------------------------------------------------------

		actions.refreshStatus = {
			name: 'System: Refresh Device Status',
			options: [],
			callback: async function () {
				if (!self.DEVICE) {
					self.log('error', 'Refresh skipped: not connected to device.')
					return
				}

				await self.checkSystemInfo()
				await self.refreshStateAfterAction()
			},
		}

		actions.reboot = {
			name: 'System: Reboot Device',
			options: [],
			callback: async function () {
				if (!self.DEVICE) {
					self.log('error', 'Reboot skipped: not connected to device.')
					return
				}

				try {
					await self.DEVICE.reboot()
					self.log('info', 'Reboot command sent. Device will restart.')
					self.stopIntervals()
					self.updateStatus(InstanceStatus.ConnectionFailure, 'Device rebooting')
					self.startReconnectInterval()
				} catch (error) {
					await self.handleRequestError(error, 'Error rebooting device')
				}
			},
		}

		self.setActionDefinitions(actions)
	},
}
