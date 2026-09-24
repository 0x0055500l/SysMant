import { Component, computed, input, output } from '@angular/core';
import { Pagination } from '../../core/models/api.models';

@Component({
  selector: 'app-pagination', standalone: true,
  template: `
    <nav class="sm-pagination" [attr.aria-label]="label()">
      <span class="text-body-secondary small" aria-live="polite">{{ start() }}–{{ end() }} de {{ pagination().total }} registros</span>
      <div class="d-flex align-items-center gap-2 flex-wrap">
        @if (showLimit()) {
          <label class="small">Por página
            <select class="form-select form-select-sm d-inline-block w-auto ms-2" [value]="pagination().limit" [disabled]="disabled()" (change)="changeLimit($event)">
              @for (size of limits(); track size) { <option [value]="size">{{ size }}</option> }
            </select>
          </label>
        }
        <button type="button" class="btn btn-sm btn-outline-secondary" [disabled]="disabled() || pagination().page <= 1" (click)="pageChange.emit(pagination().page - 1)" aria-label="Página anterior"><i class="bi bi-chevron-left" aria-hidden="true"></i></button>
        <span class="small">Página {{ pagination().page }} de {{ pagination().totalPages || 1 }}</span>
        <button type="button" class="btn btn-sm btn-outline-secondary" [disabled]="disabled() || pagination().page >= pagination().totalPages" (click)="pageChange.emit(pagination().page + 1)" aria-label="Página siguiente"><i class="bi bi-chevron-right" aria-hidden="true"></i></button>
      </div>
    </nav>`,
})
export class PaginationComponent {
  readonly pagination = input.required<Pagination>();
  readonly disabled = input(false);
  readonly label = input('Paginación');
  readonly showLimit = input(true);
  readonly limits = input<readonly number[]>([20, 50, 100]);
  readonly pageChange = output<number>();
  readonly limitChange = output<number>();
  readonly start = computed(() => this.pagination().total ? (this.pagination().page - 1) * this.pagination().limit + 1 : 0);
  readonly end = computed(() => Math.min(this.pagination().page * this.pagination().limit, this.pagination().total));
  changeLimit(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    const limit = this.limits().find((size) => String(size) === value);
    if (limit) this.limitChange.emit(limit);
  }
}
