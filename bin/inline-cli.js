#!/usr/bin/env node

// Imports
const fs = require('fs');

const FgRed = "\x1b[31m";
const FgGreen = "\x1b[32m";
const Bright = "\x1b[1m";
const Underscore = "\x1b[4m";
const Reset = "\x1b[0m";

String.prototype.replaceAll = function (txt, replace) {
	txt = txt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
	var regex = new RegExp(txt, 'g');
	return this.replace(regex, replace);
};

function minify(str) {
	// Extra scape more things
	// str = str.replaceAll('\\n', "\\\\n");
	str = str.replaceAll('\\', '\\\\');

	// str = str.replaceAll('[^\\\n]*\n', "\\n");
	str = str.replaceAll('\n', "\\n");
	str = str.replaceAll('\t', "\\t");
	str = str.replaceAll('"', '\\"');
	str = str.replaceAll("'", "\\'");

	// Escape html reserved words
	str = str.replaceAll('<', '\\<');
	str = str.replaceAll('>', '\\>');
	str = str.replaceAll('&', '\\&');

	str = str.replaceAll('</script>', '<\\/script>');

	// Correct close comment with newline
	str = str.replaceAll('*\\\\n', "*\\n");

	// Remove all comments
	// str = str.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');

	return str;
}

function process_script(re, file_data, data_path) {
	let match;
	while ((match = re.exec(file_data)) !== null) {
		console.log(`\tFound ${Underscore} ${match[0]} ${Reset} start=${match.index} end=${re.lastIndex}.`);

		if (match[1].substring(0,6) != 'inline') {
			console.log('Skipping');
			continue;
		}

		const load_path = match[1].slice(7);

		try {
			var package_data = fs.readFileSync(data_path + '/' + load_path, {encoding:'utf8'});
		} catch (err) {
			console.error('\tError loading ' + load_path);
			continue;
		}

		package_data = '\n<script type="module">\n' + package_data + "\n</script>\n";
		package_data = minify(package_data);

		file_data = file_data.substr(0, match.index) + package_data + file_data.substr(re.lastIndex);
	}
	
	return file_data;
}

function process_css(re, file_data, data_path, add_style_tag = true) {
	let match;
	while ((match = re.exec(file_data)) !== null) {
		console.log(`\tFound ${Underscore} ${match[0]} ${Reset} start=${match.index} end=${re.lastIndex}.`);

		if (match[1].substring(0,6) != 'inline') {
			console.log('Skipping');
			continue;
		}

		const load_path = match[1].slice(7);

		try {
			var package_data = fs.readFileSync(data_path + '/' + load_path, {encoding:'utf8'});
		} catch (err) {
			console.error('\tError loading ' + load_path);
			continue;
		}

		if (add_style_tag) {
			package_data = "\n<style>\n" + package_data + "\n</style>\n";
		}
		
		package_data = package_data.replace(/"/g, "'");
		package_data = minify(package_data);

		file_data = file_data.substr(0, match.index) + package_data + file_data.substr(re.lastIndex);
	}

	return file_data;
}

function process_version(re, file_data) {
	const pjson = require('../package.json');
	let version_data = pjson.version;
	version_data = minify(version_data);

	let match;
	while ((match = re.exec(file_data)) !== null) {
		console.log(`\tFound ${Underscore} ${match[0]} ${Reset} start=${match.index} end=${re.lastIndex}.`);

		file_data = file_data.substr(0, match.index) + version_data + file_data.substr(re.lastIndex);
	}

	return file_data;
}


function process_file(file_path, data_path, production) {
	// Read content of file
	try {
		var data = fs.readFileSync(file_path, {encoding:'utf8'});
	} catch (err) {
		console.error(err);
		return;
	}
	
	// <link href=\"inline:viewer.css\" rel=\"stylesheet\"> 
	var re_pre = /<link +href=\\"(.+?)\\" rel=\\"stylesheet\\">/g;
	var re_prod = /<link +href="(.+?)" rel="stylesheet">/g;
	var re_css = (production ? re_prod : re_pre);
	data = process_css(re_css, data, data_path);

	re_pre = /<script +type=\\"module\\" +src=\\"([^>]+)\\"><\/script>/g;
	re_prod = /<script +type="module" +src="([^>]+)"><\\\/script>/g;
	const re_script = (production ? re_prod : re_pre);
	data = process_script(re_script, data, data_path);

	re_pre = /\$\$\$(.+)\$\$\$/g;
	re_prod = /\$\$\$(.+)\$\$\$/g;
	re_css = (production ? re_prod : re_pre);
	data = process_css(re_css, data, data_path, false);


	const re_version = /\${{VERSION}}/g;
	data = process_version(re_version, data);

	try {
		fs.writeFileSync(file_path, data, {encoding:'utf8'});
	} catch (err) {
		console.error(err);
	}
}


function cli(args) {
	var production = false;
	args = args.slice(2);
	var data_path = args[0];
	if (data_path.startsWith('--')) {
		if (data_path == '--prod') {
			production = true;
		}
		args = args.slice(1);
		data_path = args[0];
	}
	args = args.slice(1);
	console.log('Mode production :', production);
	
	args.forEach(function(path){
		if (fs.existsSync(path)) {
			console.log(' > Inlining content of ' + FgGreen + path + Reset);
			process_file(path, data_path, production);
		} else {
			console.log(' > File ' + FgRed + path + Reset + ' not exists');
		}
	});
}

cli(process.argv);
