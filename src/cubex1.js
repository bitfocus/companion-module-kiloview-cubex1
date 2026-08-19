import http from 'node:http'
import https from 'node:https'
import { isIP } from 'node:net'

/**
 * HTTP API client for the Kiloview CUBE X1 NDI distribution system.
 */
class KiloviewCubeX1 {
	constructor(owner, ip, username, password, protocol = 'http', port = 80, options = {}) {
		this.owner = owner
		this.connection_info = {
			ip,
			username,
			password,
			protocol,
			port,
		}

		this.rejectUnauthorized = options.rejectUnauthorized === true
		this.requestTimeout = options.requestTimeout || 5000
		this.maxBodyBytes = options.maxBodyBytes || 10 * 1024 * 1024

		const hostForUrl = KiloviewCubeX1.formatHostForUrl(ip)
		this.baseURL = `${protocol}://${hostForUrl}:${port}/api/cube/CubeServer`

		const agentOpts = {
			keepAlive: true,
			keepAliveMsecs: 30000,
			maxSockets: 5,
		}

		this.httpAgent = new http.Agent(agentOpts)
		this.httpsAgent = new https.Agent({
			...agentOpts,
			rejectUnauthorized: this.rejectUnauthorized,
		})

		this.token = ''
		this.authorized = false
		this._closed = false
		this._activeRequests = new Set()
		this._authMutex = null
	}

	async _withAuthMutex(fn) {
		const previous = this._authMutex || Promise.resolve()
		let release
		const gate = new Promise((resolve) => {
			release = resolve
		})
		this._authMutex = gate
		await previous
		try {
			return await fn()
		} finally {
			release()
		}
	}

	log(level, message) {
		this.owner.log(level, message)
	}

	static formatHostForUrl(host) {
		const trimmed = String(host).trim()
		if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
			return trimmed
		}

		if (/^[0-9a-fA-F:]+$/.test(trimmed) && trimmed.includes(':')) {
			return `[${trimmed}]`
		}

