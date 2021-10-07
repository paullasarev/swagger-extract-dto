#! /usr/bin/env node

'use strict';

var path = require('path');
var yargs = require('yargs/yargs');
var helpers = require('yargs/helpers');
var fs = require('fs');
var util = require('util');
var mkdirp = require('mkdirp');
var ts = require('typescript');
var rimraf = require('rimraf');
var lodash = require('lodash');
var prettier = require('prettier');
var RefParser = require('json-schema-ref-parser');

function _interopDefaultLegacy (e) { return e && typeof e === 'object' && 'default' in e ? e : { 'default': e }; }

var yargs__default = /*#__PURE__*/_interopDefaultLegacy(yargs);
var mkdirp__default = /*#__PURE__*/_interopDefaultLegacy(mkdirp);
var ts__default = /*#__PURE__*/_interopDefaultLegacy(ts);
var rimraf__default = /*#__PURE__*/_interopDefaultLegacy(rimraf);
var RefParser__default = /*#__PURE__*/_interopDefaultLegacy(RefParser);

const { reduce, isObject, isArray, map } = require('lodash');

const MAX_DEEP_LEVEL = 100;

function omitDeep (value, allKeys, level = 0, maxLevel = MAX_DEEP_LEVEL) {
  if (level > maxLevel) {
    return value;
  }

  if (typeof value === 'undefined') {
    return value;
  }

  const keys = isArray(allKeys) ? allKeys : [allKeys];

  if (isArray(value)) {
    return map(value, (item) => omitDeep(item, keys, level + 1, maxLevel));
  }

  if (!isObject(value)) {
    return value;
  }

  const result = reduce(
    value,
    (acc, val, key) => {
      if (keys.includes(key)) {
        return acc;
      }
      acc[key] = omitDeep(val, keys, level + 1, maxLevel);
      return acc;
    },
    {}
  );

  return result;
}

module.exports = {
  omitDeep
};

/* eslint no-console: 0 */

const rimrafAsync = util.promisify(rimraf__default["default"]);
const writeFileAsync = util.promisify(fs.writeFile);

const { SyntaxKind } = ts__default["default"];

const {
  createVariableStatement,
  createStringLiteral,
  createArrayLiteralExpression,
  createVariableDeclaration,
  createKeywordTypeNode,
  createModifier,
  createArrowFunction,
  createCallExpression,
  createPropertyAccessExpression,
  createParameterDeclaration,
  createPropertyAssignment,
  createObjectLiteralExpression,
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
  createIndexSignature,
  createToken,
  createNull,
  createTypeAliasDeclaration,
  createHeritageClause,
  createExpressionWithTypeArguments,
  createUnionTypeNode,
} = ts__default["default"].factory;

function getSchema(parameter) {
  return lodash.get(parameter, 'schema', parameter);
}

function makeParameterName(parameter) {
  return {
    ...parameter,
    rawName: parameter.name,
    name: lodash.camelCase(parameter.name),
  };
}

