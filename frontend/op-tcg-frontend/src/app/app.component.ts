import { ChangeDetectionStrategy, Component, inject, signal, computed } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AsyncPipe, DecimalPipe, NgFor, NgIf } from '@angular/common';
import { CardPriceService, Search_suggestion } from './card-price.service';

@Component({
    selector: 'app-root',
    standalone: true,
    imports: [RouterOutlet, ReactiveFormsModule, NgIf, NgFor, AsyncPipe, DecimalPipe],
    templateUrl: './app.component.html',
    styleUrl: './app.component.css',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppComponent {
    // Comentario: este formulario captura los datos mínimos de la carta que usaremos para buscar el precio en el backend.
    card_form: FormGroup;
    search_form: FormGroup;

    // Comentario: usamos signals para manejar el estado de la vista de forma reactiva y predecible.
    is_loading = signal(false);
    error_message = signal<string | null>(null);
    market_price = signal<number | null>(null);
    currency = signal<string>('USD');

    private form_builder = inject(FormBuilder);
    private card_price_service = inject(CardPriceService);

    search_results = signal<Search_suggestion[]>([]);
    search_response = signal<any>(null); // Search_results_response
    is_searching = signal(false);
    current_page = signal(1);
    page_size = signal(24);
    
    // Filtros
    filter_rarity = signal<string>('all');
    filter_set = signal<string>('all');
    filter_card_type = signal<string>('all');
    filter_color = signal<string>('all');
    
    // Resultados filtrados computados
    filtered_results = computed(() => {
        let results = this.search_results();
        
        // Filtrar por rareza
        if (this.filter_rarity() !== 'all') {
            results = results.filter(r => r.rarity === this.filter_rarity());
        }
        
        // Filtrar por set
        if (this.filter_set() !== 'all') {
            results = results.filter(r => r.set_name && r.set_name.startsWith(this.filter_set()));
        }
        
        // Filtrar por card_type
        if (this.filter_card_type() !== 'all') {
            results = results.filter(r => r.card_type === this.filter_card_type());
        }
        
        // Filtrar por color
        if (this.filter_color() !== 'all') {
            results = results.filter(r => r.color === this.filter_color());
        }
        
        return results;
    });
    
    // Obtener rarezas únicas para el filtro
    unique_rarities = computed(() => {
        const rarities = new Set(this.search_results().map(r => r.rarity).filter(r => r !== null));
        return Array.from(rarities).sort();
    });
    
    // Obtener sets únicos para el filtro (formateados con código)
    unique_sets = computed(() => {
        const sets = new Set(this.search_results()
            .filter(r => r.set_name !== null)
            .map(r => this.format_set_name(r)));
        return Array.from(sets).sort();
    });
    
    // Obtener card_types únicos basados en los resultados disponibles para filtrar
    unique_card_types = computed(() => {
        const card_types = new Set(this.available_for_filtering().map(r => r.card_type).filter(ct => ct !== null && ct !== undefined && ct !== ''));
        return Array.from(card_types).sort();
    });
    
    // Obtener colores únicos basados en los resultados disponibles para filtrar
    unique_colors = computed(() => {
        const colors = new Set(this.available_for_filtering().map(r => r.color).filter(c => c !== null && c !== undefined && c !== ''));
        return Array.from(colors).sort();
    });

    constructor() {
        this.card_form = this.form_builder.group({
            card_name: ['', [Validators.required, Validators.maxLength(120)]],
            set_name: ['', [Validators.maxLength(120)]],
            is_foil: [false]
        });
        
        this.search_form = this.form_builder.group({
            search_query: ['', [Validators.required, Validators.minLength(2)]]
        });
    }

    on_search(page: number = 1): void {
        if (this.search_form.invalid) {
            this.search_form.markAllAsTouched();
            return;
        }
        
        const query = this.search_form.get('search_query')?.value?.trim();
        if (!query || query.length < 2) {
            return;
        }
        
        this.is_searching.set(true);
        this.search_results.set([]);
        this.current_page.set(page);
        
        this.card_price_service.get_suggestions(query, page, this.page_size()).subscribe({
            next: (response) => {
                this.search_response.set(response);
                this.search_results.set(response.results);
                this.is_searching.set(false);
                // Resetear filtros solo si es la primera página
                if (page === 1) {
                    this.filter_rarity.set('all');
                    this.filter_set.set('all');
                    this.filter_card_type.set('all');
                    this.filter_color.set('all');
                }
            },
            error: () => {
                this.search_results.set([]);
                this.search_response.set(null);
                this.is_searching.set(false);
                this.error_message.set('Error al buscar cartas. Intenta nuevamente.');
            }
        });
    }
    
    go_to_page(page: number): void {
        if (page >= 1 && page <= (this.search_response()?.total_pages || 1)) {
            this.on_search(page);
        }
    }
    
    next_page(): void {
        const response = this.search_response();
        if (response && response.has_next_page) {
            this.go_to_page(this.current_page() + 1);
        }
    }
    
    previous_page(): void {
        const response = this.search_response();
        if (response && response.has_previous_page) {
            this.go_to_page(this.current_page() - 1);
        }
    }
    
    get_page_numbers(): number[] {
        const response = this.search_response();
        if (!response || response.total_pages === 0) {
            return [];
        }
        
        const current = this.current_page();
        const total = response.total_pages;
        const pages: number[] = [];
        
        // Mostrar máximo 7 números de página
        let start = Math.max(1, current - 3);
        let end = Math.min(total, current + 3);
        
        // Ajustar si estamos cerca del inicio o final
        if (end - start < 6) {
            if (start === 1) {
                end = Math.min(total, start + 6);
            } else {
                start = Math.max(1, end - 6);
            }
        }
        
        for (let i = start; i <= end; i++) {
            pages.push(i);
        }
        
        return pages;
    }

    select_card(card: Search_suggestion): void {
        this.card_form.patchValue({
            card_name: card.card_name,
            set_name: card.set_name || ''
        });
    }

    on_image_error(event: Event): void {
        const img = event.target as HTMLImageElement;
        if (img) {
            img.style.display = 'none';
        }
    }
    
    clear_filters(): void {
        this.filter_rarity.set('all');
        this.filter_set.set('all');
        this.filter_card_type.set('all');
        this.filter_color.set('all');
    }
    
    // Formatear el set con nombre y código (ej: "Romance Dawn-OP01")
    format_set_name(card: Search_suggestion): string {
        if (!card.set_name) return '';
        
        // Si el set_name ya incluye el código con guión, devolverlo tal cual
        if (card.set_name.includes('-') && /OP\d{2}|ST\d{2}/.test(card.set_name)) {
            return card.set_name;
        }
        
        // Si tenemos el número de carta, extraer el código del set
        if (card.card_number) {
            const set_code = card.card_number.split('-')[0];
            return `${card.set_name}-${set_code}`;
        }
        
        return card.set_name;
    }
    
    // Obtener resultados filtrados sin aplicar los filtros de color y card_type
    // Esto permite que los dropdowns muestren todas las opciones disponibles
    // basadas en los otros filtros aplicados
    available_for_filtering = computed(() => {
        let results = this.search_results();
        
        // Aplicar solo los filtros de rarity y set (sin color y card_type)
        if (this.filter_rarity() !== 'all') {
            results = results.filter(r => r.rarity === this.filter_rarity());
        }
        
        if (this.filter_set() !== 'all') {
            results = results.filter(r => {
                if (!r.set_name) return false;
                const formatted = this.format_set_name(r);
                return formatted === this.filter_set() || formatted.startsWith(this.filter_set());
            });
        }
        
        return results;
    });
    

    get is_submit_disabled(): boolean {
        // Comentario: centralizamos la lógica de deshabilitar el botón para mantener el template sencillo.
        return this.card_form.invalid || this.is_loading();
    }

    on_submit(): void {
        // Comentario: validamos en el cliente antes de llamar al backend para evitar solicitudes innecesarias.
        if (this.card_form.invalid) {
            this.card_form.markAllAsTouched();
            return;
        }

        this.is_loading.set(true);
        this.error_message.set(null);
        this.market_price.set(null);

        const form_value = this.card_form.value;

        this.card_price_service
            .get_market_price({
                card_name: form_value.card_name,
                set_name: form_value.set_name,
                is_foil: !!form_value.is_foil
            })
            .subscribe({
                next: (response) => {
                    // Comentario: persistimos el resultado exitoso para mostrarlo al usuario.
                    this.market_price.set(response.market_price);
                    this.currency.set(response.currency);
                    this.is_loading.set(false);
                },
                error: () => {
                    // Comentario: manejamos errores genéricos para no exponer detalles internos al usuario final.
                    this.error_message.set('No fue posible obtener el precio de la carta. Intenta nuevamente más tarde.');
                    this.is_loading.set(false);
                }
            });
    }
}
