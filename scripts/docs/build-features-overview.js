/**
 * @license Copyright (c) 2003-2021, CKSource - Frederico Knabben. All rights reserved.
 * For licensing, see LICENSE.md or https://ckeditor.com/legal/ckeditor-oss-license
 */

/* eslint-env node */

const fs = require( 'fs' );
const path = require( 'path' );
const glob = require( 'glob' );
const chalk = require( 'chalk' );

const DESTINATION_DOCS_PATH = 'docs/builds/guides/integration/features-overview.md';
const PACKAGE_METADATA_PATH_PATTERN = '{,external/*/}packages/*/ckeditor5-metadata.json';

try {
	const numberOfParsedFiles = parseMetadataFiles();

	console.log( `✨ ${ chalk.green( `Content from ${ numberOfParsedFiles } package metadata files has been generated successfully.` ) }` );
} catch ( error ) {
	console.log( `❌ ${ chalk.red( 'An error occurred during parsing a package metadata file.' ) }` );
	console.log( error );
}

/**
 * Main parser function. Its purpose is to:
 * - read all package metadata files,
 * - parse and prepare the data for generating the features' output,
 * - use the parsed data to create a table containing all packages, plugins and their possible HTML output.
 * Returns total number of parsed files.
 *
 * The output table contains 3 columns: "Package", "Plugin" and "HTML output". The "Package" column contains all package names, for which
 * the package metadata file was found. Each table cell in the "Plugin" column has a human-readable name of the plugin (which is a link to
 * the feature documentation) and the name of the class used to create the plugin (which is a link to the API documentation). For each row
 * in the "Plugin" column there is at least one row in the "HTML output" column. If given plugin does not generate any output, the one and
 * only row in the "HTML output" column contains the word "None". Each item from the `htmlOutput` property from the package metadata file
 * corresponds to a separate row in the "HTML output" column. It contains one or more paragraphs with text describing the possible output:
 * HTML elements, their CSS classes, inline styles, other attributes and comments.
 *
 * ┏━━━━━━━━━━━━━━━━━┳━━━━━━━━━━━━━━┳━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
 * ┃     Package     ┃    Plugin    ┃           HTML output          ┃
 * ┣━━━━━━━━━━━━━━━━━╇━━━━━━━━━━━━━━╇━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
 * ┃    package A    │ first plugin │ output #1 for the first plugin ┃
 * ┃                 │              ├────────────────────────────────┨
 * ┃                 │              ┄                                ┄
 * ┃                 │              ├────────────────────────────────┨
 * ┃                 │              │ output #N for the first plugin ┃
 * ┃                 ├──────────────┼────────────────────────────────┨
 * ┃                 ┄              ┄                                ┄
 * ┃                 ├──────────────┼────────────────────────────────┨
 * ┃                 │ last plugin  │ output #1 for the last plugin  ┃
 * ┃                 │              ├────────────────────────────────┨
 * ┃                 │              ┄                                ┄
 * ┃                 │              ├────────────────────────────────┨
 * ┃                 │              │ output #N for the last plugin  ┃
 * ┠─────────────────┼──────────────┼────────────────────────────────┨
 * ┃    package B    │   plugins    │       outputs per plugin       ┃
 * ┄                 ┄              ┄                                ┄
 * ┠─────────────────┼──────────────┼────────────────────────────────┨
 * ┃    package C    │   plugins    │       outputs per plugin       ┃
 * ┄                 ┄              ┄                                ┄
 * ┗━━━━━━━━━━━━━━━━━┷━━━━━━━━━━━━━━┷━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
 *
 * @returns {Number}
 */
function parseMetadataFiles() {
	const parsedFiles = parseFiles()
		.map( packageMetadata => {
			const numberOfRowsPerPackage = packageMetadata.plugins
				.reduce( ( result, plugin ) => result + plugin.htmlOutput.length, 0 );

			const packageNameRowspan = numberOfRowsPerPackage > 1 ?
				`rowspan="${ numberOfRowsPerPackage }"` :
				'';

			return packageMetadata.plugins
				.map( ( plugin, pluginIndex ) => {
					const numberOfRowsPerPlugin = plugin.htmlOutput.length;

					const pluginNameRowspan = numberOfRowsPerPlugin > 1 ?
						`rowspan="${ numberOfRowsPerPlugin }"` :
						'';

					return plugin.htmlOutput
						.map( ( htmlOutput, htmlOutputIndex ) => {
							const packageNameCell = pluginIndex === 0 && htmlOutputIndex === 0 ?
								`<td ${ packageNameRowspan }><code class="nowrap">${ packageMetadata.packageName }</code></td>` :
								'';

							const pluginNameCell = htmlOutputIndex === 0 ?
								`<td ${ pluginNameRowspan }>${ plugin.name }</td>` :
								'';

							return `<tr>${ packageNameCell }${ pluginNameCell }<td>${ htmlOutput }</td></tr>`;
						} )
						.join( '' );
				} )
				.join( '' );
		} );

	const generatedOutput = parsedFiles.join( '' );

	saveGeneratedOutput( generatedOutput );

	return parsedFiles.length;
}

