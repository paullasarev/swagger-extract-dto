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
  omit
} from 'lodash';
// import { format } from 'prettier';

import RefParser from 'json-schema-ref-parser';

const rimrafAsync = promisify(rimraf);
const writeFileAsync = promisify(writeFile);

const { SyntaxKind, ListFormat } = ts;

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
  createToken,
  createNull,
  createTypeAliasDeclaration
} = ts.factory;

function getSchema (parameter) {
  return get(parameter, 'schema', parameter);
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

async function writeTsFile (fileName, allNodes) {
  const nodes = cleanupNodes(allNodes);
  const printer = ts.createPrinter({
    newLine: ts.NewLineKind.LineFeed
  });

  const sourceFile = ts.createSourceFile(
    fileName,
    '',
    ts.ScriptTarget.ES2017,
    true,
    ts.ScriptKind.TS
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
  return baseName ? camelCase(`${baseName}-${name}`) : camelCase(name);
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
  const prepared = snakeCase(name).toUpperCase();
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
    map(values, (value) => {
      return createEnumMember(makeConstantName(value), makeEnumMember(value));
    })
  );
}

function makeTypeName (name) {
  return name.substr(0, 1).toUpperCase() + name.substr(1);
}

function makeInterfaceNode (schema, typeContext, rootName, name) {
  const properties = {
    ...get(schema, ['properties'], {}),
    ...get(schema, ['additionalProperties'], {})
  };
  const props = map(properties, (property, propName) => {
    // const description = get(schema, ['properties', property], {});
    // const isRequired = get(schema, ['required'], []).includes(propName);
    const isRequired = true;

    return createPropertySignature(
      undefined,
      createIdentifier(propName),
      isRequired ? undefined : createToken(SyntaxKind.QuestionToken),
      makeTypeNode(property, typeContext, rootName, propName),
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
  if (find(typeContext.enums, { name: node.name })) {
    return;
  }
  typeContext.enums.push(node);
}

function dereferenceInternalRef (typeContext, ref) {
  if (ref.substr(0, 2) !== '#/') {
    console.log('invalid ref', ref);
    return createNull();
  }
  const refPath = ref.replace('#/', '').split(/#?\//);
  const lastName = last(refPath);
  const name = makeTypeName(camelCase(lastName));
  const parameter = get(typeContext.rootContext.jsonSchema, refPath);
  if (!parameter) {
    console.log('invalid ref path', ref);
    return createNull();
  }

  const newTypeContext = makeTypeContext(name, typeContext.rootContext);
  typeContext.rootContext.definitions[name] = newTypeContext;

  makeTypeNode(parameter, newTypeContext, name, undefined);
  typeContext.rootContext.definitions[name].rootContext = null;

  typeContext.imports.push(createImport(`./${name}`, [name]));

  return createTypeReferenceNode(createIdentifier(name));
}

function makeTypeNode (parameter, typeContext, rootName, parentName) {
  if (!parameter) {
    return null;
  }
  if (parameter.$ref) {
    return dereferenceInternalRef(typeContext, parameter.$ref);
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
      makeTypeNode(parameter.items, typeContext, rootName, concatName(parentName, parameter.name))
    );
  }
  if (parameter.type === 'object') {
    const interfaceName = makeTypeName(concatName(typeContext.rootName, parentName));
    const interfaceNode = makeInterfaceNode(parameter, typeContext, rootName, interfaceName);
    typeContext.interfaces.push(interfaceNode);
    return createTypeReferenceNode(createIdentifier(interfaceName));
  }
  return createKeywordTypeNode(SyntaxKind.AnyKeyword);
}

export const parameterDeclaration = (typeContext) => (parameter) => {
  return createParameterDeclaration(
    undefined,
    undefined,
    undefined,
    parameter.name,
    undefined,
    makeTypeNode(getSchema(parameter), typeContext, typeContext.rootName, undefined),
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
        map(names, (name) => createImportSpecifier(undefined, createIdentifier(name)))
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

function makeTypeContext (rootName, rootContext) {
  return {
    rootContext,
    rootName,
    enums: [],
    imports: [],
    interfaces: [],
    types: [],
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

  if (isEmpty(DTOs.path) && isEmpty(DTOs.query)) {
    typeContext.endpointNode = makeStringVariable(`ENDPOINT_${baseName}`, pathApiText);
  } else {
    const parameters = [
      ...map(DTOs.path, parameterDeclarationFunc),
      ...map(DTOs.query, parameterDeclarationFunc)
    ];

    let apiText;
    if (isEmpty(DTOs.query)) {
      apiText = pathApiText;
    } else {
      parameters.push(makeOptionalAnyParameter('options'));
      apiText = `${pathApiText}?${'${'}stringify({${map(DTOs.query, (param) => param.name).join(
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

  const node = makeTypeNode(DTOs.body.schema, typeContext, typeContext.rootName, 'Body');
  const name = makeTypeName(concatName(typeContext.rootName, 'Body'));

  const typeNode = createTypeAliasDeclaration(
    undefined,
    [createModifier(SyntaxKind.ExportKeyword)],
    createIdentifier(name),
    undefined,
    node
  );
  typeContext.types.push(typeNode);
}

function makeResponseNodes (typeContext, DTOs, baseName) {
  if (!DTOs.response) {
    return;
  }

  const node = makeTypeNode(DTOs.response.schema, typeContext, typeContext.rootName, 'Response');
  const name = makeTypeName(concatName(typeContext.rootName, 'Response'));

  const typeNode = createTypeAliasDeclaration(
    undefined,
    [createModifier(SyntaxKind.ExportKeyword)],
    createIdentifier(name),
    undefined,
    node
  );
  typeContext.types.push(typeNode);
}

function pushNodes (nodes, list) {
  if (list.length) {
    nodes.push(...list);
  }
}

async function processApiMethod (baseName, apiPath, DTOs, rootContext) {
  const apiNodes = [];
  const pathApiText = apiPath.replace(/{/g, '${');
  const typeContext = makeTypeContext(pathApiText, rootContext);

  makeEndpointNodes(typeContext, DTOs, baseName, pathApiText);
  makeBodyNodes(typeContext, DTOs, baseName);
  makeResponseNodes(typeContext, DTOs, baseName);

  pushNodes(apiNodes, typeContext.imports);
  pushNodes(apiNodes, typeContext.enums);
  pushNodes(apiNodes, typeContext.interfaces);
  pushNodes(apiNodes, typeContext.types);
  // if (typeContext.imports.length) {
  //   apiNodes.push(...typeContext.imports);
  //   // apiNodes.push(createToken(SyntaxKind.MultiLineCommentTrivia | SyntaxKind.NewLineTrivia));
  // }
  // if (typeContext.enums.length) {
  //   apiNodes.push(...typeContext.enums);
  // }
  // if (typeContext.interfaces.length) {
  //   apiNodes.push(...typeContext.interfaces);
  // }
  apiNodes.push(typeContext.endpointNode);

  return apiNodes;
}

function cleanupNodes (nodes) {
  return filter(nodes, (node) => !!node);
}

async function processPaths (root, rootContext) {
  const { targetDir } = rootContext;
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
        DTOs.body = get(methodNode, 'requestBody.content["application/json"]');
      }

      DTOs.response = get(methodNode, 'responses.200.content["application/json"]');
      if (!DTOs.response && has(methodNode, 'responses.200.schema')) {
        DTOs.response = get(methodNode, 'responses.200');
      }

      const baseName = `${camelCase(apiPath)}_${method}`;
      const apiNodes = await processApiMethod(baseName, apiPath, DTOs, rootContext);

      const apiFileName = join(targetDir, `${baseName}.ts`);
      await writeTsFile(apiFileName, apiNodes);
    }
  }
  for (const defName in rootContext.definitions) {
    const defContext = rootContext.definitions[defName];
    console.log(defName);
    const defNodes = [];
    pushNodes(defNodes, defContext.imports);
    pushNodes(defNodes, defContext.enums);
    pushNodes(defNodes, defContext.interfaces);
    pushNodes(defNodes, defContext.types);

    const defFileName = join(targetDir, `${defName}.ts`);
    await writeTsFile(defFileName, defNodes);
  }
}

async function processRoot (root, context) {
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

export async function traverse (root, context) {
  await processRoot(root, context);
}

export function makeRootContext (targetDir, jsonSchema) {
  return {
    targetDir,
    jsonSchema,
    definitions: {}
  };
}

export async function processFile (apiFile, targetDir) {
  try {
    console.log('clear dir', targetDir);
    await rimrafAsync(targetDir);
    console.log('make dir', targetDir);
    await mkdirp(targetDir);
    console.log('dereference', apiFile);
    const parser = new RefParser();
    // const jsonSchema = await parser.dereference(apiFile, {
    const jsonSchema = await parser.parse(apiFile, {
      dereference: {
        circular: 'ignore'
      }
    });
    const rootContext = makeRootContext(targetDir, jsonSchema);
    console.log('traverse', apiFile);
    await traverse(jsonSchema, rootContext);

    const fileName = join(targetDir, 'info.json');
    console.log(`write ${fileName}`);
    await writeFileAsync(
      fileName,
      JSON.stringify(omit(rootContext, ['definitions', 'jsonSchema', 'nodes']), null, 2)
    );

    console.log('done');
    console.log('definitions', keys(rootContext.definitions));
  } catch (e) {
    console.log(e);
  }
}

export const generate = (apiFile, targetDir) => {
  // const pattern = join(targetDir, filesGlob)
  // console.log('process', pattern)
  // const files = glob.sync(pattern)
  // const context = { count: 0 }
  // files.forEach(processFile(filesExt, context))
  processFile(apiFile, targetDir);
  // console.log(`process ${context.count} files`)
};
