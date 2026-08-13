#!/usr/bin/env node
import { Command } from 'commander';
import { getVersionString } from '@metroforge/core';
import { registerDoctorCommand } from './commands/doctor.js';
import { registerCreateCommand } from './commands/create.js';
import { registerGenerateCommand } from './commands/generate.js';
import { registerProvidersCommand } from './commands/providers.js';
import { registerValidateCommand } from './commands/validate.js';
import { registerModelsCommand, registerScoutCommand } from './commands/models.js';
import { registerOpenCommand } from './commands/open.js';
import { registerExportCommand } from './commands/export.js';
import { registerProjectCommand } from './commands/project.js';
import { registerAcceptCommand } from './commands/accept.js';
import { registerConfigCommand } from './commands/config.js';

const program = new Command();

program
  .name('metroforge')
  .description('MetroForge AI — Metroidvania game generation platform')
  .version(getVersionString());

registerDoctorCommand(program);
registerCreateCommand(program);
registerGenerateCommand(program);
registerProvidersCommand(program);
registerValidateCommand(program);
registerModelsCommand(program);
registerScoutCommand(program);
registerOpenCommand(program);
registerExportCommand(program);
registerProjectCommand(program);
registerAcceptCommand(program);
registerConfigCommand(program);

program.parse();