function processParameter(rootContext, rawParameter, DTOs) {
  let param = { ...rawParameter };
  if (param.$ref) {
    const { name, parameter } = dereferenceInternalRef(rootContext, param.$ref, true);
    param = { ...parameter, name };
  }
  const parameter = makeParameterName(param);
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

function printTsFile(allNodes, fileName) {
  const nodes = cleanupNodes(allNodes);
  const printer = ts__default["default"].createPrinter({
    newLine: ts__default["default"].NewLineKind.LineFeed,
  });

  const sourceFile = ts__default["default"].createSourceFile(
    fileName,
    '',
    ts__default["default"].ScriptTarget.ES2017,
    true,
    ts__default["default"].ScriptKind.TS,
  );

  const codeList = lodash.map(nodes, (node) => {
    if (lodash.isString(node)) {
      return node;
    }
    return printer.printNode(ts__default["default"].EmitHint.Unspecified, node, sourceFile);
  });

  const code =
    [
      '/* eslint-disable */',
      '/**',
      ' * PLEASE DO NOT MODIFY IT BY HAND',
      ' * This file was automatically generated',
      ' */',
      '',
      '',
      ...codeList,
    ].join('\n') + '\n';

  return prettier.format(code, {
    parser: 'typescript',
    bracketSpacing: true,
    jsxBracketSameLine: false,
    jsxSingleQuote: false,
    printWidth: 150,
    singleQuote: true,
    trailingComma: 'all',
    endOfLine: 'auto',
    useTabs: false,
    tabWidth: 2,
    semi: true,
    arrowParens: 'avoid',
  });
}

async function writeTsFile(fileName, allNodes) {
  const content = printTsFile(allNodes, fileName);
  await writeFileAsync(fileName, content);
  console.log(`  wrote ${fileName}`);
}

function concatName(baseName, name) {
  if (!name) {
    return baseName;
  }
  return baseName ? lodash.camelCase(`${baseName}-${name}`) : lodash.camelCase(name);
}

function makeEnumFieldValue(value) {
  switch (typeof value) {
    case 'boolean':
      return value ? createTrue() : createFalse();
    case 'number':
      return createNumericLiteral(value);
    case 'string':
      return createStringLiteral(value);
  }
}

const makeEnumFieldName = (name, index) => {
  const prepared = lodash.snakeCase(name).toUpperCase();
  if (lodash.isEmpty(prepared)) {
    return `VALUE_${index}`;
  }
  if (/^\d/.test(prepared)) {
    return `T_${prepared}`;
  }
  return prepared;
};

function makeEnumDeclaration(name, values) {
  return createEnumDeclaration(
    undefined,
    [createModifier(SyntaxKind.ExportKeyword)],
    createIdentifier(name),
    lodash.map(values, (value, index) => {
      return createEnumMember(makeEnumFieldName(value, index), makeEnumFieldValue(value));
    }),
  );
}

function makeTypeName(name) {
  const result = name.substr(0, 1).toUpperCase() + name.substr(1);
  return lodash.isEmpty(result) ? 'Root' : result;
}

function isIdentifier(name) {
  return /^[a-zA-Z_$][0-9a-zA-Z_$]+$/.test(name);
}

function makeKStringNode(typeNode) {
  const param = createParameterDeclaration(
    undefined,
    undefined,
    undefined,
    'k',
    undefined,
    createKeywordTypeNode(SyntaxKind.StringKeyword),
    undefined,
  );
  return createIndexSignature(undefined, undefined, [param], typeNode);
}

function getHeritageClauses(extendsNodes) {
  if (!extendsNodes) {
    return undefined;
  }
  return [
    createHeritageClause(
      SyntaxKind.ExtendsKeyword,
      lodash.map(extendsNodes, (extendNode) => createExpressionWithTypeArguments(extendNode, undefined)),
    ),
  ];
}

function getPropertyNodeExtractor(schema, typeContext, rootName) {
  return (property, propName) => {
    const isRequired = lodash.get(schema, ['required'], []).includes(propName);
    const nameNode = isIdentifier(propName)
      ? createIdentifier(propName)
      : createStringLiteral(propName);

    return createPropertySignature(
      undefined,
      nameNode,
      isRequired ? undefined : createToken(SyntaxKind.QuestionToken),
      makeTypeNode(property, typeContext, rootName, propName),
    );
  };
}

function makeInterfaceNode(schema, typeContext, rootName, name, extendsNodes) {
  const additionalProperties = lodash.get(schema, ['additionalProperties']);
  const properties = {
    ...lodash.get(schema, ['properties'], {}),
  };
  const props = lodash.map(properties, getPropertyNodeExtractor(schema, typeContext, rootName));

  if (!props.length) {
    props.push(
      makeKStringNode(
        additionalProperties
          ? makeTypeNode(additionalProperties, typeContext, rootName, name, extendsNodes)
          : createKeywordTypeNode(SyntaxKind.AnyKeyword),
      ),
    );
  }

  const heritageClauses = getHeritageClauses(extendsNodes);

  return createInterfaceDeclaration(
    undefined,
    [createModifier(SyntaxKind.ExportKeyword)],
    createIdentifier(name),
    undefined,
    heritageClauses,
    props,
  );
}

function getPropertySchemaExtractor(schema, typeContext, rootName) {
  return (property, propName) => {
    const isRequired = lodash.get(schema, ['required'], []).includes(propName);
    const name = isIdentifier(propName) ? propName : `'${propName}'`;

    let propertySchema = makeSchemaNode(property, typeContext, rootName, name);
    if (isRequired) {
      propertySchema = createCallProperty(propertySchema, 'required');
    }

    return createPropertyAssignment(name, propertySchema);
  };
}

function getPropertyJsSchemaExtractor(schema, typeContext, rootName) {
  return (property, propName) => {
    const name = isIdentifier(propName) ? propName : `'${propName}'`;
    let propertySchema = makeJsSchemaNode(property, typeContext, rootName, name);
    return createPropertyAssignment(name, propertySchema);
  };
}

function makeSchemaRefDeclarationNode(schema, typeContext, rootName, name) {
  // ...get(schema, ['additionalProperties']),
  const joiName = `schema_${name}`;
  const node = makeSchemaNode(schema, typeContext, name, rootName);
  return createVariableStatement(
    [createModifier(SyntaxKind.ExportKeyword), createModifier(SyntaxKind.ConstKeyword)],
    createVariableDeclaration(joiName, undefined, undefined, node),
  );
}

function makeSchemaDeclarationNode(schema, typeContext, rootName, name) {
  const joiName = `schema_${name}`;
  const props = lodash.map(schema.properties, getPropertySchemaExtractor(schema, typeContext, rootName));
  return createVariableStatement(
    [createModifier(SyntaxKind.ExportKeyword), createModifier(SyntaxKind.ConstKeyword)],
    createVariableDeclaration(
      joiName,
      undefined,
      undefined,
      joiNode('object', [createObjectLiteralExpression(props)]),
    ),
  );
}

function makeJsSchemaRefDeclarationNode(schema, typeContext, rootName, name) {
  // ...get(schema, ['additionalProperties']),
  const joiName = `schema_${name}`;
  const node = makeJsSchemaNode(schema, typeContext, name, rootName);
  return createVariableStatement(
    [createModifier(SyntaxKind.ExportKeyword), createModifier(SyntaxKind.ConstKeyword)],
    createVariableDeclaration(joiName, undefined, undefined, node),
  );
}

function makeJsSchemaDeclarationNode(schema, typeContext, rootName, name) {
  const jsName = `schema_${name}`;
  const props = lodash.map(schema.properties, getPropertyJsSchemaExtractor(schema, typeContext, rootName));
  const required = lodash.uniq(
    lodash.reduce(
      schema.properties,
      (acc, item, key) => (item.required ? [...acc, key] : acc),
      lodash.get(schema, 'required', []),
    ),
  );
  return createVariableStatement(
    [createModifier(SyntaxKind.ExportKeyword), createModifier(SyntaxKind.ConstKeyword)],
    createVariableDeclaration(jsName, undefined, undefined, jsObjectNode(props, required)),
  );
}

function typeContextAddEnum(typeContext, node) {
  if (lodash.find(typeContext.enums, { name: node.name })) {
    return;
  }
  typeContext.enums.push(node);
}

function dereferenceInternalRef(rootContext, ref, useDereferenced = false) {
  if (ref.substr(0, 2) !== '#/') {
    console.log('invalid ref', ref);
    return { parameter: undefined, name: undefined };
  }
  const refPath = ref.replace('#/', '').split(/#?\//);
  const lastName = lodash.last(refPath);
  const name = makeTypeName(lodash.camelCase(lastName));
  const schema = useDereferenced ? rootContext.dereferencedSchema : rootContext.jsonSchema;
  const parameter = lodash.get(schema, refPath);
  return { name, parameter };
}

function addImport(typeContext, libName, names, addNewLine = false) {
  const key = JSON.stringify({ libName, names });
  if (lodash.has(typeContext.imported, key)) {
    return;
  }
  const importNode = createImport(libName, names);
  typeContext.imports.push(importNode);
  typeContext.imported[key] = importNode;
  if (addNewLine) {
    typeContext.imports.push('\n');
  }
}

function addJoiImport(typeContext, name) {
  const key = `schema_${name}`;
  if (lodash.has(typeContext.joiImported, key)) {
    return;
  }

  const importNode = createImport(`./${name}.joi`, [key]);
  typeContext.joiImports.push(importNode);
  typeContext.joiImported[key] = importNode;

  const importJsNode = createImport(`./${name}.schema`, [key]);
  typeContext.jsImports.push(importJsNode);
}

function isSimpleNode(node) {
  switch (node.kind) {
    case SyntaxKind.StringKeyword:
    case SyntaxKind.NumberKeyword:
    case SyntaxKind.BooleanKeyword:
    case SyntaxKind.ArrayType:
      return true;
    default:
      return false;
  }
}

function schemaInternalRefType(typeContext, ref) {
  const { rootContext } = typeContext;
  const { name } = dereferenceInternalRef(rootContext, ref);
  addJoiImport(typeContext, name);
  return createIdentifier(`schema_${name}`);
}

function dereferenceInternalRefType(typeContext, ref) {
  const { rootContext } = typeContext;
  const { name, parameter } = dereferenceInternalRef(rootContext, ref);
  if (!parameter) {
    console.log('invalid ref path', ref);
    return createNull();
  }
  if (!rootContext.definitions[name]) {
    const newTypeContext = makeTypeContext(name, rootContext);
    rootContext.definitions[name] = newTypeContext;

    const node = makeTypeNode(parameter, newTypeContext, name, undefined);
    if (isSimpleNode(node)) {
      addType(newTypeContext, name, node);
    }
    rootContext.definitions[name].rootContext = null;
  }

  addImport(typeContext, `./${name}`, [name]);

  return createIdentifier(name);
}

function allOfSchema(allOf, typeContext, rootName, parentName) {
  if (!lodash.isArray(allOf)) {
    return createNull();
  }
  if (allOf.length === 1) {
    return makeTypeNode(allOf[0], typeContext, rootName, parentName);
  }

  const [extendSchemas, implementSchemas] = lodash.partition(allOf, (schema) => !!schema.$ref);

  const extendsNodes = lodash.map(extendSchemas, (schema) =>
    dereferenceInternalRefType(typeContext, schema.$ref),
  );
  const implementSchema = lodash.merge({}, ...implementSchemas);
  return makeTypeNode(implementSchema, typeContext, rootName, parentName, extendsNodes);
}

function oneOfSchema(oneOf, typeContext, rootName, parentName) {
  if (!lodash.isArray(oneOf)) {
    return createNull();
  }
  if (oneOf.length === 1) {
    return makeTypeNode(oneOf[0], typeContext, rootName, parentName);
  }

  const name = makeTypeName(concatName(rootName, parentName));
  const node = createUnionTypeNode(
    lodash.map(oneOf, (schema, index) =>
      makeTypeNode(schema, typeContext, name, `struct${index > 0 ? index : ''}`),
    ),
  );
  addType(typeContext, name, node);
  return createTypeReferenceNode(createIdentifier(name));
}

function addJoiSchema(parameter, typeContext, rootName, interfaceName, byRef = true) {
  const name = `schema_${interfaceName}`;

  let schemaNode = typeContext.joiSchemasByName[name];
  if (!schemaNode) {
    if (byRef) {
      schemaNode = makeSchemaRefDeclarationNode(parameter, typeContext, rootName, interfaceName);
    } else {
      schemaNode = makeSchemaDeclarationNode(parameter, typeContext, rootName, interfaceName);
    }

    typeContext.joiSchemasByName[name] = schemaNode;
    typeContext.joiSchemas.push(schemaNode);
  }

  return schemaNode;
}

function addJsSchema(parameter, typeContext, rootName, interfaceName, byRef = true) {
  const name = `schema_${interfaceName}`;

  let jsSchemaNode = typeContext.jsSchemasByName[name];
  if (!jsSchemaNode) {
    if (byRef) {
      jsSchemaNode = makeJsSchemaRefDeclarationNode(
        parameter,
        typeContext,
        rootName,
        interfaceName,
      );
    } else {
      jsSchemaNode = makeJsSchemaDeclarationNode(parameter, typeContext, rootName, interfaceName);
    }

    typeContext.jsSchemasByName[name] = jsSchemaNode;
    typeContext.jsSchemas.push(jsSchemaNode);
  }

  return jsSchemaNode;
}

function makeTypeNode(parameter, typeContext, rootName, parentName, extendsNodes = undefined) {
  if (!parameter) {
    return null;
  }
  if (parameter.allOf) {
    return allOfSchema(parameter.allOf, typeContext, rootName, parentName);
  }
  if (parameter.oneOf) {
    return oneOfSchema(parameter.oneOf, typeContext, rootName, parentName);
  }
  if (parameter.$ref) {
    return createTypeReferenceNode(dereferenceInternalRefType(typeContext, parameter.$ref));
  }
  if (parameter.enum) {
    const enumName = makeTypeName(concatName(rootName, parentName));
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
      makeTypeNode(parameter.items, typeContext, rootName, concatName(parentName, parameter.name)),
    );
  }
  if (parameter.type === 'object') {
    const interfaceName = makeTypeName(concatName(typeContext.rootName, parentName));
    const interfaceNode = makeInterfaceNode(
      parameter,
      typeContext,
      rootName,
      interfaceName,
      extendsNodes,
    );
    typeContext.interfaces.push(interfaceNode);

    addJoiSchema(parameter, typeContext, rootName, interfaceName);
    addJsSchema(parameter, typeContext, rootName, interfaceName);

    return createTypeReferenceNode(createIdentifier(interfaceName));
  }
  return createKeywordTypeNode(SyntaxKind.AnyKeyword);
}

function createCallProperty(node, name, args = undefined) {
  return createCallExpression(createPropertyAccessExpression(node, name), undefined, args);
}

function joiNode(joiType, args = undefined) {
  return createCallProperty(createIdentifier('Joi'), joiType, args);
}

function jsConstSchemaNode(jsSchemaName) {
  return createPropertyAccessExpression(createIdentifier('jsonToolbox'), jsSchemaName);
}

function jsObjectNode(props, required = []) {
  // return createIdentifier('object');
  return createObjectLiteralExpression([
    createPropertyAssignment('type', createStringLiteral('object', true)),
    createPropertyAssignment('properties', createObjectLiteralExpression(props)),
    ...(required.length
      ? [
          createPropertyAssignment(
            'required',
            createArrayLiteralExpression(lodash.map(required, (prop) => createStringLiteral(prop))),
          ),
        ]
      : []),
    createPropertyAssignment('default', createObjectLiteralExpression([])),
    // ...props,
  ]);
}

function jsEnumNode(values) {
  return createCallProperty(createIdentifier('jsonToolbox'), 'enumSchema', [
    createArrayLiteralExpression(lodash.map(values, (item) => createStringLiteral(item))),
  ]);
}

function jsArrayNode(schema) {
  return createCallProperty(createIdentifier('jsonToolbox'), 'arraySchema', [
    schema,
    createArrayLiteralExpression([]),
  ]);
}

function joiArrayNode(itemsSchema) {
  return createCallProperty(createCallProperty(createIdentifier('Joi'), 'array'), 'items', [
    itemsSchema,
  ]);
}

function makeSchemaNode(parameter, typeContext, rootName, parentName) {
  if (!parameter) {
    return null;
  }
  // if (parameter.allOf) {
  //   return allOfSchema(parameter.allOf, typeContext, rootName, parentName);
  // }
  // if (parameter.oneOf) {
  //   return oneOfSchema(parameter.oneOf, typeContext, rootName, parentName);
  // }
  if (parameter.$ref) {
    return schemaInternalRefType(typeContext, parameter.$ref);
  }
  // if (parameter.enum) {
  //   const enumName = makeTypeName(concatName(rootName, parentName));
  //   typeContextAddEnum(typeContext, makeEnumDeclaration(enumName, parameter.enum));
  //
  //   return createTypeReferenceNode(createIdentifier(enumName));
  // }
  if (parameter.type === 'string') {
    const node = joiNode('string');
    if (parameter.enum) {
      return createCallProperty(
        node,
        'valid',
        lodash.map(parameter.enum, (value) => createStringLiteral(value, true)),
      );
    }
    return node;
  }
  if (parameter.type === 'integer') {
    return joiNode('number');
  }
  if (parameter.type === 'boolean') {
    return joiNode('boolean');
  }
  if (parameter.type === 'array') {
    return joiArrayNode(
      makeSchemaNode(
        parameter.items,
        typeContext,
        rootName,
        concatName(parentName, parameter.name),
      ),
    );
  }
  if (parameter.type === 'object') {
    const interfaceName = makeTypeName(concatName(typeContext.rootName, parentName));

    addJoiSchema(parameter, typeContext, rootName, interfaceName, false);
    const schemaName = `schema_${interfaceName}`;
    return createIdentifier(schemaName);
  }

  return createCallExpression(
    createPropertyAccessExpression(createIdentifier('Joi'), 'any'),
    undefined,
    [],
  );
}
function makeJsSchemaNode(parameter, typeContext, rootName, parentName) {
  if (!parameter) {
    return null;
  }
  // if (parameter.allOf) {
  //   return allOfSchema(parameter.allOf, typeContext, rootName, parentName);
  // }
  // if (parameter.oneOf) {
  //   return oneOfSchema(parameter.oneOf, typeContext, rootName, parentName);
  // }
  if (parameter.$ref) {
    return schemaInternalRefType(typeContext, parameter.$ref);
  }
  if (parameter.type === 'string') {
    if (parameter.enum) {
      return jsEnumNode(parameter.enum);
    }
    return jsConstSchemaNode('stringSchema');
  }
  if (parameter.type === 'integer') {
    return jsConstSchemaNode('numberSchema');
  }
  if (parameter.type === 'boolean') {
    return jsConstSchemaNode('booleanSchema');
  }
  if (parameter.type === 'array') {
    return jsArrayNode(
      makeJsSchemaNode(
        parameter.items,
        typeContext,
        rootName,
        concatName(parentName, parameter.name),
      ),
    );
  }
  if (parameter.type === 'object') {
    const interfaceName = makeTypeName(concatName(typeContext.rootName, parentName));

    addJsSchema(parameter, typeContext, rootName, interfaceName, false);
    const schemaName = `schema_${interfaceName}`;
    return createIdentifier(schemaName);
  }

  return jsObjectNode([], []);
}

const parameterDeclaration = (typeContext) => (parameter) => {
  const schema = getSchema(parameter);
  // if (schema.type === 'object')
  makeSchemaNode(schema, typeContext, typeContext.rootName, parameter.name);
  return createParameterDeclaration(
    undefined,
    undefined,
    undefined,
    parameter.name,
    parameter.required ? undefined : createToken(SyntaxKind.QuestionToken),
    makeTypeNode(schema, typeContext, typeContext.rootName, parameter.name),
    undefined,
  );
};

function createImport(libName, names) {
  return createImportDeclaration(
    /* decorators */ undefined,
    /* modifiers */ undefined,
    createImportClause(
      undefined,
      createNamedImports(
        lodash.map(names, (name) => createImportSpecifier(undefined, createIdentifier(name))),
      ),
    ),
    createStringLiteral(libName, true),
  );
}

function createLibImport(libName, name) {
  return createImportDeclaration(
    /* decorators */ undefined,
    /* modifiers */ undefined,
    createImportClause(undefined, createIdentifier(name), undefined),
    createStringLiteral(libName, true),
  );
}

function makeStringVariable(name, initValue) {
  return createVariableStatement(
    [createModifier(SyntaxKind.ExportKeyword), createModifier(SyntaxKind.ConstKeyword)],
    createVariableDeclaration(
      name,
      undefined,
      createKeywordTypeNode(SyntaxKind.StringKeyword),
      createStringLiteral(initValue, true),
    ),
  );
}

function makeTypeContext(rootName, rootContext) {
  return {
    rootContext,
    rootName,
    enums: [],
    imports: [],
    imported: {},
    joiImported: {},
    interfaces: [],
    joiImports: [],
    joiSchemas: [],
    joiSchemasByName: {},
    jsImports: [],
    jsSchemas: [],
    jsSchemasByName: {},
    types: [],
    // joiTypes: [],
    allTypes: {},
    endpointNode: undefined,
  };
}

function makeSubstitutionArrowNode(baseName, parameters, text) {
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
        createNoSubstitutionTemplateLiteral(text, text),
      ),
    ),
  );
}

