import { DOCUMENT } from '@angular/common';
import { Component, DestroyRef, ElementRef, inject, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { NavbarComponent } from '../navbar/navbar.component';
import { SidebarComponent } from '../sidebar/sidebar.component';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [NavbarComponent, SidebarComponent, RouterOutlet],
  templateUrl: './main-layout.component.html',
  styleUrl: './main-layout.component.scss',
})
export class MainLayoutComponent {
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('mobileMenu');
  private readonly document = inject(DOCUMENT);

  constructor() {
    const destroyRef = inject(DestroyRef);
    inject(Router).events.pipe(
      filter((event) => event instanceof NavigationEnd),
      takeUntilDestroyed(destroyRef),
    ).subscribe(() => this.closeMenu());
    const desktop = this.document.defaultView?.matchMedia('(min-width: 992px)');
    const closeOnDesktop = (event: MediaQueryListEvent) => { if (event.matches) this.closeMenu(); };
    desktop?.addEventListener('change', closeOnDesktop);
    destroyRef.onDestroy(() => desktop?.removeEventListener('change', closeOnDesktop));
  }

  openMenu(): void { this.dialog()?.nativeElement.showModal(); }
  closeMenu(): void { this.dialog()?.nativeElement.close(); }
  closeOnBackdrop(event: MouseEvent): void {
    if (event.target === this.dialog()?.nativeElement) this.closeMenu();
  }
}
