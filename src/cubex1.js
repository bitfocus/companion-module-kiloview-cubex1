const http = require('http')
const https = require('https')

/**
 * HTTP API client for the Kiloview CUBE X1 NDI distribution system.
 *
 * All endpoints live below /api/cube/CubeServer/.
 * Authentication uses a bearer token obtained via /user/login which is only
 * valid for ~5 minutes, so it is refreshed periodically via /user/token/get
 * and re-acquired on auth failures.
 */
class KiloviewCubeX1 {
	constructor(owner, ip, username, password, protocol = 'http', port = 80) {
		this.owner = owner
		this.connection_info = {
			ip,
			username,
			password,
			protocol,
			port,
		}

		this.baseURL = `${protocol}://${ip}:${port}/api/cube/CubeServer`

		const agentOpts = {
			keepAlive: true,
			keepAliveMsecs: 30000,
			maxSockets: 5,
		}

		this.httpAgent = new http.Agent(agentOpts)
		this.httpsAgent = new https.Agent({
			...agentOpts,
			rejectUnauthorized: false,
		})

		this.token = ''
		this.authorized = false
	}

	log(level, message) {
		this.owner.log(level, message)
	}

	_request(method, path, data, contentType = 'application/json') {
		return new Promise((resolve, reject) => {
			const isHttps = this.connection_info.protocol === 'https'
			const urlObj = new URL(`${this.baseURL}${path}`)

			let body = undefined
			if (data !== undefined && method === 'POST') {
				if (contentType === 'application/x-www-form-urlencoded') {
					body = new URLSearchParams(data).toString()
				} else {
					body = JSON.stringify(data)
				}
			}

			const headers = {
				Accept: 'application/json',
				'Content-Type': contentType,
				Connection: 'keep-alive',
				language: 'en',
				// Required on /user/login ("is small screen"), harmless elsewhere
				screen: 'false',
			}

			if (this.token) {
				headers['Authorization'] = `Bearer ${this.token}`
			}

			if (body !== undefined) {
				headers['Content-Length'] = Buffer.byteLength(body)
			}

			const options = {
				hostname: urlObj.hostname,
				port: urlObj.port || (isHttps ? 443 : 80),
				path: urlObj.pathname + urlObj.search,
				method: method,
				rejectUnauthorized: false,
				agent: isHttps ? this.httpsAgent : this.httpAgent,
				timeout: 5000,
				headers: headers,
			}

			const req = (isHttps ? https : http).request(options, (res) => {
				let resBody = ''
				res.on('data', (chunk) => {
					resBody += chunk
				})
				res.on('end', () => {
					try {
						const parsed = JSON.parse(resBody)
						if (typeof parsed === 'object' && parsed !== null) {
							parsed._statusCode = res.statusCode
						}
						resolve(parsed)
					} catch {
						resolve({ _statusCode: res.statusCode, _raw: resBody })
					}
				})
			})

			req.on('timeout', () => {
				req.destroy(new Error('Request timed out'))
			})

			req.on('error', (err) => {
				const error = new Error(err.message)
				error.name = 'KiloviewX1Error'
				error.unreachable = true
				reject(error)
			})

			if (body !== undefined) {
				req.write(body)
			}

			req.end()
		})
	}

	_apiError(result) {
		let message = 'API Error'
		if (result && result.error && result.error.info) {
			message = `${result.error.info} (code ${result.error.code})`
		} else if (result && result._statusCode) {
			message = `HTTP ${result._statusCode}`
		}
		const error = new Error(message)
		error.name = 'KiloviewX1Error'
		error.code = result?.error?.code
		error.statusCode = result?._statusCode
		return error
	}

	_isAuthFailure(result) {
		if (result?._statusCode === 401 || result?._statusCode === 403) {
			return true
		}
		// Token errors come back as result=error with an auth related code/info
		if (result?.result === 'error' && result?.error?.info) {
			const info = String(result.error.info).toLowerCase()
			return info.includes('token') || info.includes('auth') || info.includes('login') || info.includes('expire')
		}
		return false
	}

	async login() {
		const { username, password } = this.connection_info

		const params = {
			grant_type: '',
			username: username,
			password: password,
			scope: '',
			client_id: '',
			client_secret: '',
		}

		this.token = ''

		const result = await this._request('POST', '/user/login', params, 'application/x-www-form-urlencoded')

		if (result && result.access_token) {
			this.token = result.access_token
			this.authorized = true
			return true
		}

		this.authorized = false
		const error = this._apiError(result)
		error.authFailure = true
		throw error
	}

	async logout() {
		if (!this.authorized) {
			return
		}
		try {
			await this._request('POST', '/user/logout', '')
		} finally {
			this.token = ''
			this.authorized = false
		}
	}

	close() {
		this.httpAgent.destroy()
		this.httpsAgent.destroy()
	}

	/**
	 * Refresh the bearer token (valid ~5 minutes) without a full re-login.
	 */
	async refreshToken() {
		const result = await this._request('GET', '/user/token/get')

		if (result?.result === 'ok' && result?.msg?.access_token) {
			this.token = result.msg.access_token
			return true
		}

		// Fall back to a full login if the refresh failed (token already expired)
		return await this.login()
	}