function makeOptionalParameter(name, typeNode) {
  return createParameterDeclaration(
    undefined,
    undefined,
    undefined,
    name,
    createToken(SyntaxKind.QuestionToken),
    typeNode,
    undefined,
  );
}

function makeEndpointNodes(typeContext, DTOs, baseName, pathApiText) {
  const parameterDeclarationFunc = parameterDeclaration(typeContext);

  if (lodash.isEmpty(DTOs.path) && lodash.isEmpty(DTOs.query)) {
    typeContext.endpointNode = makeStringVariable(`ENDPOINT_${baseName}`, pathApiText);
  } else {
    const parameters = [
      ...lodash.map(DTOs.path, parameterDeclarationFunc),
      ...lodash.map(DTOs.query, parameterDeclarationFunc),
    ];

    let apiText;
    if (lodash.isEmpty(DTOs.query)) {
      apiText = pathApiText;
    } else {
      parameters.push(
        makeOptionalParameter(
          'options',
          createTypeReferenceNode(createIdentifier('StringifyOptions')),
        ),
      );
      apiText = `${pathApiText}?${'${'}stringify({${lodash.map(DTOs.query, (param) =>
        param.name === param.rawName ? param.name : `"${param.rawName}": ${param.name}`,
      ).join(', ')}}, options)}`;
      addImport(typeContext, 'query-string', ['stringify', 'StringifyOptions'], true);
    }

    typeContext.endpointNode = makeSubstitutionArrowNode(baseName, parameters, apiText);
  }
  return typeContext.endpointNode;
}