		return trimmed
	}

	/**
	 * Validates a configured host. Accepts IPv4, IPv6 (bare or bracketed) and DNS hostnames.
	 *
	 * Note: do not use `Regex.IP` / `Regex.HOSTNAME` from @companion-module/base here. Those are
	 * `/pattern/`-delimited *strings* meant for the `regex` property of config input fields, not
	 * RegExp objects, so calling `.test()` on them throws.
	 */
	static isValidHost(host) {
		if (!host || typeof host !== 'string') {
			return false
		}

		const normalized = KiloviewCubeX1.formatHostForUrl(host)
		if (normalized.startsWith('[') && normalized.endsWith(']')) {
			return isIP(normalized.slice(1, -1)) === 6
		}

		if (isIP(normalized) !== 0) {
			return true
		}

		// A dotted-numeric string that failed isIP() above is a mistyped address (e.g. "256.1.1.1"
		// or "192.168.1"), not a hostname. Per RFC 1123 the final label cannot be all digits, so
		// rejecting it here keeps those from being treated as resolvable names.
		if (/(^|\.)[0-9]+$/.test(normalized)) {
			return false
		}

		// Mirrors Regex.HOSTNAME from @companion-module/base, plus the DNS length limit.
		return (
			normalized.length <= 253 &&
			/^(([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9])\.)*([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9-]*[A-Za-z0-9])$/.test(
				normalized,
			)
		)
	}

	_verboseLog(message) {
		if (this.owner.config?.verbose) {
			this.log('debug', message)
		}
	}

	_request(method, path, data, contentType = 'application/json') {
		if (this._closed) {
			const error = new Error('Client closed')
			error.name = 'KiloviewX1Error'
			error.unreachable = true
			return Promise.reject(error)
		}

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
				rejectUnauthorized: this.rejectUnauthorized,
				agent: isHttps ? this.httpsAgent : this.httpAgent,
				timeout: this.requestTimeout,
				headers: headers,
			}

			this._verboseLog(`HTTP ${method} ${options.path}`)

			const req = (isHttps ? https : http).request(options, (res) => {
				const chunks = []
				let bodyBytes = 0
				let bodyTooLarge = false
				const finish = () => {
					this._activeRequests.delete(req)
				}

				res.on('data', (chunk) => {
					if (bodyTooLarge) {
						return
					}

					// Count bytes, not decoded characters, so the cap holds for multi-byte responses.
					bodyBytes += chunk.length
					if (bodyBytes > this.maxBodyBytes) {
						bodyTooLarge = true
						req.destroy(new Error('Response body too large'))
						return
					}

					chunks.push(chunk)
				})
				res.on('error', (err) => {
					finish()
					const error = new Error(err.message)
					error.name = 'KiloviewX1Error'
					error.unreachable = true
					reject(error)
				})
				res.on('end', () => {
					finish()
					if (bodyTooLarge) {
						return
					}

					this._verboseLog(`HTTP ${method} ${options.path} -> ${res.statusCode}`)

					const resBody = Buffer.concat(chunks).toString('utf8')
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

			this._activeRequests.add(req)

			req.on('timeout', () => {
				const error = new Error('Request timed out')
				error.name = 'KiloviewX1Error'
				error.unreachable = true
				error.timeout = true
				req.destroy(error)
			})

			req.on('error', (err) => {
				this._activeRequests.delete(req)
				const error = new Error(err.message)
				error.name = 'KiloviewX1Error'
				error.unreachable = true
				if (err.message === 'Request timed out') {
					error.timeout = true
				}
				reject(error)
			})

			req.on('close', () => {
				this._activeRequests.delete(req)
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

		if (result?.result === 'error' && result?.error?.code !== undefined) {
			const code = String(result.error.code)
			return code === '401' || code === '403'
		}

		return false
	}

	_validateResult(result) {
		if (result?._statusCode >= 400) {
			this._throwApiError(result)
		}

		if (result?.result === 'error') {
			this._throwApiError(result)
		}
	}

	_throwApiError(result) {
		const error = this._apiError(result)
		if (this._isAuthFailure(result)) {
			error.authFailure = true
		}
		throw error
	}

	async _loginImpl() {
		const { username, password } = this.connection_info

		const params = {
			grant_type: '',
			username: username,
			password: password,
			scope: '',
			client_id: '',
			client_secret: '',
		}

		const previousToken = this.token
		const result = await this._request('POST', '/user/login', params, 'application/x-www-form-urlencoded')

		if (result && result.access_token) {
			this.token = result.access_token
			this.authorized = true
			return true
		}

		this.token = previousToken
		this.authorized = false
		const error = this._apiError(result)
		if (result?._statusCode >= 500 || result?._statusCode === 0) {
			error.unreachable = true
		} else {
			error.authFailure = true
		}
		throw error
	}

	async login() {
		return this._withAuthMutex(() => this._loginImpl())
	}

	async logout() {
		if (!this.authorized) {
			return
		}
		try {
			await this._request('POST', '/user/logout')
		} finally {
			this.token = ''
			this.authorized = false
		}
	}

	close() {
		this._closed = true
		for (const req of this._activeRequests) {
			req.destroy()
		}
		this._activeRequests.clear()
		this.httpAgent.destroy()
		this.httpsAgent.destroy()
	}

	async refreshToken() {
		return this._withAuthMutex(async () => {
			const result = await this._request('GET', '/user/token/get')

			if (result?._statusCode >= 400 && !this._isAuthFailure(result)) {
				const error = this._apiError(result)
				error.unreachable = true
				throw error
			}

			if (result?.result === 'ok' && result?.msg?.access_token) {
				this.token = result.msg.access_token
				return true
			}

			// Anything else (including an expired session) is recovered by logging in again.
			return await this._loginImpl()
		})
	}

	async authGet(path, params = {}) {
		if (!this.authorized) {
			await this.login()
		}

		const queryString = new URLSearchParams(params).toString()
		const fullPath = path + (queryString ? '?' + queryString : '')

		let result = await this._request('GET', fullPath)

		if (this._isAuthFailure(result)) {
			await this._withAuthMutex(() => this._loginImpl())
			result = await this._request('GET', fullPath)
		}

		this._validateResult(result)
		return result
	}

	async authPost(path, data = {}) {
		if (!this.authorized) {
			await this.login()
		}

		let result = await this._request('POST', path, data)

		if (this._isAuthFailure(result)) {
			await this._withAuthMutex(() => this._loginImpl())
			result = await this._request('POST', path, data)
		}

		this._validateResult(result)
		return result
	}

	async getSystemInfo() {
		return await this.authGet('/system/info')
	}

	async getVersion() {
		return await this.authGet('/server/version')
	}

	async reboot() {
		return await this.authPost('/server/reboot', {})
	}

	async queryPanel() {
		return await this.authGet('/panel/queryPanel')
	}

	async queryPanelDetail(panel_id) {
		return await this.authGet('/panel/queryPanelDetail', { panel_id })
	}

	async setPanelOutputInputSrc(panel_id, output_id, input_src_id) {
		return await this.authPost('/panel/setPanelOutputInputSrc', {
			panel_id,
			output_id,
			input_src_id,
		})
	}

	async setPanelOutputRotationList(panel_id, output_id, rotation_list_id, loop) {
		return await this.authPost('/panel/setPanelOutputRotationList', {
			panel_id,
			output_id,
			rotation_list_id,
			loop,
		})
	}

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

export default KiloviewCubeX1
