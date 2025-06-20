/**@type {import('eslint').Linter.Config} */
// eslint-disable-next-line no-undef
module.exports = {
	root: true,
	parser: '@typescript-eslint/parser',
	plugins: [
		'@typescript-eslint',
	],
	extends: [
		'eslint:recommended',
		'plugin:@typescript-eslint/recommended',
	],
	ignorePatterns: [
		'media',
	],
	rules: {
		'semi': [2, "always"],
		'@typescript-eslint/no-unused-vars': 0,
		'@typescript-eslint/no-explicit-any': 0,
		'@typescript-eslint/explicit-module-boundary-types': 0,
		'@typescript-eslint/no-non-null-assertion': 0,
	},
	env: {
        "browser": true,  // Tells ESLint to allow browser-specific globals like `window`, `acquireVsCodeApi`
        "node": true      // Tells ESLint to allow Node.js globals like `global`, `process`
    },
    globals: {
        "acquireVsCodeApi": "readonly"  // Declare `acquireVsCodeApi` as a global variable in the Webview
    }
};