/**
 * Reads and parses all package metadata files, that match the `glob` pattern. The returned array is sorted alphabetically by package name.
 *
 * @returns {Array.<ParsedFile>}
 */
function parseFiles() {
	return glob.sync( PACKAGE_METADATA_PATH_PATTERN )
		.map( readFile )
		.map( file => {
			try {
				return parseFile( file );
			} catch ( error ) {
				error.message = `Failed to parse ${ chalk.bold( file.path ) }\n${ error.message }`;

				throw error;
			}
		} )
		.sort( ( parsedFileA, parsedFileB ) => parsedFileA.packageName.localeCompare( parsedFileB.packageName ) );
}

/**
 * Reads the package metadata file.
 *
 * @param {String} path An absolute file path.
 * @returns {File}
 */
function readFile( path ) {
	return {
		path,
		content: fs.readFileSync( path, 'utf-8' )
	};
}

/**
 * Parses the package metadata file.
 *
 * @param {File} file Contains file path and its content to parse.
 * @returns {ParsedFile}
 */
function parseFile( file ) {
	const metadata = JSON.parse( file.content );

	const packageName = path.basename( path.dirname( file.path ) );

	const plugins = preparePlugins( packageName, metadata.plugins );

	return {
		packageName,
		plugins
	};
}

/**
 * Parses all plugins from package metadata file.
 *
 * @param {String} packageName Package name.
 * @param {Array.<Plugin>} plugins Plugins to parse.
 * @returns {Array.<ParsedPlugin>}
 */
function preparePlugins( packageName, plugins = [] ) {
	return plugins
		.map( plugin => {
			const pluginName = plugin.docs ?
				prepareFeatureLink( plugin ) :
				plugin.name;

			const pluginClassName = prepareApiLink( packageName, plugin );

			const htmlOutput = plugin.htmlOutput ?
				prepareHtmlOutput( plugin.htmlOutput ) :
				[ '<p>None.</p>' ];

			return {
				name: `<p>${ pluginName }</p><p>${ pluginClassName }</p>`,
				htmlOutput
			};
		} );
}

/**
 * Creates link to the plugin's feature documentation.
 *
 * @param {Plugin} plugin Plugin definition.
 * @returns {String}
 */
function prepareFeatureLink( plugin ) {
	const link = /http(s)?:/.test( plugin.docs ) ?
		plugin.docs :
		`../../../${ plugin.docs }`;

	return `<a href="${ link }">${ plugin.name }</a>`;
}

/**
 * Creates link to the plugin's API documentation.
 *
 * @param {String} packageName Package name.
 * @param {Plugin} plugin Plugin definition.
 * @returns {String}
 */
