from typing import Any
import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import quote_plus

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from playwright.sync_api import sync_playwright

# Configurar logging para debugging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)


class Card_query(BaseModel):
    card_name: str = Field(..., max_length=120)
    set_name: str = Field("", max_length=120)  # Ahora es opcional
    is_foil: bool = False


class Search_suggestion(BaseModel):
    text: str
    card_name: str
    set_name: str | None = None
    product_line: str | None = None
    image_url: str | None = None
    product_url: str | None = None
    market_price: float | None = None
    rarity: str | None = None
    card_number: str | None = None
    card_type: str | None = None  # Leader, Character, Event, Stage, etc.
    color: str | None = None  # RED, BLUE, GREEN, PURPLE, YELLOW, BLACK


class Search_results_response(BaseModel):
    results: list[Search_suggestion]
    total_results: int
    page: int
    page_size: int
    total_pages: int
    has_next_page: bool
    has_previous_page: bool


class Card_price(BaseModel):
    card_name: str
    set_name: str
    is_foil: bool
    market_price: float
    currency: str = "USD"
    source_url: str


app = FastAPI(
    title="One Piece TCG Market Price API",
    version="0.1.0",
    description=(
        "API para consultar precios de cartas de One Piece TCG desde TCGplayer, "
        "utilizando Playwright para navegar la web."
    ),
)

