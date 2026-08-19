import test from 'node:test'
import assert from 'node:assert/strict'

import KiloviewX1Instance, { UpgradeScripts } from '../src/main.js'
import api from '../src/api.js'
import constants from '../src/constants.js'

// Regression guard for the v1.0.4 upgrade-script defect: Companion reads the upgrade scripts off
// the module namespace object (`moduleImport.UpgradeScripts ?? []`), not off the default export.
// A CommonJS entry point bundles to a lone `default` export, silently yielding zero upgrade
// scripts and skipping the password -> secrets migration.
test('entry point exposes UpgradeScripts as a named export', () => {
	assert.equal(typeof KiloviewX1Instance, 'function', 'default export must be the instance class')
	assert.ok(Array.isArray(UpgradeScripts), 'UpgradeScripts must be a named export and an array')
	assert.equal(UpgradeScripts.length, 1)
})

test('password migration moves a config password into secrets', () => {
	const [migrate] = UpgradeScripts
	const result = migrate({}, { config: { host: '1.2.3.4', password: 'hunter2' }, secrets: {} })

	assert.equal(result.updatedSecrets.password, 'hunter2')
	assert.equal(result.updatedConfig.password, undefined)
	assert.equal(result.updatedConfig.host, '1.2.3.4', 'unrelated config must be preserved')
})

test('password migration is a no-op when there is nothing to migrate', () => {
	const [migrate] = UpgradeScripts
	const result = migrate({}, { config: { host: '1.2.3.4' }, secrets: {} })

	assert.equal(result.updatedConfig, null)
	assert.equal(result.updatedSecrets, null)
})

// Regression guard for the polling crash: a device that answers with a non-array where an array
// is documented used to reach rebuildChoices() outside the try/catch, and the resulting TypeError
// escaped an un-awaited setInterval callback as an unhandled rejection (fatal under Node 22).
function makeInstance() {
	const self = { ...api }
	Object.assign(self, constants)
	self.STATE = constants.createDefaultState()
	Object.assign(self, constants.createDefaultChoiceSets())
	self.config = { panel_id: '' }
	self.logs = []
	self.log = (level, message) => self.logs.push(`${level}: ${message}`)
	self.updateStatus = () => {}
	self.initActions = self.initFeedbacks = self.initVariables = self.initPresets = () => {}
	self.checkAllFeedbacks = self.checkVariables = () => {}
	self.CONNECTION_GENERATION = 1
	self.STATE_CHECK_IN_FLIGHT = false
	self.STATE_CHECK_PROMISE = null
	self.POLL_ERROR_COUNT = 0
	return self
}

test('checkState survives a malformed panel detail response', async () => {
	const self = makeInstance()
	self.DEVICE = {
		queryPanel: async () => ({ msg: [{ id: 1, name: 'Panel' }] }),
		queryPanelDetail: async () => ({
			msg: { panel_inputs: { 0: { id: 1 } }, panel_outputs: 'nonsense', panel_templates: null },
		}),
	}

	await assert.doesNotReject(() => self.checkState())

	assert.deepEqual(self.STATE.inputs, [])
	assert.deepEqual(self.STATE.outputs, [])
	assert.deepEqual(self.STATE.templates, [])
	assert.deepEqual(self.STATE.rotation_lists, [])
})

test('checkState handles a well-formed response', async () => {
	const self = makeInstance()
	self.DEVICE = {
		queryPanel: async () => ({ msg: [{ id: 7, name: 'Main' }] }),
		queryPanelDetail: async () => ({
			msg: { panel_inputs: [{ id: 21, name: 'In' }], panel_outputs: [{ id: 11, name: 'Out' }] },
		}),
	}

	await self.checkState()

	assert.equal(self.STATE.panel_id, 7)
	assert.equal(self.STATE.panel_name, 'Main')
	assert.equal(self.STATE.inputs.length, 1)
	assert.equal(self.CHOICES_OUTPUTS[0].label, 'Out')
})

test('concurrent checkState calls do not overlap, and the in-flight promise is awaitable', async () => {
	const self = makeInstance()
	let queryPanelCalls = 0
	self.DEVICE = {
		queryPanel: async () => {
			queryPanelCalls++
			await new Promise((r) => setTimeout(r, 40))
			return { msg: [{ id: 1, name: 'Panel' }] }
		},
		queryPanelDetail: async () => ({ msg: { panel_inputs: [], panel_outputs: [] } }),
	}

	const first = self.checkState()
	await self.checkState() // must be dropped while the first is running
	assert.equal(queryPanelCalls, 1)

	assert.ok(self.STATE_CHECK_PROMISE, 'in-flight check must be published for refreshStateAfterAction')
	await first
	assert.equal(self.STATE_CHECK_PROMISE, null, 'in-flight promise must be cleared once settled')
})

// The reconnect timer must be armed before the dispose completes. We only reach
// handleConnectionFailure because the device is unreachable, so logout() inside dispose runs to
// its full request timeout; awaiting it first would delay the first retry by that much.
test('handleConnectionFailure arms the reconnect before waiting on dispose', async () => {
	const self = makeInstance()
	self.config.host = '10.0.0.1'
	self.RECONNECT_TIME = 30000
	self._destroyed = false

	const order = []
	self.stopIntervals = () => {}
	self.startReconnectInterval = () => order.push('reconnect-armed')

	let releaseLogout
	const logoutBlocked = new Promise((resolve) => (releaseLogout = resolve))
	self.DEVICE = {
		// stands in for a logout that hangs until its request timeout on a dead device
		logout: () => logoutBlocked.then(() => order.push('logout-finished')),
		close: () => order.push('closed'),
	}

	const pending = self.handleConnectionFailure(new Error('unreachable'), 'Poll failed')

	await new Promise((r) => setImmediate(r))
	assert.deepEqual(order, ['reconnect-armed'], 'retry must be armed while dispose is still open')

	releaseLogout()
	await pending
	assert.deepEqual(order, ['reconnect-armed', 'logout-finished', 'closed'])
	assert.equal(self.DEVICE, null, 'device reference must be cleared')
})
