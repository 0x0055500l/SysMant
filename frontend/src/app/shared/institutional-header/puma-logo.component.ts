import { Component } from '@angular/core';

@Component({
  selector: 'app-puma-logo', standalone: true,
  templateUrl: './puma-logo.svg',
  styles: [':host { display: block; width: 100%; } svg { display: block; width: 100%; height: auto; }'],
})
export class PumaLogoComponent {}