# Comentario: habilitamos CORS para permitir que el frontend de Angular (localhost:4200)
# consuma este API durante el desarrollo sin errores de política de mismo origen.
app.add_middleware(
    CORSMiddleware,
    # Comentario: durante el desarrollo permitimos cualquier origen para evitar problemas de CORS.
    # En producción es recomendable restringir esta lista a los dominios reales del frontend.
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def extract_market_price_from_page_sync(page) -> float:
    """
    Comentario: esta función encapsula la lógica de scraping para facilitar ajustes
    cuando cambie la estructura de TCGplayer. Primero intentamos leer el precio de mercado
    directamente desde la tarjeta de producto en la vista de grid.
    Basado en pruebas con MCP de Playwright que confirmaron el selector exacto.
    """
    import re
    import logging

    logger = logging.getLogger(__name__)

    # Esperamos a que aparezcan las tarjetas de producto primero (más confiable)
    # Luego esperamos específicamente el selector del precio
    try:
        logger.info("Esperando tarjetas de producto...")
        page.wait_for_selector('[class*="product-card"]', timeout=15000)
        logger.info("Tarjetas de producto encontradas")
        
        # Ahora esperamos específicamente el selector del precio
        logger.info("Esperando selector de precio...")
        page.wait_for_selector(".product-card__market-price--value", timeout=10000)
        logger.info("Selector de precio encontrado")
    except Exception as e:
        # Si no aparece, esperamos un poco más y continuamos
        logger.warning(f"Timeout esperando selectores: {e}, esperando 5s más...")
        page.wait_for_timeout(5000)

    # 1) Selector principal descubierto con MCP de Playwright para Monkey.D.Luffy OP05-119
    # Confirmado: existe y funciona, formato: <span class="product-card__market-price--value">$3.78</span>
    primary_selector = ".product-card__market-price--value"
    
    price_element = page.query_selector(primary_selector)
    if price_element:
        text = price_element.inner_text() or ""
        logger.info(f"Texto encontrado con selector principal: '{text}'")
        if "$" in text:
            cleaned = text.replace("$", "").replace(",", "").strip()
            price_match = re.search(r"(\d+\.?\d*)", cleaned)
            if price_match:
                try:
                    price_val = float(price_match.group(1))
                    if 0.01 <= price_val <= 100000:  # Rango ampliado para cartas raras
                        logger.info(f"Precio extraído exitosamente: ${price_val}")
                        return price_val
                except ValueError as e:
                    logger.warning(f"Error al convertir precio '{cleaned}': {e}")

    # Fallback: selector alternativo con contexto completo
    fallback_selector = "section.product-card__market-price span.product-card__market-price--value"
    price_element = page.query_selector(fallback_selector)
    if price_element:
        text = price_element.inner_text() or ""
        logger.info(f"Texto encontrado con selector fallback: '{text}'")
        if "$" in text:
            cleaned = text.replace("$", "").replace(",", "").strip()
            price_match = re.search(r"(\d+\.?\d*)", cleaned)
            if price_match:
                try:
                    price_val = float(price_match.group(1))
                    if 0.01 <= price_val <= 100000:
                        logger.info(f"Precio extraído con fallback: ${price_val}")
                        return price_val
                except ValueError as e:
                    logger.warning(f"Error al convertir precio fallback '{cleaned}': {e}")

    # Fallback adicional: buscar cualquier span con la clase (hay múltiples resultados)
    price_elements = page.query_selector_all("span.product-card__market-price--value")
    logger.info(f"Encontrados {len(price_elements)} elementos de precio en la página")
    for idx, element in enumerate(price_elements):
        text = element.inner_text() or ""
        if "$" in text:
            cleaned = text.replace("$", "").replace(",", "").strip()
            price_match = re.search(r"(\d+\.?\d*)", cleaned)
            if price_match:
                try:
                    price_val = float(price_match.group(1))
                    if 0.01 <= price_val <= 100000:
                        logger.info(f"Precio extraído del elemento #{idx + 1}: ${price_val}")
                        return price_val
                except ValueError as e:
                    logger.warning(f"Error al convertir precio del elemento #{idx + 1} '{cleaned}': {e}")
                    continue

    # Último fallback: buscar patrones de precio en toda la página
    page_text = page.inner_text("body")
    price_patterns = [
        r"\$(\d+\.?\d*)",  # $12.50
        r"(\d+\.?\d*)\s*USD",  # 12.50 USD
    ]

    for pattern in price_patterns:
        matches = re.findall(pattern, page_text)
        logger.info(f"Patrón '{pattern}' encontró {len(matches)} coincidencias")
        for match in matches:
            try:
                price_val = float(match)
                if 0.01 <= price_val <= 100000:
                    logger.info(f"Precio extraído con patrón regex: ${price_val}")
                    return price_val
            except (ValueError, IndexError) as e:
                logger.warning(f"Error al procesar match '{match}': {e}")
                continue

    # Si llegamos aquí, no encontramos ningún precio válido
    logger.error("No se pudo extraer ningún precio de la página")
    raise ValueError(
        "No se encontró un precio de mercado reconocible en la página de resultados."
    )


def fetch_card_price_from_tcgplayer_sync(query: Card_query) -> Card_price:
    """
    Comentario: esta función abre la vista de grid de productos de One Piece TCG en TCGplayer
    y extrae el precio de mercado directamente de la primera tarjeta de producto que coincida
    con el criterio de búsqueda.
    """
    import logging

    logger = logging.getLogger(__name__)

    # Comentario: usamos la búsqueda general de TCGplayer que es más efectiva
    # basado en la exploración con MCP de Playwright para Monkey.D.Luffy OP05-119
    base_url = "https://www.tcgplayer.com/search/all/product"
    
    # Construir términos de búsqueda: si hay set_name, incluirlo; si no, solo el nombre
    if query.set_name and query.set_name.strip():
        search_terms = f"{query.card_name} {query.set_name}"
    else:
        search_terms = query.card_name
    
    if query.is_foil:
        search_terms += " foil"

    # Formato de URL descubierto con MCP: ?q=nombre+set&view=grid
    search_url = f"{base_url}?q={quote_plus(search_terms)}&view=grid"
    logger.info(f"Buscando carta: {query.card_name} - {query.set_name or '(sin set)'} (foil: {query.is_foil})")
    logger.info(f"URL de búsqueda: {search_url}")

    with sync_playwright() as p:
        # Usar un contexto de navegador con configuración más permisiva
        browser = p.chromium.launch(
            headless=True,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--disable-dev-shm-usage",
                "--no-sandbox",
            ]
        )
        try:
            # Crear contexto con viewport y user agent realista
            context = browser.new_context(
                viewport={"width": 1920, "height": 1080},
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            )
            page = context.new_page()
            
            logger.info("Navegando a TCGplayer...")
            page.goto(search_url, wait_until="domcontentloaded", timeout=30000)
            
            # Esperar a que aparezca el contenido de productos (más confiable que networkidle)
            logger.info("Esperando a que cargue el contenido de productos...")
            try:
                # Esperar a que aparezcan las tarjetas de producto
                page.wait_for_selector('[class*="product-card"]', timeout=15000)
                logger.info("Tarjetas de producto detectadas")
            except Exception as e:
                logger.warning(f"Timeout esperando tarjetas de producto: {e}")
            
            # Esperar un poco más para que JavaScript termine de renderizar los precios
            page.wait_for_timeout(2000)
            
            # Intentar cerrar banner de cookies si aparece
            try:
                cookie_button = page.query_selector('button:has-text("Allow All"), button:has-text("Accept")')
                if cookie_button:
                    logger.info("Cerrando banner de cookies...")
                    cookie_button.click()
                    page.wait_for_timeout(1000)
            except Exception:
                pass  # Si no hay banner, continuar
            
            logger.info("Extrayendo precio...")
            market_price = extract_market_price_from_page_sync(page)

            logger.info(f"Precio encontrado: ${market_price}")
            return Card_price(
                card_name=query.card_name,
                set_name=query.set_name,
                is_foil=query.is_foil,
                market_price=market_price,
                source_url=search_url,
            )
        finally:
            context.close()
            browser.close()
            logger.info("Navegador cerrado")


