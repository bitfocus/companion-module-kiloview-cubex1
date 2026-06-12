// Kiloview CUBE X1
const { InstanceBase } = require('@companion-module/base')
const upgrades = require('./upgrades')

const config = require('./config')

const actions = require('./actions')
const feedbacks = require('./feedbacks')
const variables = require('./variables')
const presets = require('./presets')

const api = require('./api')

const constants = require('./constants')

class KiloviewX1Instance extends InstanceBase {
	constructor(internal) {
		super(internal)

		// Assign the methods from the listed files to this class
		Object.assign(this, {
			...config,

			...actions,
			...feedbacks,
			...variables,
			...presets,

			...api,

			...constants,
		})
	}

	async init(config) {
		this.configUpdated(config)
	}

	async destroy() {
		try {
			this.stopIntervals()
			if (this.DEVICE) {
				this.DEVICE.logout().catch(() => {})
			}
		} catch (error) {
			this.log('error', 'destroy error: ' + error)
		}
	}

	async configUpdated(config) {
		this.config = config

		this.initActions()
		this.initFeedbacks()
		this.initVariables()
		this.initPresets()

		this.initConnection()
	}
}

module.exports = KiloviewX1Instance
module.exports.UpgradeScripts = upgrades
