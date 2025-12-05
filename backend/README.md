# One Piece TCG Market Price API

API backend para consultar precios de cartas de One Piece TCG desde TCGplayer usando Playwright.

## Requisitos

- Python 3.12 (compatible con Playwright)
- Windows PowerShell

## Instalación

1. Crear entorno virtual con Python 3.12:
```powershell
py -3.12 -m venv venv312
```

2. Activar el entorno virtual:
```powershell
venv312\Scripts\Activate.ps1
```

3. Instalar dependencias:
```powershell
pip install -r requirements.txt
```

4. Instalar navegador Chromium para Playwright:
```powershell
playwright install chromium
```

## Uso

### Opción 1: Usar el script de inicio (recomendado)
```powershell
.\start_server.ps1
```

### Opción 2: Iniciar manualmente
```powershell
venv312\Scripts\Activate.ps1
uvicorn main:app --reload --host 127.0.0.1 --port 8001
```

El servidor estará disponible en `http://127.0.0.1:8001`

## Endpoints

### POST /api/price

Consulta el precio de mercado de una carta de One Piece TCG.

**Request Body:**
```json
{
  "card_name": "Monkey.D.Luffy",
  "set_name": "Romance Dawn",
  "is_foil": false
}
```

**Response:**
```json
{
  "card_name": "Monkey.D.Luffy",
  "set_name": "Romance Dawn",
  "is_foil": false,
  "market_price": 12.50,
  "currency": "USD",
  "source_url": "https://www.tcgplayer.com/search/..."
}
```

## Notas

- Este backend usa Playwright para renderizar JavaScript en TCGplayer, por lo que requiere Python 3.12 o inferior.
- El scraping puede tomar varios segundos ya que debe esperar a que la página cargue completamente.