function addType(typeContext, name, node) {
  if (lodash.has(typeContext.allTypes, name)) {
    return;
  }
  const typeNode = createTypeAliasDeclaration(
    undefined,
    [createModifier(SyntaxKind.ExportKeyword)],
    createIdentifier(name),
    undefined,
    node,
  );
  typeContext.types.push(typeNode);
  typeContext.allTypes[name] = typeNode;
}

function makeBodyNodes(typeContext, DTOs) {
  if (!DTOs.body) {
    return;
  }

  const name = makeTypeName(concatName(typeContext.rootName, 'Body'));

  const node = makeTypeNode(DTOs.body.schema, typeContext, typeContext.rootName, 'ApiBody');
  addType(typeContext, name, node);

  addJoiSchema(DTOs.body.schema, typeContext, typeContext.rootName, name);
  addJsSchema(DTOs.body.schema, typeContext, typeContext.rootName, name);
}

function makeResponseNodes(typeContext, DTOs) {
  if (!DTOs.response) {
    return;
  }

  const name = makeTypeName(concatName(typeContext.rootName, 'Response'));

  const node = makeTypeNode(DTOs.response.schema, typeContext, typeContext.rootName, 'ApiResponse');
  addType(typeContext, name, node);

  addJoiSchema(DTOs.response.schema, typeContext, typeContext.rootName, name);
  addJsSchema(DTOs.response.schema, typeContext, typeContext.rootName, name);
}

