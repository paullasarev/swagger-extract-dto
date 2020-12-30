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

const rimrafAsync = util.promisify(rimraf__default['default']);
const writeFileAsync = util.promisify(fs.writeFile);

const { SyntaxKind, ListFormat } = ts__default['default'];

const {
  createVariableStatement,
  createStringLiteral,
  createVariableDeclaration,
  createKeywordTypeNode,
  createModifier,
  createArrowFunction,
  createParameterDeclaration,
  createNoSubstitutionTemplateLiteral,
  createImportDeclaration,
  createImportClause,
  createNamedImports,
  createImportSpecifier,
  createIdentifier,
  createArrayTypeNode,
  createNumericLiteral,
  createTrue,
  createFalse,
  createEnumDeclaration,
  createEnumMember,
  createTypeReferenceNode,
  createInterfaceDeclaration,
  createPropertySignature,
  createToken
} = ts__default['default'].factory;

function getSchema (parameter) {
  return lodash.get(parameter, 'schema', parameter);
}

function processParameter (parameter, DTOs) {
  const { name, in: ind } = parameter;
  if (ind === 'path') {
    DTOs.path[name] = parameter;
  } else if (ind === 'query') {
    DTOs.query[name] = parameter;
  } else if (ind === 'header') {
    DTOs.header[name] = parameter;
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

  const content = printer.printList(
    ListFormat.MultiLine |
      ListFormat.PreserveLines |
      ListFormat.SpaceAfterList |
      ListFormat.PreferNewLine,
    nodes,
    sourceFile
  );
  // const content = format(code, { parser: 'typescript' });
  await writeFileAsync(fileName, content);
  console.log(`  wrote ${fileName}`);
}

function concatName (baseName, name) {
  if (!name) {
    return baseName;
  }
  return baseName ? lodash.camelCase(`${baseName}-${name}`) : lodash.camelCase(name);
}

function makeEnumMember (value) {
  switch (typeof value) {
    case 'boolean':
      return value ? createTrue() : createFalse();
    case 'number':
      return createNumericLiteral(value);
    case 'string':
      return createStringLiteral(value);
  }
}

const makeConstantName = (name) => {
  const prepared = lodash.snakeCase(name).toUpperCase();
  if (/^\d/.test(prepared)) {
    return `T_${prepared}`;
  }
  return prepared;
};

function makeEnumDeclaration (name, values) {
  return createEnumDeclaration(
    undefined,
    [createModifier(SyntaxKind.ExportKeyword)],
    createIdentifier(name),
    lodash.map(values, (value) => {
      return createEnumMember(makeConstantName(value), makeEnumMember(value));
    })
  );
}

function makeTypeName (name) {
  return name.substr(0, 1).toUpperCase() + name.substr(1);
}

function makeInterfaceNode (schema, typeContext, name) {
  // const name = makeTypeName(concatName(typeContext.rootName, parentName));

  const properties = lodash.get(schema, ['properties'], {});
  const props = lodash.map(properties, (property, propName) => {

    return createPropertySignature(
      undefined,
      createIdentifier(propName),
       undefined ,
      makeTypeNode(property, typeContext, propName),
      undefined
    );
  });

  return createInterfaceDeclaration(
    undefined,
    [createModifier(SyntaxKind.ExportKeyword)],
    createIdentifier(name),
    undefined,
    undefined,
    props
  );
}

function typeContextAddEnum (typeContext, node) {
  if (lodash.find(typeContext.enums, { name: node.name })) {
    return;
  }
  typeContext.enums.push(node);
}

function makeTypeNode (parameter, typeContext, parentName = undefined) {
  if (!parameter) {
    return null;
  }
  if (parameter.enum) {
    const enumName = makeTypeName(concatName(typeContext.rootName, parentName));
    typeContextAddEnum(typeContext, makeEnumDeclaration(enumName, parameter.enum));

    return createTypeReferenceNode(createIdentifier(enumName));
  }
  if (parameter.type === 'string') {
    return createKeywordTypeNode(SyntaxKind.StringKeyword);
  }
  if (parameter.type === 'integer') {
    return createKeywordTypeNode(SyntaxKind.NumberKeyword);
  }
  if (parameter.type === 'boolean') {
    return createKeywordTypeNode(SyntaxKind.BooleanKeyword);
  }
  if (parameter.type === 'array') {
    return createArrayTypeNode(
      makeTypeNode(parameter.items, typeContext, concatName(parentName, parameter.name))
    );
  }
  if (parameter.type === 'object') {
    const interfaceName = makeTypeName(concatName(typeContext.rootName, parentName));
    const interfaceNode = makeInterfaceNode(parameter, typeContext, interfaceName);
    typeContext.interfaces.push(interfaceNode);
    return createTypeReferenceNode(createIdentifier(interfaceName));
  }
  return createKeywordTypeNode(SyntaxKind.AnyKeyword);
}

const parameterDeclaration = (typeContext) => (parameter) => {
  return createParameterDeclaration(
    undefined,
    undefined,
    undefined,
    parameter.name,
    undefined,
    makeTypeNode(getSchema(parameter), typeContext),
    undefined
  );
};

function createImport (libName, names) {
  return createImportDeclaration(
    /* decorators */ undefined,
    /* modifiers */ undefined,
    createImportClause(
      undefined,
      createNamedImports(
        lodash.map(names, (name) => createImportSpecifier(undefined, createIdentifier(name)))
      )
    ),
    createStringLiteral(libName, true)
  );
}

function makeStringVariable (name, initValue) {
  return createVariableStatement(
    [createModifier(SyntaxKind.ExportKeyword), createModifier(SyntaxKind.ConstKeyword)],
    createVariableDeclaration(
      name,
      undefined,
      createKeywordTypeNode(SyntaxKind.StringKeyword),
      createStringLiteral(initValue, true)
    )
  );
}

function createTypeContext (rootName) {
  return {
    rootName,
    enums: [],
    imports: [],
    interfaces: [],
    endpointNode: undefined
  };
}

function makeSubstitutionArrowNode (baseName, parameters, text) {
  return createVariableStatement(
    [createModifier(SyntaxKind.ExportKeyword), createModifier(SyntaxKind.ConstKeyword)],
    createVariableDeclaration(
      `ENDPOINT_${baseName}`,
      undefined,
      undefined,
      createArrowFunction(
        [],
        undefined,
        parameters,
        undefined,
        undefined,
        createNoSubstitutionTemplateLiteral(text, text)
      )
    )
  );
}

function makeOptionalAnyParameter (name) {
  return createParameterDeclaration(
    undefined,
    undefined,
    undefined,
    name,
    createToken(SyntaxKind.QuestionToken),
    createKeywordTypeNode(SyntaxKind.AnyKeyword),
    undefined
  );
}

function makeEndpointNodes (typeContext, DTOs, baseName, pathApiText) {
  const parameterDeclarationFunc = parameterDeclaration(typeContext);

  if (lodash.isEmpty(DTOs.path) && lodash.isEmpty(DTOs.query)) {
    typeContext.endpointNode = makeStringVariable(`ENDPOINT_${baseName}`, pathApiText);
  } else {
    const parameters = [
      ...lodash.map(DTOs.path, parameterDeclarationFunc),
      ...lodash.map(DTOs.query, parameterDeclarationFunc)
    ];

    let apiText;
    if (lodash.isEmpty(DTOs.query)) {
      apiText = pathApiText;
    } else {
      parameters.push(makeOptionalAnyParameter('options'));
      apiText = `${pathApiText}?${'${'}stringify({${lodash.map(DTOs.query, (param) => param.name).join(
        ', '
      )}}, options)}`;
      typeContext.imports.push(createImport('query-string', ['stringify']));
    }

    typeContext.endpointNode = makeSubstitutionArrowNode(baseName, parameters, apiText);
  }
}

function makeBodyNodes (typeContext, DTOs, baseName) {
  if (!DTOs.body) {
    return;
  }

  makeTypeNode(DTOs.body.schema, typeContext, 'Body');
}

function makeResponseNodes (typeContext, DTOs, baseName) {
  if (!DTOs.response) {
    return;
  }

  makeTypeNode(DTOs.response.schema, typeContext, 'Response');
}

async function processApiMethod (baseName, apiPath, DTOs) {
  const apiNodes = [];
  const pathApiText = apiPath.replace(/{/g, '${');
  const typeContext = createTypeContext(pathApiText);

  makeEndpointNodes(typeContext, DTOs, baseName, pathApiText);
  makeBodyNodes(typeContext, DTOs);
  makeResponseNodes(typeContext, DTOs);

  if (typeContext.imports.length) {
    apiNodes.push(...typeContext.imports);
  }
  if (typeContext.enums.length) {
    apiNodes.push(...typeContext.enums);
  }
  if (typeContext.interfaces.length) {
    apiNodes.push(...typeContext.interfaces);
  }
  apiNodes.push(typeContext.endpointNode);

  return apiNodes;
}

async function processPaths (root, context, path$1) {
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
        header: {},
        body: undefined,
        response: undefined
      };
      if (methodNode.parameters) {
        for (const parameter of methodNode.parameters) {
          processParameter(parameter, DTOs);
        }
      }
      if (!DTOs.body) {
        DTOs.body = lodash.get(methodNode, 'requestBody.content["application/json"]');
      }

      DTOs.response = lodash.get(methodNode, 'responses.200.content["application/json"]');
      if (!DTOs.response) {
        DTOs.response = lodash.get(methodNode, 'responses.200');
      }

      const baseName = `${lodash.camelCase(apiPath)}_${method}`;
      const apiNodes = await processApiMethod(baseName, apiPath, DTOs);

      const apiFileName = path.join(targetDir, `${baseName}.ts`);
      await writeTsFile(apiFileName, apiNodes);
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
