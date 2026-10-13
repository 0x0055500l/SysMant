import { Component } from '@angular/core';

@Component({
  selector: 'app-puma-logo', standalone: true,
  template: '<img src="branding/puma-energy-logo.png" width="500" height="281" alt="Puma Energy" />',
  styles: [':host { display: block; width: 100%; } img { display: block; width: 100%; height: auto; }'],
})
export class PumaLogoComponent {}
