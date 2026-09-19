import { Component } from '@angular/core';

@Component({
  selector: 'app-brand',
  standalone: true,
  template: `
    <span class="brand-lockup">
      <img src="favicon.svg" width="42" height="42" alt="" />
      <span><span class="brand-name">SysMant<span class="brand-dot">.</span></span>
      <span class="brand-caption">MANTENIMIENTO</span></span>
    </span>
  `,
  styles: `
    .brand-lockup { display: inline-flex; align-items: center; gap: .7rem; }
    .brand-name { display: block; font-size: 1.8rem; font-weight: 750; letter-spacing: -.065rem; line-height: 1.15; }
    .brand-dot { color: #ee555e; }
    .brand-caption { display: block; font-size: .75rem; letter-spacing: .035rem; margin-top: .3rem; }
  `,
})
export class BrandComponent {}
