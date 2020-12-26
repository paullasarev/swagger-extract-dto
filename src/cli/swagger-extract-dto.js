import { resolve } from 'path';
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import { generate } from '../schema/typescript';

export const SCHEMA_EXT = '.schema.json';
export const SCHEMA_FILES = `/**/*${SCHEMA_EXT}`;

const argv = yargs(hideBin(process.argv))
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

generate(resolve(argv.file), resolve(argv.out), SCHEMA_FILES, SCHEMA_EXT);
