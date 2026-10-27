import { provideAppInitializer, inject } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { PortalAuthService, portalInterceptor } from './app/core/auth.service';
bootstrapApplication(AppComponent, {
  providers: [provideHttpClient(withInterceptors([portalInterceptor])), provideRouter(routes, withComponentInputBinding()),
    provideAppInitializer(() => inject(PortalAuthService).restore())],
}).catch(() => { document.querySelector('app-root')?.replaceChildren(document.createTextNode('No fue posible cargar el portal. Recarga la página.')); });
