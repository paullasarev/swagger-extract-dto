'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var fs = require('fs');

const { reduce, isObject, isArray, map } = require('lodash');

const MAX_DEEP_LEVEL = 10;

function omitDeep(value, allKeys, level = 0) {
  if (level > MAX_DEEP_LEVEL) {
    return value;
  }

  if (typeof value === 'undefined') {
    return value;
  }

  const keys = isArray(allKeys) ? allKeys : [allKeys];

  if (isArray(value)) {
    return map(value, (item) => omitDeep(item, keys, level + 1));
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
      acc[key] = omitDeep(val, keys, level + 1);
      return acc;
    },
    {},
  );

  return result;
}

module.exports = {
  omitDeep,
};

/* eslint no-console: 0 */
const { basename, dirname, join, resolve: resolve$1 } = require('path');
const { compile } = require('json-schema-to-typescript');
const RefParser = require('json-schema-ref-parser');
const glob = require('glob');
const stringify = require('json-stringify-safe');

const processFile = (filesExt, context) => (file) => {
  try {
    const fileDirname = dirname(file);
    const fileBasename = basename(file, filesExt);
    const mainSchema = require(file);
    const fileName = join(fileDirname, `${fileBasename}.d.ts`);
    const fileNameJson = join(fileDirname, `${fileBasename}.out.json`);
    context.count++;
    const options = {
      cwd: fileDirname,
      circular: 'ignore'
    };
    const parser = new RefParser();

    parser
      .dereference(file, mainSchema, {
        circular: 'ignore'
      })
      .then((jsonSchema) => {
        console.log('process', file);
        const omitted = omitDeep(jsonSchema, 'vendorExtensions');
        omitted.additionalProperties = false;
        if (jsonSchema.properties) {
          omitted.required = Object.keys(omitted.properties);
        }
        fs.writeFileSync(fileNameJson, stringify(omitted, null, 2));
        return omitted
      })
      .then((omited) => compile(omited, options))
      .then((tsText) => {
        fs.writeFileSync(fileName, tsText);
        console.log('done', fileName);
      });
  } catch (e) {
    console.log(e);
  }
};

const generate = (targetDir, filesGlob, filesExt) => {
  const pattern = join(targetDir, filesGlob);
  console.log('process', pattern);
  const files = glob.sync(pattern);
  const context = { count: 0 };
  files.forEach(processFile(filesExt, context));
  console.log(`process ${context.count} files`);
};

const SCHEMA_EXT = '.schema.json';
const SCHEMA_FILES = `/**/*${SCHEMA_EXT}`;

generate(resolve('../../src'), SCHEMA_FILES, SCHEMA_EXT);

exports.SCHEMA_EXT = SCHEMA_EXT;
exports.SCHEMA_FILES = SCHEMA_FILES;
