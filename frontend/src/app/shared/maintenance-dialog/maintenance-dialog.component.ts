import { afterNextRender, Component, ElementRef, input, output, viewChild } from '@angular/core';

let nextDialog = 0;
@Component({
  selector: 'app-maintenance-dialog', standalone: true,
  template: `<dialog #dialog class="maintenance-dialog" [class.wide]="wide()" [attr.aria-labelledby]="titleId" (cancel)="cancel($event)" (close)="dismissed.emit()">
    <div class="p-4"><header class="d-flex justify-content-between align-items-start gap-3 mb-3">
      <h2 [id]="titleId" class="h4 mb-0">{{ title() }}</h2>
      <button type="button" class="btn-close" aria-label="Cerrar diálogo" [disabled]="busy()" (click)="close()"></button>
    </header><ng-content /></div>
  </dialog>`,
  styles: `.maintenance-dialog { width: min(34rem, calc(100% - 2rem)); max-height: 90dvh; border: 1px solid var(--sm-border); border-radius: 1rem; padding: 0; color: var(--sm-text); box-shadow: 0 1rem 4rem #14271f30; } .wide { width: min(54rem, calc(100% - 2rem)); } .maintenance-dialog::backdrop { background: #14271f85; }`,
})
export class MaintenanceDialogComponent {
  readonly title = input.required<string>();
  readonly busy = input(false);
  readonly wide = input(false);
  readonly dismissed = output<void>();
  readonly titleId = `maintenance-dialog-${++nextDialog}`;
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  constructor() { afterNextRender(() => this.dialog().nativeElement.showModal()); }
  cancel(event: Event): void { if (this.busy()) event.preventDefault(); }
  close(): void { if (!this.busy()) this.dialog().nativeElement.close(); }
}
