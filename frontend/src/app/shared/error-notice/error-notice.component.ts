import { Component, input } from '@angular/core';
import { OperationError } from '../../core/http/operation-error.utils';

@Component({
  selector: 'app-error-notice', standalone: true,
  template: `@if (error(); as issue) {
    <div class="alert alert-danger mb-3" role="alert">
      <i class="bi bi-exclamation-circle me-2" aria-hidden="true"></i>{{ issue.message }}
      @if (issue.requestId) { <small class="d-block mt-1">Referencia: {{ issue.requestId }}</small> }
    </div>
  }`,
})
export class ErrorNoticeComponent { readonly error = input<OperationError | null>(null); }
