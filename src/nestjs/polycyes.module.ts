import { Module, DynamicModule, Global } from '@nestjs/common';
import type { Engine } from '../engine.js';
import { POLYCYES_ENGINE, POLYCYES_OPTIONS } from './polycyes.constants.js';
import type { PolycyesModuleOptions } from './polycyes.constants.js';
import { PolycyesGuard } from './polycyes.guard.js';

@Global()
@Module({})
export class PolycyesModule {
  static forRoot(engine: Engine, options: PolycyesModuleOptions = {}): DynamicModule {
    return {
      module: PolycyesModule,
      providers: [
        { provide: POLYCYES_ENGINE, useValue: engine },
        { provide: POLYCYES_OPTIONS, useValue: options },
        PolycyesGuard,
      ],
      exports: [POLYCYES_ENGINE, PolycyesGuard],
    };
  }
}
