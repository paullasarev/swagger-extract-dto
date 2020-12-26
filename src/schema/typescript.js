/* eslint no-console: 0 */
import { writeFile } from 'fs';
import { join } from 'path';
import { promisify } from 'util';
import mkdirp from 'mkdirp';
import ts from 'typescript';
import rimraf from 'rimraf';
import { camelCase, get, isEmpty, map } from 'lodash';
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
  createIdentifier
} = ts.factory;

function addPath (path, name) {
  return path ? `${path}.${name}` : name;
}

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
    ListFormat.MultiLine | ListFormat.SpaceAfterList | ListFormat.PreferNewLine,
    nodes,
    sourceFile
  );
  // const content = format(code, { parser: 'typescript' });
  await writeFileAsync(fileName, content);
  console.log(`  wrote ${fileName}`);
}

function parameterDeclaration (parameter) {
  return createParameterDeclaration(
    undefined,
    undefined,
    undefined,
    parameter.name,
    undefined,
    undefined,
    undefined
  );
}

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

async function processApiMethod (apiPath, method, DTOs, targetDir) {
  const baseName = `${camelCase(apiPath)}_${method}`;
  const apiFileName = join(targetDir, `${baseName}.ts`);
  const apiNodes = [];

  if (isEmpty(DTOs.path) && isEmpty(DTOs.query)) {
    const node = createVariableStatement(
      [createModifier(SyntaxKind.ExportKeyword), createModifier(SyntaxKind.ConstKeyword)],
      createVariableDeclaration(
        `ENDPOINT_${baseName}`,
        undefined,
        createKeywordTypeNode(SyntaxKind.StringKeyword),
        createStringLiteral(apiPath, true)
      )
    );

    apiNodes.push(node);
  } else {
    const pathApiText = apiPath.replace(/{/g, '${');
    const parameters = [
      ...map(DTOs.path, parameterDeclaration),
      ...map(DTOs.query, parameterDeclaration)
    ];
    const apiText = isEmpty(DTOs.query)
      ? pathApiText
      : `${pathApiText}?stringify(${'$'}{{${map(DTOs.query, (param) => param.name).join(',')}}})`;
    console.log({ apiText, parameters });

    if (!isEmpty(DTOs.query)) {
      apiNodes.push(createImport('query-string', ['stringify']));
    }

    const node = createVariableStatement(
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
          createNoSubstitutionTemplateLiteral(apiText, apiText)
        )
      )
    );

    apiNodes.push(node);
  }

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
      DTOs.response = get(methodNode, 'responses.200');

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
        await processPaths(node, context, addPath(path, key));
        break;
      }
    }
  }
}

export async function traverse (root, context) {
  await processRoot(root, context, '');
}

export async function processFile (apiFile, targetDir) {
  try {
    console.log('clear dir', targetDir);
    await rimrafAsync(targetDir);
    console.log('make dir', targetDir);
    await mkdirp(targetDir);
    console.log('dereference', apiFile);
    const parser = new RefParser();
    const jsonSchema = await parser.dereference(apiFile, {
      circular: 'ignore'
    });
    const context = { nodes: 0, targetDir };
    console.log('traverse', apiFile);
    await traverse(jsonSchema, context);
    console.log(`processed ${context.nodes} nodes`);

    const fileName = join(targetDir, 'info.json');
    console.log(`write ${fileName}`);
    await writeFileAsync(fileName, JSON.stringify(context, null, 2));

    console.log('done');
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
