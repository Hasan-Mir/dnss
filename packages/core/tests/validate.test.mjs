import { test } from 'node:test';
import assert from 'node:assert/strict';

import { validateIPv4, validateIPv6 } from '../dist/validate.js';

test('validateIPv4 accepts canonical addresses', () => {
    assert.equal(validateIPv4('8.8.8.8'), true);
    assert.equal(validateIPv4('0.0.0.0'), true);
    assert.equal(validateIPv4('255.255.255.255'), true);
    assert.equal(validateIPv4('  1.1.1.1  '), true);
});

test('validateIPv4 rejects leading zeros (octal ambiguity)', () => {
    assert.equal(validateIPv4('010.0.0.1'), false);
    assert.equal(validateIPv4('08.8.8.8'), false);
    assert.equal(validateIPv4('192.168.001.1'), false);
});

test('validateIPv4 rejects malformed input', () => {
    assert.equal(validateIPv4(''), false);
    assert.equal(validateIPv4('1.1.1'), false);
    assert.equal(validateIPv4('1.1.1.1.1'), false);
    assert.equal(validateIPv4('256.1.1.1'), false);
    assert.equal(validateIPv4('a.b.c.d'), false);
    assert.equal(validateIPv4('1.1.1.-1'), false);
});

test('validateIPv6 accepts common forms', () => {
    assert.equal(validateIPv6('::1'), true);
    assert.equal(validateIPv6('2001:db8::8a2e:370:7334'), true);
    assert.equal(validateIPv6('::ffff:192.168.0.1'), true);
});

test('validateIPv6 rejects malformed input', () => {
    assert.equal(validateIPv6('2001::db8::1'), false);
    assert.equal(validateIPv6('gggg::1'), false);
});
