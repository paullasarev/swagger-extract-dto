import { resolve } from 'path'
import { generate } from '../schema/typescript'

export const SCHEMA_EXT = '.schema.json'
export const SCHEMA_FILES = `/**/*${SCHEMA_EXT}`

generate(resolve('../../src'), SCHEMA_FILES, SCHEMA_EXT)