	async authGet(path, params = {}) {
		if (!this.authorized) {
			await this.login()
		}

		const queryString = new URLSearchParams(params).toString()
		const fullPath = path + (queryString ? '?' + queryString : '')

		let result = await this._request('GET', fullPath)

		if (this._isAuthFailure(result)) {
			await this.login()
			result = await this._request('GET', fullPath)
		}

		if (result?.result === 'error') {
			throw this._apiError(result)
		}

		return result
	}

	async authPost(path, data = {}) {
		if (!this.authorized) {
			await this.login()
		}

		let result = await this._request('POST', path, data)

		if (this._isAuthFailure(result)) {
			await this.login()
			result = await this._request('POST', path, data)
		}

		if (result?.result === 'error') {
			throw this._apiError(result)
		}

		return result
	}

	// ---------------------------------------------------------------------
	// System management
	// ---------------------------------------------------------------------

	/** System info (CPU, memory, network, input/output counts). No auth required. */
	async getSystemInfo() {
		const result = await this._request('GET', '/system/info')
		if (result?.result === 'error') {
			throw this._apiError(result)
		}
		return result
	}

	// ---------------------------------------------------------------------
	// Service management
	// ---------------------------------------------------------------------

	async getVersion() {
		return await this.authGet('/server/version')
	}

	async reboot() {
		return await this.authPost('/server/reboot', '')
	}

	async restoreFactorySettings() {
		return await this.authPost('/server/restore', '')
	}

	// ---------------------------------------------------------------------
	// Resource management
	// ---------------------------------------------------------------------

	async queryAllInputSources() {
		return await this.authGet('/resource/queryAllInputSrc')
	}

	async queryAllRotationLists() {
		return await this.authGet('/resource/queryAllRotationList')
	}

	async queryRotationList(rotation_list_id) {
		return await this.authGet('/resource/queryRotationList', { rotation_list_id })
	}

	// ---------------------------------------------------------------------
	// Panel management
	// ---------------------------------------------------------------------

	async queryPanel() {
		return await this.authGet('/panel/queryPanel')
	}

	async queryPanelDetail(panel_id) {
		return await this.authGet('/panel/queryPanelDetail', { panel_id })
	}

	/** Route an input source to an output. input_src_id = null disconnects the output. */
	async setPanelOutputInputSrc(panel_id, output_id, input_src_id) {
		return await this.authPost('/panel/setPanelOutputInputSrc', {
			panel_id,
			output_id,
			input_src_id,
		})
	}

	/** Assign a rotation playlist to an output. rotation_list_id = null disables the playlist. */
	async setPanelOutputRotationList(panel_id, output_id, rotation_list_id, loop) {
		return await this.authPost('/panel/setPanelOutputRotationList', {
			panel_id,
			output_id,
			rotation_list_id,
			loop,
		})
	}

	/** Route an input to all outputs (select = true) or deselect from all outputs (select = false). */
	async setPanelInputSrcSelectAll(panel_id, input_src_id, select) {
		return await this.authPost('/panel/setPanelInputSrcSelectAll', {
			panel_id,
			input_src_id,
			select,
		})
	}

	async setPanelOutputLock(panel_id, output_id, lock) {
		return await this.authPost('/panel/setPanelOutputLock', {
			panel_id,
			output_id,
			lock,
		})
	}

	async setPanelOutputCollect(panel_id, output_id, collect) {
		return await this.authPost('/panel/setPanelOutputCollect', {
			panel_id,
			output_id,
			collect,
		})
	}

	async setPanelOutputRotationListLoop(panel_id, output_id, rotation_list_id, loop) {
		return await this.authPost('/panel/setPanelOutputRotationListLoop', {
			panel_id,
			output_id,
			rotation_list_id,
			loop,
		})
	}

	// ---------------------------------------------------------------------
	// Template management
	// ---------------------------------------------------------------------

	async queryTemplates(panel_id) {
		return await this.authGet('/template/queryTemplate', { panel_id })
	}

	async addTemplate(panel_id, template_name) {
		return await this.authPost('/template/addTemplate', { panel_id, template_name })
	}

	async deleteTemplate(panel_id, template_id) {
		return await this.authPost('/template/deleteTemplate', { panel_id, template_id })
	}

	async saveCurrentTemplate(panel_id, template_id) {
		return await this.authPost('/template/saveCurrentTemplate', { panel_id, template_id })
	}

	async saveAsNewTemplate(panel_id, old_template_id, new_template_name) {
		return await this.authPost('/template/saveAsNewTemplate', {
			panel_id,
			old_template_id,
			new_template_name,
		})
	}

	async switchTemplate(panel_id, current_template_id, switch_template_id, save_current_template) {
		return await this.authPost('/template/switchTemplate', {
			panel_id,
			current_template_id,
			switch_template_id,
			save_current_template,
		})
	}

	async cancelTemplateOperate(panel_id, template_id) {
		return await this.authPost('/template/cancelTemplateOperate', { panel_id, template_id })
	}
}

module.exports = KiloviewCubeX1
