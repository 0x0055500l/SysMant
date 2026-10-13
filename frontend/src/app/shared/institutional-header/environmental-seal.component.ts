import { Component } from '@angular/core';

@Component({
  selector: 'app-environmental-seal', standalone: true,
  template: '<img src="branding/emblema-institucional.jpg" width="1130" height="928" alt="Emblema institucional de Inversiones de la Costa" />',
  styles: [':host { display: block; width: 100%; } img { display: block; width: 100%; height: auto; }'],
})
export class EnvironmentalSealComponent {}
