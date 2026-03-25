import { Routes } from '@angular/router';
import { Shogiban } from './shogiban/shogiban';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'analyse',
  },
  {
    path: 'analyse',
    component: Shogiban,
  },
  {
    path: '**',
    redirectTo: 'analyse',
  },
];