function prepareApiLink( packageName, plugin ) {
	const shortPackageName = packageName.replace( /^ckeditor5-/g, '' );
	const packagePath = plugin.path.replace( /(^src\/)|(\.js$)/g, '' ).replace( /\//g, '_' );
	const link = `../../../api/module_${ shortPackageName }_${ packagePath }-${ plugin.className }.html`;

	return `<a href="${ link }"><code class="nowrap">${ plugin.className }</code></a>`;
}

/**
 * Prepares the HTML output to a format, that is ready to be displayed. The generated array of strings contains paragraphs with applied
 * visual formatting (i.e. <strong> or <code> tags).
 *
 * @param {HtmlOutput} htmlOutput
 * @returns {Array.<String>}
 */
function prepareHtmlOutput( htmlOutput ) {
	return htmlOutput
		.map( entry => {
			const elements = entry.elements ?
				`<p>${
					toArray( entry.elements )
						.map( wrapBy( { prefix: '<strong>', suffix: '</strong>' } ) )
						.map( wrapBy( { prefix: '&lt;', suffix: '&gt;' } ) )
						.map( wrapBy( { prefix: '<code>', suffix: '</code>' } ) )
						.join( ', ' )
				}</p>` :
				'';

			const classes = entry.classes ?
				`<p><code>&lt;… <strong>class</strong>="${
					toArray( entry.classes )
						.join( ' ' )
				}"&gt;</code></p>` :
				'';

			const styles = entry.styles ?
				`<p><code>&lt;… <strong>style</strong>="${
					toArray( entry.styles )
						.map( wrapBy( { suffix: ':*' } ) )
						.join( '; ' )
				}"&gt;</code></p>` :
				'';

			const attributes = entry.attributes ?
				`<p><code>&lt;… ${
					toArray( entry.attributes )
						.map( wrapBy( { prefix: '<strong>', suffix: '</strong>' } ) )
						.map( wrapBy( { suffix: '="*"' } ) )
						.join( ' ' )
				}&gt;</code></p>` :
				'';

			const others = entry.implements ?
				`<p>HTML element may contain classes, styles or attributes, that are created by other plugins, which alter the ${
					toArray( entry.implements )
						.map( wrapBy( { prefix: '&lt;', suffix: '&gt;' } ) )
						.map( wrapBy( { prefix: '<code>', suffix: '</code>' } ) )
						.join( ', ' )
				} element.</p>` :
				'';

			const comment = entry._comment ?
				`<p>${
					entry._comment
						.replace( '<', '&lt;' )
						.replace( '>', '&gt;' )
						.replace( /`(.*?)`/g, '<code>$1</code>' )
				}</p>` :
				'';

			return [ elements, classes, styles, attributes, others, comment ]
				.filter( item => !!item )
				.join( '' );
		} );
}

/**
 * Saves generated output in the destination file.
 *
 * @param {String} output Generated output to be saved in the destination file.
 */
function saveGeneratedOutput( output ) {
	output =
		'<table class="package-metadata">' +
			'<thead>' +
				'<tr>' +
					'<th>Package</th>' +
					'<th>Plugin</th>' +
					'<th>HTML output</th>' +
				'</tr>' +
			'</thead>' +
			'<tbody>' +
				output +
			'</tbody>' +
		'</table>';

	output = fs.readFileSync( DESTINATION_DOCS_PATH, 'utf-8' )
		.replace( /(<!-- features-overview-output-marker -->)[\s\S]*/, `$1\n${ output }\n` );

	fs.writeFileSync( DESTINATION_DOCS_PATH, output );
}

/**
 * Helper, which transforms any value to an array. If the provided value is already an array, it is returned unchanged.
 *
 * @param {*} data The value to transform to an array.
 * @returns {Array.<*>} An array created from data.
 */
function toArray( data ) {
	return Array.isArray( data ) ? data : [ data ];
}

/**
 * Helper (factory), which creates a function, that prepends and/or appends provided value by another value.
 *
 * @param {Object} options Options to define prefix and/or suffix.
 * @param {String} [options.prefix] A string to add as a prefix to provided value. Empty string by default.
 * @param {String} [options.suffix] A string to add as a suffix to provided value. Empty string by default.
 * @returns {Function}
 */
function wrapBy( { prefix = '', suffix = '' } = {} ) {
	return item => `${ prefix }${ item }${ suffix }`;
}

/**
 * @typedef {Object.<String, String|Array.<String>>} HtmlOutput
 * @property {String|Array.<String>} elements HTML elements, that are created or altered by the plugin.
 * @property {String|Array.<String>} classes CSS class names, that may be applied to the HTML elements.
 * @property {String|Array.<String>} styles Inline CSS styles, that may be applied to the HTML elements.
 * @property {String|Array.<String>} attributes Other HTML attributes, that may be applied to the HTML elements.
 * @property {String} implements A name of an element or a pseudo-element, which classes, styles or attributes may be inherited from.
 * @property {String} _comment A human-readable description.
 */

/**
 * @typedef {Object.<String, String|HtmlOutput>} Plugin
 * @property {String} name Plugin name.
 * @property {String} className Plugin class name.
 * @property {String} docs An absolute or relative URL to the plugin's documentation.
 * @property {String} path A path to the file, relative to the metadata file, that exports the plugin.
 * @property {HtmlOutput} htmlOutput An array of objects, that defines all possible HTML elements which can be created by a given plugin.
 */

/**
 * @typedef {Object.<String, String>} ParsedPlugin
 * @property {String} name Plugin name.
 * @property {Array.<String>} htmlOutput Each item in this array contains a separate output definition. This output definition is a string
 * with all elements, classes, styles, attributes and comment combined together with applied visual formatting (i.e. working links, visual
 * emphasis, etc.) and ready to be displayed.
 */

/**
 * @typedef {Object.<String, String} File
 * @property {String} path An absolute file path.
 * @property {String} content File content.
 */

/**
 * @typedef {Object.<String, String|Array.<ParsedPlugin>>} ParsedFile
 * @property {String} packageName Package name.
 * @property {Array.<ParsedPlugin>} plugins An array of all parsed plugins.
 */