# Comentario: creamos un thread pool executor para ejecutar Playwright de forma síncrona
# sin bloquear el event loop de asyncio. Esto evita problemas con ProactorEventLoop en Windows.
_executor = ThreadPoolExecutor(max_workers=2)


async def fetch_card_price_from_tcgplayer(query: Card_query) -> Card_price:
    """
    Comentario: wrapper asíncrono que ejecuta la función síncrona de Playwright en un thread pool.
    Esto resuelve el problema de NotImplementedError con asyncio en Windows.
    """
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(_executor, fetch_card_price_from_tcgplayer_sync, query)


def get_search_suggestions_sync(query_text: str, page: int = 1, page_size: int = 24) -> Search_results_response:
    """
    Obtiene sugerencias de búsqueda de TCGplayer extrayendo información completa
    de las tarjetas de producto incluyendo imágenes, precios y detalles.
    Implementa paginación para devolver siempre la misma cantidad de resultados.
    """
    import logging
    import re
    import math
    logger = logging.getLogger(__name__)
    
    if not query_text or len(query_text.strip()) < 2:
        return Search_results_response(
            results=[],
            total_results=0,
            page=page,
            page_size=page_size,
            total_pages=0,
            has_next_page=False,
            has_previous_page=False
        )
    
    # Usar la URL específica de One Piece Card Game para obtener los mismos resultados que TCGplayer
    base_url = "https://www.tcgplayer.com/search/one-piece-card-game/product"
    # TCGplayer usa parámetro ?page=N para paginación
    search_url = f"{base_url}?q={quote_plus(query_text)}&view=grid&page={page}"
    
    suggestions = []
    total_results_from_page = None  # Variable para almacenar el total extraído del heading
    
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--disable-dev-shm-usage",
                "--no-sandbox",
            ]
        )
        try:
            context = browser.new_context(
                viewport={"width": 1920, "height": 1080},
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            )
            browser_page = context.new_page()
            
            browser_page.goto(search_url, wait_until="domcontentloaded", timeout=20000)
            
            # Esperar a que aparezcan las tarjetas de producto
            try:
                browser_page.wait_for_selector('a[href*="/product/"]', timeout=10000)
            except Exception:
                pass
            
            # Intentar cerrar banner de cookies
            try:
                cookie_button = browser_page.query_selector('button:has-text("Allow All"), button:has-text("Accept")')
                if cookie_button:
                    cookie_button.click()
                    browser_page.wait_for_timeout(1000)
            except Exception:
                pass
            
            # Esperar un poco más para que las imágenes se carguen
            browser_page.wait_for_timeout(2000)
            
            # Intentar extraer el total de resultados desde el heading
            try:
                heading_element = browser_page.query_selector('h1')
                if heading_element:
                    heading_text = heading_element.inner_text()
                    # Buscar patrón como "111 results for: "law" in One Piece Card Game"
                    match = re.search(r'(\d+)\s+results', heading_text)
                    if match:
                        total_results_from_page = int(match.group(1))
                        logger.info(f"Total de resultados encontrado en la página: {total_results_from_page}")
            except Exception as e:
                logger.debug(f"No se pudo extraer el total de resultados del heading: {e}")
            
            # Hacer scroll para cargar más contenido dinámico (lazy loading)
            # TCGplayer carga contenido mientras haces scroll
            browser_page.evaluate("""
                () => {
                    window.scrollTo(0, document.body.scrollHeight);
                }
            """)
            browser_page.wait_for_timeout(2000)  # Esperar a que cargue contenido adicional
            
            # Scroll hacia arriba para asegurar que todo esté visible
            browser_page.evaluate("""
                () => {
                    window.scrollTo(0, 0);
                }
            """)
            browser_page.wait_for_timeout(1000)
            
            # Buscar tarjetas de producto (no sugerencias del autocompletado, sino resultados reales)
            # Obtener TODAS las tarjetas de producto primero
            all_product_cards = browser_page.query_selector_all('a[href*="/product/"]')
            
            # Filtrar solo las de One Piece Card Game
            product_cards = [card for card in all_product_cards if 'one-piece' in (card.get_attribute('href') or '').lower()]
            
            logger.info(f"Encontradas {len(product_cards)} tarjetas de One Piece en la página {page} (de {len(all_product_cards)} totales)")
            
            seen_products = set()
            # Procesar TODOS los resultados de One Piece encontrados (sin límite artificial)
            for card in product_cards:
                try:
                    # Extraer URL del producto
                    product_href = card.get_attribute('href')
                    if not product_href or product_href in seen_products:
                        continue
                    
                    # Extraer ID del producto de la URL (ej: /product/615592/...)
                    product_id_match = re.search(r'/product/(\d+)/', product_href)
                    if not product_id_match:
                        continue
                    
                    product_id = product_id_match.group(1)
                    seen_products.add(product_href)
                    
                    # Construir URL completa del producto
                    product_url = f"https://www.tcgplayer.com{product_href}" if product_href.startswith('/') else product_href
                    
                    # Construir URL de la imagen (formato descubierto con MCP)
                    image_url = f"https://tcgplayer-cdn.tcgplayer.com/product/{product_id}_in_200x200.jpg"
                    
                    # Extraer información del texto de la tarjeta
                    card_text = card.inner_text().strip()
                    
                    # También obtener el texto del título/heading para capturar mejor las variantes
                    title_element = card.query_selector('h4, h3, .product-card__title, [class*="title"]')
                    title_text = title_element.inner_text().strip() if title_element else ""
                    
                    # Buscar imagen dentro de la tarjeta para verificar y obtener alt
                    img_element = card.query_selector('img')
                    img_alt = None
                    if img_element:
                        img_src = img_element.get_attribute('src')
                        if img_src and 'tcgplayer-cdn' in img_src:
                            image_url = img_src
                        img_alt = img_element.get_attribute('alt') or img_element.get_attribute('title') or ""
                    
                    # Extraer precio de mercado
                    price_element = card.query_selector('.product-card__market-price--value')
                    market_price = None
                    if price_element:
                        price_text = price_element.inner_text().strip()
                        price_match = re.search(r'\$?(\d+\.?\d*)', price_text.replace(',', ''))
                        if price_match:
                            try:
                                market_price = float(price_match.group(1))
                            except ValueError:
                                pass
                    
                    # Extraer información del texto completo
                    # Formato típico: "Set Name\nRarity,\n#OP06-118\nCard Name\n..."
                    lines = [line.strip() for line in card_text.split('\n') if line.strip()]
                    
                    card_name = query_text  # Por defecto
                    set_name = None
                    rarity = None
                    card_number = None
                    product_line = None
                    
                    # Detectar el juego/product line desde la URL
                    if 'one-piece' in product_href.lower():
                        product_line = "One Piece Card Game"
                    elif 'magic' in product_href.lower() or 'mtg' in product_href.lower():
                        product_line = "Magic: The Gathering"
                    elif 'yugioh' in product_href.lower() or 'yugioh' in product_href.lower():
                        product_line = "Yu-Gi-Oh!"
                    elif 'pokemon' in product_href.lower():
                        product_line = "Pokémon"
                    elif 'universus' in product_href.lower():
                        product_line = "UniVersus"
                    elif 'weiss-schwarz' in product_href.lower() or 'weiss schwarz' in product_href.lower():
                        product_line = "Weiß Schwarz"
                    # Agregar más juegos según sea necesario
                    
                    # Extraer el nombre del set desde el heading de la tarjeta (h4)
                    # El heading contiene el nombre completo del set (ej: "Romance Dawn")
                    heading_element = card.query_selector('h4')
                    if heading_element:
                        set_name = heading_element.inner_text().strip()
                        logger.debug(f"Set name extraído del heading: {set_name}")
                    
                    # Si no encontramos el heading, intentar extraerlo de la primera línea del texto
                    if not set_name and len(lines) > 0:
                        # La primera línea suele ser el nombre del set
                        potential_set = lines[0]
                        # Verificar que no sea un número de carta, rareza, o nombre de carta
                        if (not potential_set.startswith('#') and 
                            potential_set not in rarity_keywords and
                            len(potential_set) > 2 and
                            not re.match(r'^[A-Z]{2}\d{2}-\d{3}', potential_set)):
                            set_name = potential_set
                    
                    # Buscar número de carta (formato: #OP06-118, #ST02-009, etc.)
                    card_num_match = re.search(r'#([A-Z]{2}\d{2}-\d{3})', card_text)
                    if not card_num_match:
                        # Intentar otros formatos de número de carta
                        card_num_match = re.search(r'#([A-Z0-9/-]+)', card_text)
                    
                    if card_num_match:
                        card_number = card_num_match.group(1)
                        # Si no encontramos el set_name del heading, usar el número de carta como fallback
                        if not set_name and '-' in card_number:
                            set_name = card_number.split('-')[0]
                    
                    # Buscar rareza (Common, Rare, Super Rare, Secret Rare, etc.)
                    rarity_keywords = ['Common', 'Rare', 'Super Rare', 'Secret Rare', 'Uncommon', 'Leader', 'Promo', 'P', 'C', 'U']
                    for keyword in rarity_keywords:
                        if keyword in card_text:
                            rarity = keyword
                            break
                    
                    # Extraer card_type (Leader, Character, Event, Stage)
                    card_type = None
                    card_type_keywords = ['Leader', 'Character', 'Event', 'Stage']
                    for keyword in card_type_keywords:
                        if keyword in card_text:
                            card_type = keyword
                            break
                    
                    # Extraer color (RED, BLUE, GREEN, PURPLE, YELLOW, BLACK)
                    # Los colores pueden aparecer en el texto o en la URL
                    color = None
                    color_keywords = ['RED', 'BLUE', 'GREEN', 'PURPLE', 'YELLOW', 'BLACK']
                    # Buscar en el texto de la tarjeta
                    for keyword in color_keywords:
                        if keyword in card_text.upper():
                            color = keyword
                            break
                    # Si no encontramos en el texto, buscar en la URL
                    if not color:
                        for keyword in color_keywords:
                            if keyword.lower() in product_href.lower():
                                color = keyword
                                break
                    
                    # Intentar extraer nombre de la carta con todas sus variantes
                    # Lista completa de variantes posibles
                    variant_keywords = [
                        '(Parallel)', '(Alternate Art)', '(Manga)', '(Gold)', 
                        '(Full Art)', '(Reprint)', '(Jolly Roger Foil)',
                        'Parallel', 'Alternate Art', 'Manga', 'Gold', 
                        'Full Art', 'Reprint', 'Jolly Roger Foil'
                    ]
                    
                    # Primero intentar desde el alt de la imagen (más confiable para variantes)
                    if img_alt and query_text.lower() in img_alt.lower():
                        card_name = img_alt.strip()
                    # Luego intentar desde el título si está disponible
                    elif title_text:
                        # El título suele tener el formato completo: "Trafalgar Law (047) (Parallel)"
                        title_lines = [line.strip() for line in title_text.split('\n') if line.strip()]
                        for line in title_lines:
                            if query_text.lower() in line.lower() or (card_number and card_number in line):
                                card_name = line
                                break
                    
                    # Si no encontramos en el título/alt, buscar en el texto completo
                    # El texto completo puede tener el formato: "Romance DawnSuper Rare, #OP01-047Trafalgar Law (047) (Parallel)"
                    if card_name == query_text:
                        # Buscar en el texto completo líneas que contengan el query_text y variantes
                        # Primero buscar líneas que contengan el query_text
                        for i, line in enumerate(lines):
                            if query_text.lower() in line.lower():
                                # Esta línea contiene el nombre, verificar si tiene variantes
                                if any(variant in line for variant in variant_keywords):
                                    card_name = line
                                    break
                                # Si no tiene variantes en esta línea, buscar en las siguientes
                                else:
                                    card_name = line
                                    # Verificar líneas siguientes para variantes
                                    for j in range(i + 1, min(i + 4, len(lines))):
                                        next_line = lines[j]
                                        if any(variant in next_line for variant in variant_keywords):
                                            card_name = f"{line} {next_line}"
                                            break
                                    if card_name != query_text:
                                        break
                        
                        # Si aún no encontramos, buscar líneas después del número de carta
                        if card_name == query_text:
                            for i, line in enumerate(lines):
                                # Si encontramos el número de carta, el nombre suele estar después
                                if card_number and card_number in line:
                                    if i + 1 < len(lines):
                                        potential_name = lines[i + 1]
                                        if potential_name and len(potential_name) > 2 and potential_name not in rarity_keywords:
                                            card_name = potential_name
                                            # Verificar si hay líneas siguientes con variantes
                                            for j in range(i + 2, min(i + 4, len(lines))):
                                                next_line = lines[j]
                                                if any(variant in next_line for variant in variant_keywords):
                                                    card_name = f"{potential_name} {next_line}"
                                                    break
                                            break
                    
                    # Incluir solo productos de One Piece Card Game
                    # Verificar que sea realmente de One Piece
                    if 'one-piece' in product_href.lower() or product_line == "One Piece Card Game":
                        suggestions.append(Search_suggestion(
                            text=card_text[:100],  # Primeros 100 caracteres
                            card_name=card_name,
                            set_name=set_name,
                            product_line="One Piece Card Game",
                            image_url=image_url,
                            product_url=product_url,
                            market_price=market_price,
                            rarity=rarity,
                            card_number=card_number,
                            card_type=card_type,
                            color=color
                        ))
                except Exception as e:
                    logger.warning(f"Error procesando tarjeta de producto: {e}")
                    continue
            
            context.close()
        finally:
            browser.close()
    
    # Limitar resultados al tamaño de página solicitado
    paginated_results = suggestions[:page_size]
    
    # Intentar obtener el total de resultados desde TCGplayer
    # Si extrajimos el total desde el heading de la página, usarlo
    if total_results_from_page is not None:
        total_results_estimated = total_results_from_page
    elif page == 1 and len(suggestions) > 0:
        # Si encontramos 18-24 resultados, probablemente hay más páginas
        # Estimamos conservadoramente que hay al menos 2-3 veces más resultados
        if len(suggestions) >= 18:
            total_results_estimated = len(suggestions) * 3  # Estimación conservadora
        else:
            total_results_estimated = len(suggestions)
    elif page > 1:
        # Para páginas siguientes, estimamos basándonos en la página actual
        total_results_estimated = (page - 1) * page_size + len(suggestions)
    else:
        total_results_estimated = len(suggestions)
    
    # Calcular total de páginas estimado
    total_pages = math.ceil(total_results_estimated / page_size) if total_results_estimated > 0 else 0
    
    # Determinar si hay más páginas disponibles
    # Si encontramos menos resultados que el page_size, probablemente es la última página
    has_next_page = len(suggestions) >= page_size
    has_previous_page = page > 1
    
    logger.info(f"Página {page}: Devolviendo {len(paginated_results)} resultados de {len(suggestions)} encontrados (estimado total: {total_results_estimated})")
    
    return Search_results_response(
        results=paginated_results,
        total_results=total_results_estimated,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
        has_next_page=has_next_page,
        has_previous_page=has_previous_page
    )


