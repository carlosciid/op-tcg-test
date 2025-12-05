import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Card_price_request {
    card_name: string;
    set_name?: string;
    is_foil: boolean;
}

export interface Search_suggestion {
    text: string;
    card_name: string;
    set_name: string | null;
    product_line: string | null;
    image_url: string | null;
    product_url: string | null;
    market_price: number | null;
    rarity: string | null;
    card_number: string | null;
    card_type: string | null;
    color: string | null;
}

export interface Search_results_response {
    results: Search_suggestion[];
    total_results: number;
    page: number;
    page_size: number;
    total_pages: number;
    has_next_page: boolean;
    has_previous_page: boolean;
}

export interface Card_price_response {
    card_name: string;
    set_name: string;
    is_foil: boolean;
    market_price: number;
    currency: string;
    source_url: string;
}

@Injectable({
    providedIn: 'root'
})
export class CardPriceService {
    // Comentario: centralizamos la URL base del backend para facilitar cambios de entorno (dev, prod, etc.).
    private readonly api_base_url = 'http://127.0.0.1:8001';

    private http_client = inject(HttpClient);

    get_market_price(request: Card_price_request): Observable<Card_price_response> {
        // Comentario: esta llamada HTTP encapsula el contrato entre el frontend y el backend para consultas de precio.
        return this.http_client.post<Card_price_response>(
            `${this.api_base_url}/api/price`,
            request
        );
    }

    get_suggestions(query: string, page: number = 1, page_size: number = 24): Observable<Search_results_response> {
        // Comentario: obtiene resultados de búsqueda desde TCGplayer con paginación.
        if (!query || query.length < 2) {
            return new Observable(observer => {
                observer.next({
                    results: [],
                    total_results: 0,
                    page: page,
                    page_size: page_size,
                    total_pages: 0,
                    has_next_page: false,
                    has_previous_page: false
                });
                observer.complete();
            });
        }
        return this.http_client.get<Search_results_response>(
            `${this.api_base_url}/api/suggestions`,
            { params: { q: query, page: page.toString(), page_size: page_size.toString() } }
        );
    }
}


