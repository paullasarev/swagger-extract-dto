/* eslint no-console: 0 */
import { writeFileSync } from 'fs'

import { omitDeep } from '../utilities/omitDeep/omitDeep.js'

const { basename, dirname, join } = require('path')
const { compile } = require('json-schema-to-typescript')
const RefParser = require('json-schema-ref-parser')
const glob = require('glob')
const stringify = require('json-stringify-safe')

export const processFile = (filesExt, context) => (file) => {
  try {
    const fileDirname = dirname(file)
    const fileBasename = basename(file, filesExt)
    const mainSchema = require(file)
    const fileName = join(fileDirname, `${fileBasename}.d.ts`)
    const fileNameJson = join(fileDirname, `${fileBasename}.out.json`)
    context.count++
    const options = {
      cwd: fileDirname,
      circular: 'ignore'
    }
    const parser = new RefParser()

    parser
      .dereference(file, mainSchema, {
        circular: 'ignore'
      })
      .then((jsonSchema) => {
        console.log('process', file)
        const omitted = omitDeep(jsonSchema, 'vendorExtensions')
        omitted.additionalProperties = false
        if (jsonSchema.properties) {
          omitted.required = Object.keys(omitted.properties)
        }
        writeFileSync(fileNameJson, stringify(omitted, null, 2))
        return omitted
      })
      .then((omited) => compile(omited, options))
      .then((tsText) => {
        writeFileSync(fileName, tsText)
        console.log('done', fileName)
      })
  } catch (e) {
    console.log(e)
  }
}

export const generate = (targetDir, filesGlob, filesExt) => {
  const pattern = join(targetDir, filesGlob)
  console.log('process', pattern)
  const files = glob.sync(pattern)
  const context = { count: 0 }
  files.forEach(processFile(filesExt, context))
  console.log(`process ${context.count} files`)
}
