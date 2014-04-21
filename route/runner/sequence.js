/**
 * @license MIT http://troopjs.mit-license.org/
 */
define([ "poly/array" ], function SequenceModule() {
	"use strict";

	/**
	 * @class opt.route.runner.sequence
	 * @implement core.event.emitter.runner
	 * @private
	 * @static
	 * @alias feature.runner
	 */

	var UNDEFINED;
	var NULL = null;
	var OBJECT_TOSTRING = Object.prototype.toString;
	var CONTEXT = "context";
	var CALLBACK = "callback";
	var DATA = "data";
	var HEAD = "head";
	var NEXT = "next";
	var TYPE = "type";
	var TOKENS = "tokens";

	var RE_GROUP_START = /\(/g;
	var RE_TOKEN = /\:(\w+)\??\/?/g;
	var RE_TOKEN_ESCAPED = /\@(\w+)(\?)?\/?/g;
	var MARK_MISSED = '@';
	var RE_GROUPED_TOKEN = /\(([^)]+)\)\??\/?/g;
	var RE_ANY = /^.*$/;
	var RE_DUP_SLASH = /\/{2,}/;

	var RE_BOOLEAN = /^(?:false|true)$/i;
	var RE_BOOLEAN_TRUE = /^true$/i;
	var RE_DIGIT = /^\d+$/;

	/**
	 * @method constructor
	 * @inheritdoc
	 * @localdoc Runner that executes ROUTE candidates in sequence without overlap
	 * @return {*} Result from last handler
	 * @throws {Error} If `event.type` is an unknown type
	 */
	return function sequence(event, handlers, args) {
		var path;
		var type = event[TYPE];
		var route = path = args.shift(); // Shift path and route of args
		var data = args[0] || {}; // Data is provided as the second arg, but we're already shifted
		var candidate;
		var candidates = [];

		// If this is a route/set we need to pre-process the path
		if (type === "route/set") {
			// Populate path with data
			path = path
				// Replace grouped tokens.
				.replace(RE_GROUPED_TOKEN, function ($0, $1) {
					var group = $1.replace(RE_TOKEN, function($0, $1) {
						return data[$1] ? data[$1] + "/" : $0;
					});
					// mark the group as missed.
					return group !== $1 ? group + "/": MARK_MISSED;
				})
				// Replace the rest of tokens.
				.replace(RE_TOKEN, function($0, $1) {
					// mark the parameters as missed.
					return data[$1] ? data[$1] + "/" : MARK_MISSED;
				})
				// Remove any duplicate slashes previously produced.
				.replace(RE_DUP_SLASH, '/');

			// Dump from before the first missed parameter.
			var first_missed = path.indexOf(MARK_MISSED);
			if(first_missed > -1) {
				path = path.substring(0, first_missed);
			}
		}
		// If this is _not_ a route/change we should throw an error
		else if (type !== "route/change") {
			throw new Error("Unable to run type '" + type + "'");
		}

		// Copy handlers -> candidates
		for (candidate = handlers[HEAD]; candidate !== UNDEFINED; candidate = candidate[NEXT]) {
			candidates.push(candidate);
		}

		// Run candidates and return
		return candidates.reduce(function (result, candidate) {
			var tokens;
			var matches;
			var re;

			// Only run if the reduced result is not `false`
			if (result !== false) {
				switch (OBJECT_TOSTRING.call(candidate[DATA])) {
					case "[object RegExp]":
						// Use cached regexp
						re = candidate[DATA];

						// Use cached tokens
						tokens = candidate[TOKENS];
						break;

					case "[object Undefined]":
						// Match anything
						re = RE_ANY;

						// Empty tokens
						tokens = [];
						break;

					default:
						// Reset tokens
						tokens = candidate[TOKENS] = [];

						// Translate and cache pattern to regexp
						re = candidate[DATA]
							// Preserved colon to be used by regexp.
							.replace(/\:/g, "@")
							// Translate grouping to non capturing regexp groups
							.replace(RE_GROUP_START, "(?:")
							// Capture tokens
							.replace(RE_TOKEN_ESCAPED, function($0, token, optional) {
									// Add token
									tokens.push(token);
									// Return replacement.
									$0 = "(?:(\\w+)\/)" + (optional? "?" : "");
									return $0;
							})
							.replace(/([\/.])/g, '\\$1');

						re = candidate[DATA] = new RegExp('^' + re + '$', 'i');
				}

				// Match path
				if ((matches = re.exec(path)) !== NULL) {
					// Capture tokens in data
					tokens.forEach(function (token, index) {

						// Auto type convertion.
						var val = matches[index + 1];
						if (RE_BOOLEAN.test(val)) {
							val = RE_BOOLEAN_TRUE.test(val);
						}
						else if (RE_DIGIT.test(val)) {
							val = +val;
						}

						matches[index + 1] = matches[token] = val;
					});

					// Send to route/change all token values.
					if (type === 'route/change')
						args = matches.slice(1).concat(args);
					// Send to route/set the updated path and matches.
					else {
						args = [matches].concat(args);
					}

					// Apply CALLBACK and store in result
					result = candidate[CALLBACK].apply(candidate[CONTEXT], args);
				}
			}

			return result;
		}, UNDEFINED);
	}
});
