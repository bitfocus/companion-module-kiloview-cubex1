const { combineRgb } = require('@companion-module/base')

module.exports = {
	initPresets: function () {
		let self = this
		let presets = {}
		let structure = []

		const colorWhite = combineRgb(255, 255, 255)
		const colorBlack = combineRgb(0, 0, 0)
		const colorRed = combineRgb(255, 0, 0)
		const colorGreen = combineRgb(0, 255, 0)
		const colorBlue = combineRgb(0, 0, 255)
		const colorOrange = combineRgb(255, 165, 0)

		const hasInputs = self.STATE.inputs.length > 0
		const hasOutputs = self.STATE.outputs.length > 0

		// ------------------------------------------------------------------
		// General
		// ------------------------------------------------------------------

		presets.refresh_status = {
			type: 'simple',
			name: 'Refresh Device Status',
			style: {
				text: 'Refresh',
				size: '14',
				color: colorWhite,
				bgcolor: colorBlue,
			},
			steps: [
				{
					down: [
						{
							actionId: 'refreshStatus',
							options: {},
						},
					],
					up: [],
				},
			],
			feedbacks: [],
		}

		presets.reboot = {
			type: 'simple',
			name: 'Reboot Device',
			style: {
				text: 'Reboot',
				size: '14',
				color: colorWhite,
				bgcolor: colorRed,
			},
			steps: [
				{
					down: [
						{
							actionId: 'reboot',
							options: {},
						},
					],
					up: [],
				},
			],
			feedbacks: [],
		}

		presets.undo_template = {
			type: 'simple',
			name: 'Undo Last Template Operation',
			style: {
				text: 'Undo',
				size: '14',
				color: colorWhite,
				bgcolor: colorBlack,
			},
			steps: [
				{
					down: [
						{
							actionId: 'undoTemplateOperation',
							options: {},
						},
					],
					up: [],
				},
			],
			feedbacks: [],
		}

		structure.push({
			id: 'general',
			name: 'General',
			definitions: ['refresh_status', 'reboot', 'undo_template'],
		})

		// ------------------------------------------------------------------
		// Info
		// ------------------------------------------------------------------

		const infoPresets = [
			{ id: 'info_sn', name: 'Device Serial Number', text: 'SN:\n$(kiloview-cubex1:serial_number)' },
			{ id: 'info_version', name: 'Firmware Version', text: 'Version:\n$(kiloview-cubex1:firmware_version)' },
			{ id: 'info_cpu', name: 'CPU Usage', text: 'CPU:\n$(kiloview-cubex1:cpu)' },
			{ id: 'info_memory', name: 'Memory Usage', text: 'Mem:\n$(kiloview-cubex1:memory)' },
			{ id: 'info_uptime', name: 'Device Uptime', text: 'Uptime:\n$(kiloview-cubex1:uptime)' },
			{
				id: 'info_io_count',
				name: 'Input / Output Count',
				text: 'In: $(kiloview-cubex1:input_count)\nOut: $(kiloview-cubex1:output_count)',
			},
			{ id: 'info_active_template', name: 'Active Template', text: 'Template:\n$(kiloview-cubex1:active_template)' },
		]

		for (const infoPreset of infoPresets) {
			presets[infoPreset.id] = {
				type: 'simple',
				name: infoPreset.name,
				style: {
					text: infoPreset.text,
					size: 'auto',
					color: colorWhite,
					bgcolor: colorBlack,
				},
				steps: [],
				feedbacks: [],
			}
		}

		structure.push({
			id: 'info',
			name: 'Info',
			definitions: infoPresets.map((infoPreset) => infoPreset.id),
		})

		// ------------------------------------------------------------------
		// Routing: one group per output, with a button per input
		// ------------------------------------------------------------------

		if (hasInputs && hasOutputs) {
			const routingGroups = []

			for (const output of self.STATE.outputs) {
				const outputLabel = output.alias || output.name || `Output ${output.id}`
				const groupPresets = []

				for (const input of self.STATE.inputs) {
					const inputLabel = input.alias || input.name || `Input ${input.id}`
					const presetId = `route_${output.id}_${input.id}`

					presets[presetId] = {
						type: 'simple',
						name: `Route ${inputLabel} to ${outputLabel}`,
						style: {
							text: inputLabel,
							size: '14',
							color: colorWhite,
							bgcolor: colorBlack,
						},
						steps: [
							{
								down: [
									{
										actionId: 'routeInputToOutput',
										options: {
											output: output.id,
											input: input.id,
										},
									},
								],
								up: [],
							},
						],
						feedbacks: [
							{
								feedbackId: 'outputRoutedFromInput',
								options: {
									output: output.id,
									input: input.id,
								},
								style: {
									color: colorWhite,
									bgcolor: colorRed,
								},
							},
						],
					}

					groupPresets.push(presetId)
				}

				const disconnectId = `route_${output.id}_disconnect`

				presets[disconnectId] = {
					type: 'simple',
					name: `Disconnect ${outputLabel}`,
					style: {
						text: 'Disconnect',
						size: '14',
						color: colorWhite,
						bgcolor: colorBlack,
					},
					steps: [
						{
							down: [
								{
									actionId: 'clearOutput',
									options: {
										output: output.id,
									},
								},
							],
							up: [],
						},
					],
					feedbacks: [
						{
							feedbackId: 'outputDisconnected',
							options: {
								output: output.id,
							},
							style: {
								color: colorWhite,
								bgcolor: colorOrange,
							},
						},
					],
				}

				groupPresets.push(disconnectId)

				routingGroups.push({
					id: `route_${output.id}`,
					type: 'simple',
					name: `Route to ${outputLabel}`,
					presets: groupPresets,
				})
			}

			structure.push({
				id: 'routing',
				name: 'Routing',
				definitions: routingGroups,
			})
		}

		// ------------------------------------------------------------------
		// Outputs: lock / favorite toggles and current state
		// ------------------------------------------------------------------

		if (hasOutputs) {
			const lockPresetIds = []
			const statusPresetIds = []

			for (let i = 0; i < self.STATE.outputs.length; i++) {
				const output = self.STATE.outputs[i]
				const idx = i + 1
				const outputLabel = output.alias || output.name || `Output ${output.id}`

				const lockId = `lock_${output.id}`

				presets[lockId] = {
					type: 'simple',
					name: `Toggle Lock: ${outputLabel}`,
					style: {
						text: `Lock\n${outputLabel}`,
						size: '14',
						color: colorWhite,
						bgcolor: colorBlack,
					},
					steps: [
						{
							down: [
								{
									actionId: 'setOutputLock',
									options: {
										output: output.id,
										mode: 'toggle',
									},
								},
							],
							up: [],
						},
					],
					feedbacks: [
						{
							feedbackId: 'outputLocked',
							options: {
								output: output.id,
							},
							style: {
								color: colorWhite,
								bgcolor: colorRed,
							},
						},
					],
				}

				lockPresetIds.push(lockId)

				const statusId = `output_status_${output.id}`

				presets[statusId] = {
					type: 'simple',
					name: `Current Source: ${outputLabel}`,
					style: {
						text: `${outputLabel}:\n$(kiloview-cubex1:output_${idx}_input)`,
						size: 'auto',
						color: colorWhite,
						bgcolor: colorBlack,
					},
					steps: [],
					feedbacks: [
						{
							feedbackId: 'outputDisconnected',
							options: {
								output: output.id,
							},
							style: {
								color: colorWhite,
								bgcolor: colorOrange,
							},
						},
					],
				}

				statusPresetIds.push(statusId)
			}

			structure.push({
				id: 'outputs',
				name: 'Outputs',
				definitions: [
					{
						id: 'output_lock',
						type: 'simple',
						name: 'Output Lock',
						presets: lockPresetIds,
					},
					{
						id: 'output_status',
						type: 'simple',
						name: 'Output Status',
						presets: statusPresetIds,
					},
				],
			})
		}

		// ------------------------------------------------------------------
		// Inputs: availability status
		// ------------------------------------------------------------------

		if (hasInputs) {
			const inputPresetIds = []

			for (const input of self.STATE.inputs) {
				const inputLabel = input.alias || input.name || `Input ${input.id}`
				const presetId = `input_status_${input.id}`

				presets[presetId] = {
					type: 'simple',
					name: `Input Available: ${inputLabel}`,
					style: {
						text: inputLabel,
						size: '14',
						color: colorWhite,
						bgcolor: colorBlack,
					},
					steps: [],
					feedbacks: [
						{
							feedbackId: 'inputAvailable',
							options: {
								input: input.id,
								compare: 'available',
							},
							style: {
								color: colorWhite,
								bgcolor: colorGreen,
							},
						},
						{
							feedbackId: 'inputAvailable',
							options: {
								input: input.id,
								compare: 'unavailable',
							},
							style: {
								color: colorWhite,
								bgcolor: colorRed,
							},
						},
					],
				}

				inputPresetIds.push(presetId)
			}

			structure.push({
				id: 'inputs',
				name: 'Input Status',
				definitions: inputPresetIds,
			})
		}

		// ------------------------------------------------------------------
		// Templates
		// ------------------------------------------------------------------

		const templatePresetIds = []

		for (const template of self.STATE.templates) {
			const presetId = `template_${template.id}`

			presets[presetId] = {
				type: 'simple',
				name: `Switch to Template: ${template.name}`,
				style: {
					text: template.name,
					size: '14',
					color: colorWhite,
					bgcolor: colorBlack,
				},
				steps: [
					{
						down: [
							{
								actionId: 'switchTemplate',
								options: {
									template: template.id,
									save: false,
								},
							},
						],
						up: [],
					},
				],
				feedbacks: [
					{
						feedbackId: 'templateActive',
						options: {
							template: template.id,
						},
						style: {
							color: colorWhite,
							bgcolor: colorRed,
						},
					},
				],
			}

			templatePresetIds.push(presetId)
		}

		presets.save_current_template = {
			type: 'simple',
			name: 'Save Current Template',
			style: {
				text: 'Save\nTemplate',
				size: '14',
				color: colorWhite,
				bgcolor: colorBlack,
			},
			steps: [
				{
					down: [
						{
							actionId: 'saveCurrentTemplate',
							options: {},
						},
					],
					up: [],
				},
			],
			feedbacks: [],
		}

		templatePresetIds.push('save_current_template')

		structure.push({
			id: 'templates',
			name: 'Templates',
			definitions: templatePresetIds,
		})

		// ------------------------------------------------------------------
		// Playlists: assign each playlist to each output
		// ------------------------------------------------------------------

		if (hasOutputs && self.STATE.rotation_lists.length > 0) {
			const playlistGroups = []

			for (const output of self.STATE.outputs) {
				const outputLabel = output.alias || output.name || `Output ${output.id}`
				const groupPresets = []

				for (const playlist of self.STATE.rotation_lists) {
					const presetId = `playlist_${output.id}_${playlist.id}`

					presets[presetId] = {
						type: 'simple',
						name: `Play ${playlist.name} on ${outputLabel}`,
						style: {
							text: playlist.name,
							size: '14',
							color: colorWhite,
							bgcolor: colorBlack,
						},
						steps: [
							{
								down: [
									{
										actionId: 'setOutputPlaylist',
										options: {
											output: output.id,
											playlist: playlist.id,
											loop: true,
										},
									},
								],
								up: [],
							},
						],
						feedbacks: [
							{
								feedbackId: 'outputPlaylistActive',
								options: {
									output: output.id,
									playlist: playlist.id,
								},
								style: {
									color: colorWhite,
									bgcolor: colorGreen,
								},
							},
						],
					}

					groupPresets.push(presetId)
				}

				const stopId = `playlist_stop_${output.id}`

				presets[stopId] = {
					type: 'simple',
					name: `Stop Playlist on ${outputLabel}`,
					style: {
						text: 'Stop\nPlaylist',
						size: '14',
						color: colorWhite,
						bgcolor: colorBlack,
					},
					steps: [
						{
							down: [
								{
									actionId: 'stopOutputPlaylist',
									options: {
										output: output.id,
									},
								},
							],
							up: [],
						},
					],
					feedbacks: [],
				}

				groupPresets.push(stopId)

				playlistGroups.push({
					id: `playlists_${output.id}`,
					type: 'simple',
					name: `Playlists on ${outputLabel}`,
					presets: groupPresets,
				})
			}

			structure.push({
				id: 'playlists',
				name: 'Playlists',
				definitions: playlistGroups,
			})
		}

		self.setPresetDefinitions(structure, presets)
	},
}
