const test = require('node:test')
const assert = require('node:assert/strict')

const KiloviewCubeX1 = require('../src/cubex1')

test('formatHostForUrl brackets bare IPv6 and leaves everything else alone', () => {
	assert.equal(KiloviewCubeX1.formatHostForUrl('192.168.1.10'), '192.168.1.10')
	assert.equal(KiloviewCubeX1.formatHostForUrl('  192.168.1.10  '), '192.168.1.10')
	assert.equal(KiloviewCubeX1.formatHostForUrl('cube.local'), 'cube.local')
	assert.equal(KiloviewCubeX1.formatHostForUrl('fe80::1'), '[fe80::1]')
	assert.equal(KiloviewCubeX1.formatHostForUrl('[fe80::1]'), '[fe80::1]')
})

test('isValidHost accepts IPv4 addresses', () => {
	for (const host of ['192.168.1.10', '10.0.0.1', '0.0.0.0', '255.255.255.255', '127.0.0.1']) {
		assert.equal(KiloviewCubeX1.isValidHost(host), true, host)
	}
})

test('isValidHost accepts IPv6 addresses, bare or bracketed', () => {
	for (const host of ['fe80::1', '[fe80::1]', '::1', '2001:db8::8a2e:370:7334', '[::]']) {
		assert.equal(KiloviewCubeX1.isValidHost(host), true, host)
	}
})

test('isValidHost accepts hostnames', () => {
	for (const host of ['cube', 'cube.local', 'cube-x1.studio.example.com', 'a', 'x1-01']) {
		assert.equal(KiloviewCubeX1.isValidHost(host), true, host)
	}
})

test('isValidHost rejects malformed hosts', () => {
	for (const host of [
		'',
		'   ',
		'256.1.1.1',
		'192.168.1',
		'192.168.1.10.5',
		'-cube.local',
		'cube-.local',
		'cube..local',
		'cube.local/api',
		'cube local',
		'http://cube.local',
		'[:::::]',
		'[not-ipv6]',
		'12345',
		'cube.local.5',
		`${'a'.repeat(64)}.${'b'.repeat(200)}.com`,
	]) {
		assert.equal(KiloviewCubeX1.isValidHost(host), false, JSON.stringify(host))
	}
})

test('isValidHost rejects non-string input without throwing', () => {
	for (const host of [undefined, null, 0, 12345, {}, [], true]) {
		assert.equal(KiloviewCubeX1.isValidHost(host), false, String(host))
	}
})

// Regression guard for issue #1: Regex.IP / Regex.HOSTNAME from @companion-module/base are
// `/pattern/`-delimited strings, not RegExp objects. Calling .test() on them throws and took
// the whole module down during init in 1.0.4.
test('issue #1: validating a host does not throw', () => {
	assert.doesNotThrow(() => KiloviewCubeX1.isValidHost('192.168.1.10'))
	const { Regex } = require('@companion-module/base')
	assert.equal(typeof Regex.IP, 'string')
	assert.equal(typeof Regex.HOSTNAME, 'string')
})