function pushNodes(nodes, list, addNewLine = false) {
  if (list.length) {
    for (const item of list) {
      nodes.push(item);
      if (addNewLine) {
        nodes.push('\n');
      }
    }
  }
}

function makeApiPathText(apiPath) {
  const path = apiPath.replace(/{/g, '${');
  return path.replace(/\${([^}]*)}/g, (str) => `\${${lodash.camelCase(str)}}`);
}

async function processApiMethod(baseName, apiPath, DTOs, rootContext) {
  const apiNodes = [];
  const pathApiText = makeApiPathText(apiPath);
  const typeContext = makeTypeContext(pathApiText, rootContext);

  makeEndpointNodes(typeContext, DTOs, baseName, pathApiText);
  makeBodyNodes(typeContext, DTOs);
  makeResponseNodes(typeContext, DTOs);

  pushNodes(apiNodes, typeContext.imports);
  apiNodes.push('\n');
  pushNodes(apiNodes, typeContext.enums, true);
  pushNodes(apiNodes, typeContext.interfaces, true);
  pushNodes(apiNodes, typeContext.types, true);

  const joiNodes = [];
  pushNodes(joiNodes, [createLibImport('joi', 'Joi')], true);
  pushNodes(joiNodes, typeContext.joiImports, true);
  pushNodes(joiNodes, typeContext.joiSchemas, true);

  const jsNodes = [];
  pushNodes(jsNodes, [createLibImport('json-schema-toolbox', 'jsonToolbox')], true);
  pushNodes(jsNodes, typeContext.jsImports, true);
  pushNodes(jsNodes, typeContext.jsSchemas, true);

  apiNodes.push('\n');
  apiNodes.push(typeContext.endpointNode);

  return { apiNodes, joiNodes, jsNodes };
}

