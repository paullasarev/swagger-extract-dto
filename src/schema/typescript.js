/* eslint no-console: 0 */
import { writeFile } from 'fs';
// import * as path from 'path'
import { join } from 'path';
import { promisify } from 'util';
import mkdirp from 'mkdirp';
import ts from 'typescript';
import rimraf from 'rimraf';
import { camelCase, get } from 'lodash';

// import { compile } from 'json-schema-to-typescript'
// import stringify from 'json-stringify-safe'
import RefParser from 'json-schema-ref-parser';
// import { omitDeep } from '../utilities/omitDeep/omitDeep.js'
// import glob from 'glob';

const rimrafAsync = promisify(rimraf);
const writeFileAsync = promisify(writeFile);

// export const processFile1 = (filesExt, context) => (file) => {
//   try {
//     const fileDirname = dirname(file)
//     const fileBasename = basename(file, filesExt)
//     const mainSchema = require(file)
//     const fileName = join(fileDirname, `${fileBasename}.d.ts`)
//     const fileNameJson = join(fileDirname, `${fileBasename}.out.json`)
//     context.count++
//     const options = {
//       cwd: fileDirname,
//       circular: 'ignore'
//     }
//     const parser = new RefParser()
//
//     parser
//       .dereference(file, mainSchema, {
//         circular: 'ignore'
//       })
//       .then((jsonSchema) => {
//         console.log('process', file)
//         const omitted = omitDeep(jsonSchema, 'vendorExtensions')
//         omitted.additionalProperties = false
//         if (jsonSchema.properties) {
//           omitted.required = Object.keys(omitted.properties)
//         }
//         writeFileSync(fileNameJson, stringify(omitted, null, 2))
//         return omitted
//       })
//       .then((omited) => compile(omited, options))
//       .then((tsText) => {
//         writeFileSync(fileName, tsText)
//         console.log('done', fileName)
//       })
//   } catch (e) {
//     console.log(e)
//   }
// }

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
  // const content = map(nodes, (node) => printer.printNode(ts.EmitHint.Unspecified, node))
  // .join('\n');
  //
  // await writeFileAsync(fileName, content);
  const content = printer.printList(ts.ListFormat.SingleLine, nodes, sourceFile);
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
} = ts.factory;

const { SyntaxKind } = ts;

async function processApiMethod (apiPath, method, DTOs, targetDir) {
  const baseName = `${camelCase(apiPath)}_${method}`;
  const apiFileName = join(targetDir, `${baseName}.ts`);
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
