#!/usr/bin/env node

const fs = require('fs');
const path = require('path');


function cli(args) {
	console.log('Preparing files for production');
	console.log('Resulting files will be in the build directory');

	const buildDir = path.join(process.cwd(), 'build');

	if (!fs.existsSync(buildDir)) {
		fs.mkdirSync(buildDir);
	}

	const vscodeIgnorePath = path.join(process.cwd(), '.vscodeignore');
	let ignorePatterns = [];

	if (fs.existsSync(vscodeIgnorePath)) {
		const vscodeIgnoreContent = fs.readFileSync(vscodeIgnorePath, 'utf-8');
		ignorePatterns = vscodeIgnoreContent.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#'));
	}

	function shouldIgnore(filePath) {
		return ignorePatterns.some(pattern => {
			const regex = new RegExp(pattern.replace(/\*/g, '.*'));
			return regex.test(filePath);
		});
	}

	function copyFilesRecursively(srcDir, destDir) {
		const entries = fs.readdirSync(srcDir, { withFileTypes: true });

		for (const entry of entries) {
			const srcPath = path.join(srcDir, entry.name);
			const destPath = path.join(destDir, entry.name);

			if (shouldIgnore(srcPath)) {
				continue;
			} else {
				if (entry.isDirectory()) {
					if (!fs.existsSync(destPath)) {
						fs.mkdirSync(destPath);
					}
					copyFilesRecursively(srcPath, destPath);
				} else if (entry.isFile()) {
					fs.copyFileSync(srcPath, destPath);
				}
			}
		}
	}

	function copyFile(src, dest) {
		if (fs.existsSync(src)) {
			fs.copyFileSync(src, dest);
		} else {
			console.error(`File does not exist: ${src}`);
		}
	}

	/* 
		Copy recursively all the necessary files to the build directory
	 */
	copyFilesRecursively(process.cwd(), buildDir);

	// Remove the GitHub sections from the README.md file
	const readmePath = path.join(buildDir, 'README.md');
	if (fs.existsSync(readmePath)) {
		let readmeContent = fs.readFileSync(readmePath, 'utf-8');
		while (/<!-- START GITHUB -->[\s\S]*?<!-- END GITHUB -->/.test(readmeContent)) {
			readmeContent = readmeContent.replace(/<!-- START GITHUB -->[\s\S]*?<!-- END GITHUB -->/, '');
		}
		fs.writeFileSync(readmePath, readmeContent, 'utf-8');
		console.log('README.md updated');
	}

	/* 
		Copy images resources to the build directory
	 */
	copyFile(path.join(process.cwd(), 'images', 'icon.png'), path.join(buildDir, 'icon.png'));
}


cli(process.argv);
