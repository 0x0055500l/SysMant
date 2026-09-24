import { Component, computed, input } from '@angular/core';

const labels: Record<string, string> = {
  operativo: 'Operativo', en_mantenimiento: 'En mantenimiento', baja: 'Baja',
  pendiente: 'Pendiente', en_proceso: 'En proceso', completado: 'Completado',
  vencido: 'Vencido', proximo: 'Próximo', preventivo: 'Preventivo', correctivo: 'Correctivo',
};

@Component({
  selector: 'app-status-badge', standalone: true,
  template: `<span class="sm-status" [class]="'sm-status sm-status-' + value()">{{ label() }}</span>`,
})
export class StatusBadgeComponent {
  readonly value = input.required<string>();
  readonly label = computed(() => labels[this.value()] ?? 'Desconocido');
}
