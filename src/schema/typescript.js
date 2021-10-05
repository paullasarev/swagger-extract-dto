/* eslint no-console: 0 */
import { writeFile } from 'fs';
import { join } from 'path';
import { promisify } from 'util';
import mkdirp from 'mkdirp';
import ts from 'typescript';
import rimraf from 'rimraf';
import {
  camelCase,
  snakeCase,
  get,
  has,
  isEmpty,
  map,
  find,
  last,
  keys,
  filter,
  omit,
  merge,
  isArray,
  partition,
  isString,
} from 'lodash';
import { format } from 'prettier';

import RefParser from 'json-schema-ref-parser';

import { omitDeep } from '../utilities/omitDeep/omitDeep';

const rimrafAsync = promisify(rimraf);
const writeFileAsync = promisify(writeFile);

const { SyntaxKind } = ts;

const {
  createVariableStatement,
  createStringLiteral,
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
} = ts.factory;

function getSchema(parameter) {
  return get(parameter, 'schema', parameter);
}

function makeParameterName(parameter) {
  return {
    ...parameter,
    rawName: parameter.name,
    name: camelCase(parameter.name),
  };
}

export function processParameter(rootContext, rawParameter, DTOs) {
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
  const printer = ts.createPrinter({
    newLine: ts.NewLineKind.LineFeed,
  });

  const sourceFile = ts.createSourceFile(
    fileName,
    '',
    ts.ScriptTarget.ES2017,
    true,
    ts.ScriptKind.TS,
  );

  const codeList = map(nodes, (node) => {
    if (isString(node)) {
      return node;
    }
    return printer.printNode(ts.EmitHint.Unspecified, node, sourceFile);
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

  const content = format(code, {
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
  return content;
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
  return baseName ? camelCase(`${baseName}-${name}`) : camelCase(name);
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
  const prepared = snakeCase(name).toUpperCase();
  if (isEmpty(prepared)) {
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
    map(values, (value, index) => {
      return createEnumMember(makeEnumFieldName(value, index), makeEnumFieldValue(value));
    }),
  );
}

function makeTypeName(name) {
  const result = name.substr(0, 1).toUpperCase() + name.substr(1);
  return isEmpty(result) ? 'Root' : result;
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

export function getHeritageClauses(extendsNodes) {
  if (!extendsNodes) {
    return undefined;
  }
  return [
    createHeritageClause(
      SyntaxKind.ExtendsKeyword,
      map(extendsNodes, (extendNode) => createExpressionWithTypeArguments(extendNode, undefined)),
    ),
  ];
}

export function getPropertyNodeExtractor(schema, typeContext, rootName) {
  return (property, propName) => {
    const isRequired = get(schema, ['required'], []).includes(propName);
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

export function makeInterfaceNode(schema, typeContext, rootName, name, extendsNodes) {
  const additionalProperties = get(schema, ['additionalProperties']);
  const properties = {
    ...get(schema, ['properties'], {}),
  };
  const props = map(properties, getPropertyNodeExtractor(schema, typeContext, rootName));

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

export function getPropertySchemaExtractor(schema, typeContext, rootName) {
  return (property, propName) => {
    const isRequired = get(schema, ['required'], []).includes(propName);
    const name = isIdentifier(propName) ? propName : `'${propName}'`;

    let propertySchema = makeSchemaNode(property, typeContext, rootName, name);
    if (isRequired) {
      propertySchema = createCallProperty(propertySchema, 'required');
    }

    return createPropertyAssignment(name, propertySchema);
  };
}

export function makeSchemaRefDeclarationNode(schema, typeContext, rootName, name) {
  // ...get(schema, ['additionalProperties']),
  const joiName = `schema_${name}`;
  const node = makeSchemaNode(schema, typeContext, name, rootName);
  return createVariableStatement(
    [createModifier(SyntaxKind.ExportKeyword), createModifier(SyntaxKind.ConstKeyword)],
    createVariableDeclaration(joiName, undefined, undefined, node),
  );
}

export function makeSchemaDeclarationNode(schema, typeContext, rootName, name) {
  const joiName = `schema_${name}`;
  const props = map(schema.properties, getPropertySchemaExtractor(schema, typeContext, rootName));
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

function typeContextAddEnum(typeContext, node) {
  if (find(typeContext.enums, { name: node.name })) {
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
  const lastName = last(refPath);
  const name = makeTypeName(camelCase(lastName));
  const schema = useDereferenced ? rootContext.dereferencedSchema : rootContext.jsonSchema;
  const parameter = get(schema, refPath);
  return { name, parameter };
}

function addImport(typeContext, libName, names, addNewLine = false) {
  const key = JSON.stringify({ libName, names });
  if (has(typeContext.imported, key)) {
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
  if (has(typeContext.joiImported, key)) {
    return;
  }

  const importNode = createImport(`./${name}.joi`, [key]);
  typeContext.joiImports.push(importNode);
  typeContext.joiImported[key] = importNode;
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
  if (!isArray(allOf)) {
    return createNull();
  }
  if (allOf.length === 1) {
    return makeTypeNode(allOf[0], typeContext, rootName, parentName);
  }

  const [extendSchemas, implementSchemas] = partition(allOf, (schema) => !!schema.$ref);

  const extendsNodes = map(extendSchemas, (schema) =>
    dereferenceInternalRefType(typeContext, schema.$ref),
  );
  const implementSchema = merge({}, ...implementSchemas);
  const implementNode = makeTypeNode(
    implementSchema,
    typeContext,
    rootName,
    parentName,
    extendsNodes,
  );
  return implementNode;
}

function oneOfSchema(oneOf, typeContext, rootName, parentName) {
  if (!isArray(oneOf)) {
    return createNull();
  }
  if (oneOf.length === 1) {
    return makeTypeNode(oneOf[0], typeContext, rootName, parentName);
  }

  const name = makeTypeName(concatName(rootName, parentName));
  const node = createUnionTypeNode(
    map(oneOf, (schema, index) =>
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
        map(parameter.enum, (value) => createStringLiteral(value, true)),
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

export const parameterDeclaration = (typeContext) => (parameter) => {
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
        map(names, (name) => createImportSpecifier(undefined, createIdentifier(name))),
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

export function makeTypeContext(rootName, rootContext) {
  return {
    rootContext,
    rootName,
    enums: [],
    imports: [],
    joiImports: [],
    imported: {},
    joiImported: {},
    interfaces: [],
    joiSchemas: [],
    joiSchemasByName: {},
    types: [],
    joiTypes: [],
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

export function makeOptionalParameter(name, typeNode) {
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

export function makeEndpointNodes(typeContext, DTOs, baseName, pathApiText) {
  const parameterDeclarationFunc = parameterDeclaration(typeContext);

  if (isEmpty(DTOs.path) && isEmpty(DTOs.query)) {
    typeContext.endpointNode = makeStringVariable(`ENDPOINT_${baseName}`, pathApiText);
  } else {
    const parameters = [
      ...map(DTOs.path, parameterDeclarationFunc),
      ...map(DTOs.query, parameterDeclarationFunc),
    ];

    let apiText;
    if (isEmpty(DTOs.query)) {
      apiText = pathApiText;
    } else {
      parameters.push(
        makeOptionalParameter(
          'options',
          createTypeReferenceNode(createIdentifier('StringifyOptions')),
        ),
      );
      apiText = `${pathApiText}?${'${'}stringify({${map(DTOs.query, (param) =>
        param.name === param.rawName ? param.name : `"${param.rawName}": ${param.name}`,
      ).join(', ')}}, options)}`;
      addImport(typeContext, 'query-string', ['stringify', 'StringifyOptions'], true);
    }

    typeContext.endpointNode = makeSubstitutionArrowNode(baseName, parameters, apiText);
  }
  return typeContext.endpointNode;
}

function addType(typeContext, name, node) {
  if (has(typeContext.allTypes, name)) {
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

export function makeBodyNodes(typeContext, DTOs, baseName) {
  if (!DTOs.body) {
    return;
  }

  const name = makeTypeName(concatName(typeContext.rootName, 'Body'));

  const node = makeTypeNode(DTOs.body.schema, typeContext, typeContext.rootName, 'ApiBody');
  addType(typeContext, name, node);

  addJoiSchema(DTOs.body.schema, typeContext, typeContext.rootName, name);
}

export function makeResponseNodes(typeContext, DTOs, baseName) {
  if (!DTOs.response) {
    return;
  }

  const name = makeTypeName(concatName(typeContext.rootName, 'Response'));

  const node = makeTypeNode(DTOs.response.schema, typeContext, typeContext.rootName, 'ApiResponse');
  addType(typeContext, name, node);

  addJoiSchema(DTOs.response.schema, typeContext, typeContext.rootName, name);
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

export function makeApiPathText(apiPath) {
  return apiPath.replace(/{/g, '${');
}

async function processApiMethod(baseName, apiPath, DTOs, rootContext) {
  const apiNodes = [];
  const joiNodes = [];
  const pathApiText = makeApiPathText(apiPath);
  const typeContext = makeTypeContext(pathApiText, rootContext);

  pushNodes(joiNodes, [createLibImport('joi', 'Joi')], true);

  makeEndpointNodes(typeContext, DTOs, baseName, pathApiText);
  makeBodyNodes(typeContext, DTOs, baseName);
  makeResponseNodes(typeContext, DTOs, baseName);

  pushNodes(apiNodes, typeContext.imports);
  apiNodes.push('\n');
  pushNodes(apiNodes, typeContext.enums, true);
  pushNodes(apiNodes, typeContext.interfaces, true);
  pushNodes(apiNodes, typeContext.types, true);

  pushNodes(joiNodes, typeContext.joiImports, true);
  pushNodes(joiNodes, typeContext.joiSchemas, true);
  // pushNodes(joiNodes, typeContext.joiTypes, true);

  apiNodes.push('\n');
  apiNodes.push(typeContext.endpointNode);

  return { apiNodes, joiNodes };
}

function cleanupNodes(nodes) {
  return filter(nodes, (node) => !!node);
}

function getSchemaNode(node, path) {
  if (has(node, `${path}.schema`)) {
    return get(node, path);
  }
  return undefined;
}

export function getResponseNode(methodNode) {
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

export function makeDTOs(rootContext, methodNode) {
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
    DTOs.body = get(methodNode, 'requestBody.content["application/json"]');
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

    const defFileName = join(targetDir, `${defName}.ts`);
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

    const defFileName = join(targetDir, `${defName}.joi.ts`);
    await writeTsFile(defFileName, defNodes);
  }
}

async function processPaths(root, rootContext, rootPath) {
  const { targetDir, generateJson, generateJoi } = rootContext;
  for (const apiPath in root) {
    const apiNode = root[apiPath];
    console.log(apiPath);

    for (const method in apiNode) {
      const methodNode = apiNode[method];

      const DTOs = makeDTOs(rootContext, methodNode);

      const baseName = `${camelCase(apiPath)}_${method}`;
      const { apiNodes, joiNodes } = await processApiMethod(baseName, apiPath, DTOs, rootContext);

      const apiFileName = join(targetDir, `${baseName}.ts`);
      await writeTsFile(apiFileName, apiNodes);

      if (DTOs.response && generateJson) {
        const fullResponsePath = `${rootPath}["${apiPath}"].${method}.${DTOs.responsePath}.schema`;
        const responseContent = get(rootContext.dereferencedSchema, fullResponsePath);
        const responseFileName = join(targetDir, `${baseName}_response.schema.json`);
        await writeFileAsync(responseFileName, JSON.stringify(responseContent, undefined, 2));
        console.log(`  wrote ${responseFileName}`);
      }

      if ((DTOs.response || DTOs.body) && generateJoi && joiNodes.length > 0) {
        const fileName = join(targetDir, `${baseName}.joi.ts`);
        await writeTsFile(fileName, joiNodes);
        console.log(`  wrote ${fileName}`);
      }
    }
  }
  await generateDefinitions(rootContext, targetDir);
  if (generateJoi) {
    await generateJoiDefinitions(rootContext, targetDir);
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

export async function traverse(root, context) {
  await processRoot(root, context);
}

export function makeRootContext(
  targetDir,
  jsonSchema,
  dereferencedSchema,
  generateJson,
  generateJoi,
) {
  return {
    targetDir,
    jsonSchema,
    dereferencedSchema,
    generateJson,
    generateJoi,
    definitions: {},
  };
}

export async function processFile(apiFile, targetDir, generateJson, generateJoi) {
  try {
    console.log('clear dir', targetDir);
    await rimrafAsync(targetDir);
    console.log('make dir', targetDir);
    await mkdirp(targetDir);
    console.log('dereference', apiFile);
    const parser = new RefParser();
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
    );
    console.log('traverse', apiFile);
    await traverse(jsonSchema, rootContext);

    const fileName = join(targetDir, 'info.json');
    console.log(`write ${fileName}`);
    await writeFileAsync(
      fileName,
      JSON.stringify(
        omit(rootContext, ['definitions', 'jsonSchema', 'nodes', 'dereferencedSchema']),
        null,
        2,
      ),
    );

    console.log('done');
    console.log('definitions', keys(rootContext.definitions));
  } catch (e) {
    console.log(e);
  }
}

export const generate = (apiFile, targetDir, generateJson, generateJoi) => {
  console.log('generate', { apiFile, targetDir, generateJson, generateJoi });
  processFile(apiFile, targetDir, generateJson, generateJoi);
};