function cleanupNodes(nodes) {
  return lodash.filter(nodes, (node) => !!node);
}

function getSchemaNode(node, path) {
  if (lodash.has(node, `${path}.schema`)) {
    return lodash.get(node, path);
  }
  return undefined;
}

function getResponseNode(methodNode) {
  let responsePath = 'responses.200.content["application/json"]';
  let response = getSchemaNode(methodNode, responsePath);
  if (!response) {
    responsePath = 'responses.200.content["*/*"]';
    response = getSchemaNode(methodNode, responsePath);
  }
  if (!response) {
    responsePath = 'responses.200';
    response = getSchemaNode(methodNode, responsePath);
  }
  if (!response) {
    responsePath = undefined;
  }
  return { response, responsePath };
}

function makeDTOs(rootContext, methodNode) {
  const DTOs = {
    path: {},
    query: {},
    header: {},
    body: undefined,
    response: undefined,
    responsePath: undefined,
  };
  if (methodNode.parameters) {
    for (const parameter of methodNode.parameters) {
      processParameter(rootContext, parameter, DTOs);
    }
  }
  if (!DTOs.body) {
    DTOs.body = lodash.get(methodNode, 'requestBody.content["application/json"]');
  }

  const { response, responsePath } = getResponseNode(methodNode);
  if (response) {
    DTOs.response = response;
    DTOs.responsePath = responsePath;
  }
  return DTOs;
}

