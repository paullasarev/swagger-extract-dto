import { resolve } from 'path';
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import { generate } from '../schema/typescript';

const argv = yargs(hideBin(process.argv))
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
  .demandOption(['f', 'o'])
  .help('h')
  .alias('h', 'help')
  .epilog('copyright 2021').argv;

generate(resolve(argv.file), resolve(argv.out), argv.json);
