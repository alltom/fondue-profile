/*
 * Copyright (c) 2012 Massachusetts Institute of Technology, Adobe Systems
 * Incorporated, and other contributors. All rights reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 *
 */

var fondue    = require('fondue');
var fs        = require('fs');
var minimatch = require('minimatch');
var Module    = require('module');

var noisy = 0;

// level: 0  (no extra console output) (default)
//        1  (log when new files are instrumented, when debugger connects)
//        2+ (TBA)
exports.setLogLevel = function (level) {
	noisy = level;
}

exports.beginInstrumentation = function (options) {
	options = (options || {});
	var exclude = options.exclude || [];

	if (noisy >= 1) {
		console.log('[fondue-profile] adding require() instrumentation hook');
	}

	// adapted from https://github.com/joyent/node/blob/master/lib/module.js
	Module._extensions['.js'] = function(module, filename) {
		var content = fs.readFileSync(filename, 'utf8');
		content = stripBOM(content);
		content = stripShebang(content);

		var skip = false;
		if (exclude.some(function (pattern) { return minimatch(filename, pattern) })) {
			if (noisy >= 1) {
				console.log('[fondue-profile] excluding', filename);
			}
			skip = true;
		} else if (/node_modules/.test(filename) && !options.include_modules) {
			if (noisy >= 2) {
				console.log('[fondue-profile] excluding node_module', filename);
			}
			skip = true;
		}

		if (!skip) {
			if (noisy >= 1) {
				console.log('[fondue-profile] instrumenting', filename, '...');
			}

			content = fondue.instrument(content, {
				name: 'global.tracer',
				include_prefix: typeof(global.tracer) === 'undefined',
				path: filename,
				nodejs: true,
				maxInvocationsPerTick: options.maxInvocationsPerTick,
			});
		}

		module._compile(content, filename);
	};
}

// taken from https://github.com/joyent/node/blob/master/lib/module.js
function stripBOM(content) {
	// Remove byte order marker. This catches EF BB BF (the UTF-8 BOM)
	// because the buffer-to-string conversion in `fs.readFileSync()`
	// translates it to FEFF, the UTF-16 BOM.
	if (content.charCodeAt(0) === 0xFEFF) {
		content = content.slice(1);
	}
	return content;
}

function stripShebang(content) {
	if (/^#!/.test(content)) {
		return content.replace(/[^\r\n]+(\r|\n)/, '$1');
	}
	return content;
}

exports.launch = function (scriptPath) {
	delete require.cache['/Users/tlieber/src/fondue/lib/fondue.js'];

	process.on('exit', function () {
		var invocationsById = global.tracer.allInvocations();
		var invocations = Object.keys(invocationsById).map(function (k) { return invocationsById[k] });
		invocations = invocations.filter(function (invocation) {
			return invocation.type === 'callsite';
		});
		invocations.forEach(function (invocation) {
			invocation.duration = invocation.endTimestamp - invocation.timestamp;
		});
		invocations.sort(function (a, b) {
			return a.duration - b.duration;
		});
		invocations.forEach(function (invocation) {
			console.log(invocation.duration, invocation.f.id, invocation.f.name);
		});
	});

	require(scriptPath);
}
