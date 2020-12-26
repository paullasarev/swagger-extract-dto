'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var path = require('path');
var yargs = require('yargs/yargs');
var helpers = require('yargs/helpers');
var fs = require('fs');
var util = require('util');
var mkdirp = require('mkdirp');
var ts = require('typescript');
var rimraf = require('rimraf');
var lodash = require('lodash');
var RefParser = require('json-schema-ref-parser');

function _interopDefaultLegacy (e) { return e && typeof e === 'object' && 'default' in e ? e : { 'default': e }; }

var yargs__default = /*#__PURE__*/_interopDefaultLegacy(yargs);
var mkdirp__default = /*#__PURE__*/_interopDefaultLegacy(mkdirp);
var ts__default = /*#__PURE__*/_interopDefaultLegacy(ts);
var rimraf__default = /*#__PURE__*/_interopDefaultLegacy(rimraf);
var RefParser__default = /*#__PURE__*/_interopDefaultLegacy(RefParser);

/* eslint no-console: 0 */
// import { omitDeep } from '../utilities/omitDeep/omitDeep.js'
// import glob from 'glob';

const rimrafAsync = util.promisify(rimraf__default['default']);
const writeFileAsync = util.promisify(fs.writeFile);

function processParameter (parameter, DTOs) {
  const { name, in: ind } = parameter;
  if (ind === 'path') {
    DTOs.path[name] = parameter;
  } else if (ind === 'query') {
    DTOs.query[name] = parameter;
  } else if (ind === 'body') {
    DTOs.body = parameter;
  }
}

async function writeTsFile (fileName, nodes) {
  const printer = ts__default['default'].createPrinter({
    newLine: ts__default['default'].NewLineKind.LineFeed
  });

  const sourceFile = ts__default['default'].createSourceFile(
    fileName,
    '',
    ts__default['default'].ScriptTarget.ES2017,
    true,
    ts__default['default'].ScriptKind.TS
  );
  // const content = map(nodes, (node) => printer.printNode(ts.EmitHint.Unspecified, node))
  // .join('\n');
  //
  // await writeFileAsync(fileName, content);
  const content = printer.printList(ts__default['default'].ListFormat.SingleLine, nodes, sourceFile);
  await writeFileAsync(fileName, content);
  console.log(`  wrote ${fileName}`);
}

const {
  createVariableStatement,
  createStringLiteral,
  createVariableDeclaration,
  createKeywordTypeNode,
  // createVariableDeclarationList,
  createModifier
} = ts__default['default'].factory;

const { SyntaxKind } = ts__default['default'];

async function processApiMethod (apiPath, method, DTOs, targetDir) {
  const baseName = `${lodash.camelCase(apiPath)}_${method}`;
  const apiFileName = path.join(targetDir, `${baseName}.ts`);
  const apiNodes = [];

  // const node = createVariableStatement(
  //   [createModifier(SyntaxKind.ExportKeyword)],
  //   createVariableDeclarationList(
  //     [
  //       createVariableDeclaration(
  //         `ENDPOINT_${baseName}`,
  //         undefined,
  //         createKeywordTypeNode(SyntaxKind.StringKeyword),
  //         createStringLiteral(apiPath),
  //       ),
  //     ],
  //     NodeFlags.Const,
  //   ),
  // );
  const node = createVariableStatement(
    [createModifier(SyntaxKind.ExportKeyword), createModifier(SyntaxKind.ConstKeyword)],
    createVariableDeclaration(
      `ENDPOINT_${baseName}`,
      undefined,
      createKeywordTypeNode(SyntaxKind.StringKeyword),
      createStringLiteral(apiPath)
    )
  );

  apiNodes.push(node);

  await writeTsFile(apiFileName, apiNodes);
}

async function processPaths (root, context, path) {
  context.nodes++;
  const { targetDir } = context;
  for (const apiPath in root) {
    const apiNode = root[apiPath];
    console.log(apiPath);

    for (const method in apiNode) {
      const methodNode = apiNode[method];

      const DTOs = {
        path: {},
        query: {},
        body: undefined,
        response: undefined
      };
      for (const parameter of methodNode.parameters) {
        processParameter(parameter, DTOs);
      }
      DTOs.response = lodash.get(methodNode, 'responses.200');

      await processApiMethod(apiPath, method, DTOs, targetDir);
    }
  }
}

async function processRoot (root, context, path) {
  context.nodes++;
  for (const key in root) {
    const node = root[key];
    switch (key) {
      case 'info': {
        context.info = node;
        break;
      }
      case 'swagger': {
        context.version = node;
        break;
      }
      case 'openapi': {
        context.version = node;
        break;
      }
      case 'paths': {
        await processPaths(node, context);
        break;
      }
    }
  }
}

async function traverse (root, context) {
  await processRoot(root, context);
}

async function processFile (apiFile, targetDir) {
  try {
    console.log('clear dir', targetDir);
    await rimrafAsync(targetDir);
    console.log('make dir', targetDir);
    await mkdirp__default['default'](targetDir);
    console.log('dereference', apiFile);
    const parser = new RefParser__default['default']();
    const jsonSchema = await parser.dereference(apiFile, {
      circular: 'ignore'
    });
    const context = { nodes: 0, targetDir };
    console.log('traverse', apiFile);
    await traverse(jsonSchema, context);
    console.log(`processed ${context.nodes} nodes`);

    const fileName = path.join(targetDir, 'info.json');
    console.log(`write ${fileName}`);
    await writeFileAsync(fileName, JSON.stringify(context, null, 2));

    console.log('done');
  } catch (e) {
    console.log(e);
  }
}

const generate = (apiFile, targetDir) => {
  // const pattern = join(targetDir, filesGlob)
  // console.log('process', pattern)
  // const files = glob.sync(pattern)
  // const context = { count: 0 }
  // files.forEach(processFile(filesExt, context))
  processFile(apiFile, targetDir);
  // console.log(`process ${context.count} files`)
};

const SCHEMA_EXT = '.schema.json';
const SCHEMA_FILES = `/**/*${SCHEMA_EXT}`;

const argv = yargs__default['default'](helpers.hideBin(process.argv))
  .usage('Usage: $0 [options]')
  // .usage('Usage: $0 <command> [options]')
  // .command('count', 'Count the lines in a file')
  .example('$0 -f foo.json -o ./api', 'process foo.json and place definitions to ./api folder')
  .alias('f', 'file')
  .nargs('f', 1)
  .describe('f', 'use a Swagger API file')
  .alias('o', 'out')
  .nargs('o', 1)
  .describe('o', 'output folder')
  .demandOption(['f', 'o'])
  .help('h')
  .alias('h', 'help')
  .epilog('copyright 2021')
  .argv;

generate(path.resolve(argv.file), path.resolve(argv.out));

exports.SCHEMA_EXT = SCHEMA_EXT;
exports.SCHEMA_FILES = SCHEMA_FILES;
