const { combineRgb } = require('@companion-module/base')

module.exports = {
	initFeedbacks: function () {
		let self = this
		let feedbacks = {}

		const colorWhite = combineRgb(255, 255, 255)
		const colorRed = combineRgb(255, 0, 0)
		const colorGreen = combineRgb(0, 255, 0)
		const colorOrange = combineRgb(255, 165, 0)

		feedbacks.outputRoutedFromInput = {
			type: 'boolean',
			name: 'Routing: Output is Routed from Input',
			description: 'Change the button style if the selected input is routed to the selected output',
			defaultStyle: {
				color: colorWhite,
				bgcolor: colorRed,
			},
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
					default: self.CHOICES_INPUTS[0].id,
					choices: self.CHOICES_INPUTS,
				},
			],
			callback: function (feedback) {
				let options = feedback.options
				const output = self.getOutputById(options.output)

				if (output && output.input_src_id !== null && output.input_src_id !== undefined) {
					return output.input_src_id == options.input
				}

				return false
			},
		}

		feedbacks.outputDisconnected = {
			type: 'boolean',
			name: 'Routing: Output has No Input Source',
			description: 'Change the button style if the selected output has no input source and no playlist assigned',
			defaultStyle: {
				color: colorWhite,
				bgcolor: colorOrange,
			},
			options: [
				{
					type: 'dropdown',
					label: 'Output',
					id: 'output',
					default: self.CHOICES_OUTPUTS[0].id,
					choices: self.CHOICES_OUTPUTS,
				},
			],
			callback: function (feedback) {
				let options = feedback.options
				const output = self.getOutputById(options.output)

				if (output) {
					const noInput = output.input_src_id === null || output.input_src_id === undefined
					const noPlaylist = output.rotation_list_id === null || output.rotation_list_id === undefined
					return noInput && noPlaylist
				}

				return false
			},
		}

		feedbacks.outputLocked = {
			type: 'boolean',
			name: 'Output: Output is Locked',
			description: 'Change the button style if the selected output is locked',
			defaultStyle: {
				color: colorWhite,
				bgcolor: colorRed,
			},
			options: [
				{
					type: 'dropdown',
					label: 'Output',
					id: 'output',
					default: self.CHOICES_OUTPUTS[0].id,
					choices: self.CHOICES_OUTPUTS,
				},
			],
			callback: function (feedback) {
				let options = feedback.options
				const output = self.getOutputById(options.output)
				return output?.lock === true
			},
		}

		feedbacks.outputFavorite = {
			type: 'boolean',
			name: 'Output: Output is Favorite',
			description: 'Change the button style if the selected output is set as a favorite',
			defaultStyle: {
				color: colorWhite,
				bgcolor: colorOrange,
			},
			options: [
				{
					type: 'dropdown',
					label: 'Output',
					id: 'output',
					default: self.CHOICES_OUTPUTS[0].id,
					choices: self.CHOICES_OUTPUTS,
				},
			],
			callback: function (feedback) {
				let options = feedback.options
				const output = self.getOutputById(options.output)
				return output?.collect === true
			},
		}

		feedbacks.outputPlaylistActive = {
			type: 'boolean',
			name: 'Playlist: Output is Playing Playlist',
			description: 'Change the button style if the selected output is playing the selected playlist',
			defaultStyle: {
				color: colorWhite,
				bgcolor: colorGreen,
			},
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
			],
			callback: function (feedback) {
				let options = feedback.options
				const output = self.getOutputById(options.output)

				if (output && output.rotation_list_id !== null && output.rotation_list_id !== undefined) {
					return output.rotation_list_id == options.playlist
				}

				return false
			},
		}

		feedbacks.inputAvailable = {
			type: 'boolean',
			name: 'Input: Input Source is Available/Unavailable',
			description: 'Change the button style based on the availability of the selected input source',
			defaultStyle: {
				color: colorWhite,
				bgcolor: colorGreen,
			},
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
					label: 'Change style if input is',
					id: 'compare',
					default: 'available',
					choices: [
						{ id: 'available', label: 'Available' },
						{ id: 'unavailable', label: 'Unavailable' },
					],
				},
			],
			callback: function (feedback) {
				let options = feedback.options
				const input = self.getInputById(options.input)

				if (!input) {
					return false
				}

				if (options.compare === 'available') {
					return input.available === true
				}

				return input.available !== true
			},
		}

		feedbacks.templateActive = {
			type: 'boolean',
			name: 'Template: Template is Active',
			description: 'Change the button style if the selected template is the active template',
			defaultStyle: {
				color: colorWhite,
				bgcolor: colorRed,
			},
			options: [
				{
					type: 'dropdown',
					label: 'Template',
					id: 'template',
					default: self.CHOICES_TEMPLATES[0].id,
					choices: self.CHOICES_TEMPLATES,
				},
			],
			callback: function (feedback) {
				let options = feedback.options
				const template = self.STATE.templates.find((template) => template.id == options.template)
				return template?.start === true
			},
		}

		self.setFeedbackDefinitions(feedbacks)
	},
}