async function generateDefinitions(rootContext, targetDir) {
  for (const defName in rootContext.definitions) {
    const defContext = rootContext.definitions[defName];
    console.log(defName);
    const defNodes = [];
    pushNodes(defNodes, defContext.imports);
    defNodes.push('\n');
    pushNodes(defNodes, defContext.enums, true);
    pushNodes(defNodes, defContext.interfaces, true);
    pushNodes(defNodes, defContext.types, true);

    const defFileName = path.join(targetDir, `${defName}.ts`);
    await writeTsFile(defFileName, defNodes);
  }
}

async function generateJoiDefinitions(rootContext, targetDir) {
  for (const defName in rootContext.definitions) {
    const defContext = rootContext.definitions[defName];
    console.log('joi', defName);
    const defNodes = [];
    const importNode = createLibImport('joi', 'Joi');
    pushNodes(defNodes, [importNode], true);
    defNodes.push('\n');
    pushNodes(defNodes, defContext.joiImports);
    defNodes.push('\n');

    pushNodes(defNodes, defContext.joiSchemas, true);

    const defFileName = path.join(targetDir, `${defName}.joi.ts`);
    await writeTsFile(defFileName, defNodes);
  }
}

async function generateJsDefinitions(rootContext, targetDir) {
  for (const defName in rootContext.definitions) {
    const defContext = rootContext.definitions[defName];
    console.log('js', defName);
    const defNodes = [];
    const importNode = createLibImport('json-schema-toolbox', 'jsonToolbox');
    pushNodes(defNodes, [importNode], true);
    defNodes.push('\n');
    pushNodes(defNodes, defContext.jsImports);
    defNodes.push('\n');

    pushNodes(defNodes, defContext.jsSchemas, true);

    const defFileName = path.join(targetDir, `${defName}.schema.ts`);
    await writeTsFile(defFileName, defNodes);
  }
}

