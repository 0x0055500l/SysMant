import { DOCUMENT } from '@angular/common';
import { afterNextRender, Component, computed, ElementRef, inject, input, output, viewChild, ViewEncapsulation } from '@angular/core';
import { Mantenimiento } from '../../../core/models/mantenimientos.models';
import { DecimalAmountPipe, UtcDatePipe } from '../../../shared/pipes/display.pipe';
import { StatusBadgeComponent } from '../../../shared/status-badge/status-badge.component';

@Component({
  selector: 'app-orden-trabajo-print', standalone: true,
  imports: [UtcDatePipe, DecimalAmountPipe, StatusBadgeComponent],
  templateUrl: './orden-trabajo-print.component.html', styleUrl: './orden-trabajo-print.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class OrdenTrabajoPrintComponent {
  readonly order = input.required<Mantenimiento>();
  readonly dismissed = output<void>();
  readonly activities = computed(() => this.order().descripcion.split(/\r?\n/).filter((line) => line.trim()));
  private readonly window = inject(DOCUMENT).defaultView;
  private readonly heading = viewChild.required<ElementRef<HTMLHeadingElement>>('heading');
  constructor() { afterNextRender(() => this.heading().nativeElement.focus()); }
  print(): void { this.window?.print(); }
}
