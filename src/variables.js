function formatUptime(uptime) {
	if (!uptime || isNaN(uptime)) {
		return ''
	}

	const totalSeconds = Math.floor(uptime)
	const days = Math.floor(totalSeconds / 86400)
	const remainingSeconds = totalSeconds % 86400
	const hours = Math.floor(remainingSeconds / 3600)
	const minutes = Math.floor((remainingSeconds % 3600) / 60)
	const seconds = remainingSeconds % 60

	const hoursStr = hours.toString().padStart(2, '0')
	const minutesStr = minutes.toString().padStart(2, '0')
	const secondsStr = seconds.toString().padStart(2, '0')
	if (days > 0) {
		return `${days} Days ${hoursStr}:${minutesStr}:${secondsStr}`
	}

	return `${hoursStr}:${minutesStr}:${secondsStr}`
}

module.exports = {
	initVariables() {
		let self = this
		let variables = {}

		// Device
		variables.serial_number = { name: 'Device Serial Number' }
		variables.firmware_version = { name: 'Firmware Version' }
		variables.cpu = { name: 'CPU Usage (%)' }
		variables.cpu_temp_c = { name: 'CPU Temperature (Celsius)' }
		variables.cpu_temp_f = { name: 'CPU Temperature (Fahrenheit)' }
		variables.memory = { name: 'Memory Usage (%)' }
		variables.uptime = { name: 'Device Uptime' }
		variables.input_count = { name: 'Number of Input Sources' }
		variables.output_count = { name: 'Number of Outputs' }
		variables.abnormal_input_count = { name: 'Number of Abnormal Input Sources' }
		variables.abnormal_output_count = { name: 'Number of Abnormal Outputs' }

		// Panel
		variables.panel_name = { name: 'Panel Name' }
		variables.active_template = { name: 'Active Template Name' }

		// Per-output
		for (let i = 0; i < self.STATE.outputs.length; i++) {
			const idx = i + 1
			variables[`output_${idx}_name`] = { name: `Output ${idx} Name` }
			variables[`output_${idx}_input`] = { name: `Output ${idx} Routed Input Name` }
			variables[`output_${idx}_locked`] = { name: `Output ${idx} Locked` }
			variables[`output_${idx}_favorite`] = { name: `Output ${idx} Favorite` }
			variables[`output_${idx}_playlist`] = { name: `Output ${idx} Playlist Name` }
			variables[`output_${idx}_resolution`] = { name: `Output ${idx} Resolution` }
			variables[`output_${idx}_connections`] = { name: `Output ${idx} Connection Count` }
		}

		// Per-input
		for (let i = 0; i < self.STATE.inputs.length; i++) {
			const idx = i + 1
			variables[`input_${idx}_name`] = { name: `Input ${idx} Name` }
			variables[`input_${idx}_available`] = { name: `Input ${idx} Available` }
			variables[`input_${idx}_url`] = { name: `Input ${idx} URL` }
			variables[`input_${idx}_resolution`] = { name: `Input ${idx} Resolution` }
		}

		self.setVariableDefinitions(variables)
	},

	checkVariables() {
		let self = this

		try {
			let variableObj = {}

			// Device
			variableObj.serial_number = self.STATE.sn || ''
			variableObj.firmware_version = self.STATE.version || ''

			const sysInfo = self.STATE.system_info
			variableObj.cpu = ''
			variableObj.cpu_temp_c = ''
			variableObj.cpu_temp_f = ''
			variableObj.memory = ''
			variableObj.uptime = ''
			variableObj.input_count = ''
			variableObj.output_count = ''
			variableObj.abnormal_input_count = ''
			variableObj.abnormal_output_count = ''

			if (sysInfo) {
				variableObj.cpu = sysInfo.cpu !== null && sysInfo.cpu !== undefined ? sysInfo.cpu + '%' : ''
				variableObj.cpu_temp_c = sysInfo.cpu_temp?.c !== undefined ? sysInfo.cpu_temp.c + '°C' : ''
				variableObj.cpu_temp_f = sysInfo.cpu_temp?.f !== undefined ? sysInfo.cpu_temp.f + '°F' : ''
				variableObj.memory = sysInfo.mem !== null && sysInfo.mem !== undefined ? sysInfo.mem + '%' : ''
				variableObj.uptime = formatUptime(sysInfo.system_running_time)
				variableObj.input_count = sysInfo.input_src_num ?? ''
				variableObj.output_count = sysInfo.output_num ?? ''
				variableObj.abnormal_input_count = sysInfo.abnormal_input_src_num ?? ''
				variableObj.abnormal_output_count = sysInfo.abnormal_output_num ?? ''
			}

			// Panel
			variableObj.panel_name = self.STATE.panel_name || ''
			variableObj.active_template = self.getActiveTemplate()?.name || ''

			// Per-output
			for (let i = 0; i < self.STATE.outputs.length; i++) {
				const idx = i + 1
				const output = self.STATE.outputs[i]

				variableObj[`output_${idx}_name`] = output.alias || output.name || ''
				variableObj[`output_${idx}_locked`] = output.lock ? 'True' : 'False'
				variableObj[`output_${idx}_favorite`] = output.collect ? 'True' : 'False'
				variableObj[`output_${idx}_resolution`] = output.resolution || ''
				variableObj[`output_${idx}_connections`] = output.link_num ?? ''

				let inputName = ''
				if (output.input_src_id !== null && output.input_src_id !== undefined) {
					const input = self.getInputById(output.input_src_id)
					inputName = input?.alias || input?.name || `Input ${output.input_src_id}`
				}
				variableObj[`output_${idx}_input`] = inputName

				let playlistName = ''
				if (output.rotation_list_id !== null && output.rotation_list_id !== undefined) {
					const playlist = self.STATE.rotation_lists.find((list) => list.id == output.rotation_list_id)
					playlistName = playlist?.name || `Playlist ${output.rotation_list_id}`
				}
				variableObj[`output_${idx}_playlist`] = playlistName
			}

			// Per-input
			for (let i = 0; i < self.STATE.inputs.length; i++) {
				const idx = i + 1
				const input = self.STATE.inputs[i]

				variableObj[`input_${idx}_name`] = input.alias || input.name || ''
				variableObj[`input_${idx}_available`] = input.available ? 'True' : 'False'
				variableObj[`input_${idx}_url`] = input.url || ''
				variableObj[`input_${idx}_resolution`] = input.resolution || ''
			}

			self.setVariableValues(variableObj)
		} catch (error) {
			self.log('error', 'Error setting Variables: ' + String(error))
		}
	},
}
