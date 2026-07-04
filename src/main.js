// Kiloview CUBE X1
const { InstanceBase, InstanceStatus } = require('@companion-module/base')
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
		await this.configUpdated(config)
	}

	async destroy() {
		try {
			this._destroyed = true
			this.CONNECTION_GENERATION++
			this.stopIntervals()
			await this.INIT_CONNECTION_PROMISE
			await this.disposeDevice(this.DEVICE)
			this.DEVICE = null
			this.updateStatus(InstanceStatus.Disconnected)
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

		await this.initConnection()
	}
}

module.exports = KiloviewX1Instance
module.exports.UpgradeScripts = upgrades
