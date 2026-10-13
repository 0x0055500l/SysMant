import { Component } from '@angular/core';
import { EnvironmentalSealComponent } from './environmental-seal.component';
import { PumaLogoComponent } from './puma-logo.component';

@Component({
  selector: 'app-institutional-header', standalone: true,
  imports: [PumaLogoComponent, EnvironmentalSealComponent],
  template: `
    <div class="institutional-heading">
      <app-puma-logo />
      <strong>Inversiones de la Costa</strong>
      <app-environmental-seal />
    </div>
  `,
  styleUrl: './institutional-header.component.scss',
})
export class InstitutionalHeaderComponent {}