async def get_search_suggestions(query_text: str, page: int = 1, page_size: int = 24) -> Search_results_response:
    """Wrapper asíncrono para obtener sugerencias con paginación."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(_executor, get_search_suggestions_sync, query_text, page, page_size)


@app.get("/api/suggestions", response_model=Search_results_response)
async def get_suggestions(q: str = "", page: int = 1, page_size: int = 24) -> Any:
    """
    Endpoint para obtener sugerencias de búsqueda de TCGplayer con paginación.
    Siempre devuelve la misma cantidad de resultados por página (page_size).
    """
    if not q or len(q.strip()) < 2:
        return Search_results_response(
            results=[],
            total_results=0,
            page=page,
            page_size=page_size,
            total_pages=0,
            has_next_page=False,
            has_previous_page=False
        )
    
    # Validar parámetros de paginación
    page = max(1, page)
    page_size = max(1, min(50, page_size))  # Limitar entre 1 y 50 resultados por página
    
    try:
        return await get_search_suggestions(q.strip(), page, page_size)
    except Exception as exc:
        logger = logging.getLogger(__name__)
        logger.error(f"Error obteniendo sugerencias: {exc}")
        return Search_results_response(
            results=[],
            total_results=0,
            page=page,
            page_size=page_size,
            total_pages=0,
            has_next_page=False,
            has_previous_page=False
        )


@app.post("/api/price", response_model=Card_price)
async def get_card_price(payload: Card_query) -> Any:
    """
    Comentario: endpoint principal para que el frontend consulte el precio de una carta.
    Maneja los errores para no exponer detalles internos de scraping al cliente.
    """
    try:
        return await fetch_card_price_from_tcgplayer(payload)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=502,
            detail="Error al comunicarse con TCGplayer o al procesar la respuesta.",
        ) from exc
