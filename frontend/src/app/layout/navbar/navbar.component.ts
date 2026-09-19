import { Component, computed, inject, output } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.scss',
})
export class NavbarComponent {
  readonly auth = inject(AuthService);
  readonly menuToggle = output<void>();
  readonly initials = computed(() => (this.auth.currentUser()?.nombre ?? '')
    .trim().split(/\s+/).slice(0, 2).map((part) => Array.from(part)[0]).join('').toUpperCase());
}