async function processPaths(root, rootContext, rootPath) {
  const { targetDir, generateJson, generateJoi, generateSchema } = rootContext;
  for (const apiPath in root) {
    const apiNode = root[apiPath];
    console.log(apiPath);

    for (const method in apiNode) {
      const methodNode = apiNode[method];

      const DTOs = makeDTOs(rootContext, methodNode);

      const baseName = `${lodash.camelCase(apiPath)}_${method}`;
      const { apiNodes, joiNodes, jsNodes } = await processApiMethod(
        baseName,
        apiPath,
        DTOs,
        rootContext,
      );

      const apiFileName = path.join(targetDir, `${baseName}.ts`);
      await writeTsFile(apiFileName, apiNodes);

      if (DTOs.response && generateJson) {
        const fullResponsePath = `${rootPath}["${apiPath}"].${method}.${DTOs.responsePath}.schema`;
        const responseContent = lodash.get(rootContext.dereferencedSchema, fullResponsePath);
        const responseFileName = path.join(targetDir, `${baseName}_response.schema.json`);
        await writeFileAsync(responseFileName, JSON.stringify(responseContent, undefined, 2));
        console.log(`  wrote ${responseFileName}`);
      }

      if ((DTOs.response || DTOs.body) && generateJoi && joiNodes.length > 0) {
        const fileName = path.join(targetDir, `${baseName}.joi.ts`);
        await writeTsFile(fileName, joiNodes);
        console.log(`  wrote joi ${fileName}`);
      }

      if ((DTOs.response || DTOs.body) && generateSchema && jsNodes.length > 0) {
        const fileName = path.join(targetDir, `${baseName}.schema.ts`);
        await writeTsFile(fileName, jsNodes);
        console.log(`  wrote jsSchema ${fileName}`);
      }
    }
  }
  await generateDefinitions(rootContext, targetDir);
  if (generateJoi) {
    await generateJoiDefinitions(rootContext, targetDir);
  }
  if (generateSchema) {
    await generateJsDefinitions(rootContext, targetDir);
  }
}

async function processRoot(root, context) {
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
        await processPaths(node, context, 'paths');
        break;
      }
    }
  }
}

async function traverse(root, context) {
  await processRoot(root, context);
}

function makeRootContext(
  targetDir,
  jsonSchema,
  dereferencedSchema,
  generateJson,
  generateJoi,
  generateSchema,
) {
  return {
    targetDir,
    jsonSchema,
    dereferencedSchema,
    generateJson,
    generateJoi,
    generateSchema,
    definitions: {},
  };
}

async function processFile(apiFile, targetDir, generateJson, generateJoi, generateSchema) {
  try {
    console.log('clear dir', targetDir);
    await rimrafAsync(targetDir);
    console.log('make dir', targetDir);
    await mkdirp__default["default"](targetDir);
    console.log('dereference', apiFile);
    const parser = new RefParser__default["default"]();
    const refOptions = {
      dereference: {
        circular: 'ignore',
      },
    };
    const jsonSchema = await parser.parse(apiFile, refOptions);
    const dereferencedSchema1 = await parser.dereference(apiFile, refOptions);
    const dereferencedSchema = omitDeep(dereferencedSchema1, [
      'example',
      // 'format',
      'description',
      'xml',
    ]);
    const rootContext = makeRootContext(
      targetDir,
      jsonSchema,
      dereferencedSchema,
      generateJson,
      generateJoi,
      generateSchema,
    );
    console.log('traverse', apiFile);
    await traverse(jsonSchema, rootContext);

    const fileName = path.join(targetDir, 'info.json');
    console.log(`write ${fileName}`);
    await writeFileAsync(
      fileName,
      JSON.stringify(
        lodash.omit(rootContext, ['definitions', 'jsonSchema', 'nodes', 'dereferencedSchema']),
        null,
        2,
      ),
    );

    console.log('done');
    console.log('definitions', lodash.keys(rootContext.definitions));
  } catch (e) {
    console.log(e);
  }
}

const generate = (apiFile, targetDir, generateJson, generateJoi, generateSchema) => {
  console.log('generate', { apiFile, targetDir, generateJson, generateJoi, generateSchema });
  processFile(apiFile, targetDir, generateJson, generateJoi, generateSchema);
};

const argv = yargs__default["default"](helpers.hideBin(process.argv))
  .usage('Usage: $0 [options]')
  .example('$0 -f foo.json -o ./api', 'process foo.json and place definitions to ./api folder')
  .alias('f', 'file')
  .nargs('f', 1)
  .describe('f', 'use a Swagger API file')
  .alias('o', 'out')
  .nargs('o', 1)
  .describe('o', 'output folder')
  .alias('j', 'json')
  .boolean('j')
  .describe('j', 'generate response JSON schema')
  .alias('i', 'joi')
  .boolean('i')
  .describe('i', 'generate JOI validation code')
  .alias('s', 'schema')
  .boolean('s')
  .describe('s', 'generate JSON schema js generators')
  .demandOption(['f', 'o'])
  .help('h')
  .alias('h', 'help')
  .epilog('copyright 2021').argv;

generate(path.resolve(argv.file), path.resolve(argv.out), argv.json, argv.joi, argv.schema);
