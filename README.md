# One Piece TCG - Market Price Checker

Aplicación web para consultar precios de mercado de cartas de One Piece TCG desde TCGplayer. La aplicación utiliza Angular para el frontend y FastAPI con Playwright para el backend, permitiendo buscar cartas y obtener sus precios de mercado con paginación.

## 🚀 Características

- **Búsqueda de cartas**: Busca cartas de One Piece TCG por nombre
- **Resultados paginados**: Muestra resultados con paginación (24 por página)
- **Filtros avanzados**: Filtra por rareza, set y rango de precios
- **Información detallada**: Muestra imágenes, precios de mercado, números de carta y rareza
- **Interfaz moderna**: UI responsive con diseño oscuro

## 📋 Requisitos Previos

### Backend
- Python 3.12 (recomendado) o Python 3.11+
- pip (gestor de paquetes de Python)

### Frontend
- Node.js 18+ y npm
- Angular CLI 18+

## 🛠️ Instalación

### 1. Clonar el repositorio

```bash
git clone <url-del-repositorio>
cd "op tcg"
```

### 2. Configurar el Backend

1. Navega a la carpeta del backend:
```bash
cd backend
```

2. Crea un entorno virtual con Python 3.12:
```powershell
# En Windows PowerShell
python -m venv venv312
```

3. Activa el entorno virtual:
```powershell
# En Windows PowerShell
.\venv312\Scripts\Activate.ps1
```

Si tienes problemas con la ejecución de scripts en PowerShell, ejecuta primero:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

4. Instala las dependencias:
```bash
pip install -r requirements.txt
```

5. Instala los navegadores de Playwright:
```bash
playwright install chromium
```

### 3. Configurar el Frontend

1. Navega a la carpeta del frontend:
```bash
cd ../frontend/op-tcg-frontend
```

2. Instala las dependencias:
```bash
npm install
```

## ▶️ Ejecución

### Opción 1: Ejecutar manualmente

#### Backend (Terminal 1)

1. Activa el entorno virtual:
```powershell
cd backend
.\venv312\Scripts\Activate.ps1
```

2. Ejecuta el servidor:
```bash
uvicorn main:app --host 127.0.0.1 --port 8001 --reload
```

El backend estará disponible en: `http://127.0.0.1:8001`

#### Frontend (Terminal 2)

1. Navega a la carpeta del frontend:
```bash
cd frontend/op-tcg-frontend
```

2. Ejecuta el servidor de desarrollo:
```bash
npm start
# o
ng serve
```

El frontend estará disponible en: `http://localhost:4200`

### Opción 2: Usar scripts de PowerShell (Windows)

#### Backend

Ejecuta el script proporcionado:
```powershell
cd backend
.\start_server.ps1
```

## 📖 Uso

1. Abre tu navegador y ve a `http://localhost:4200`
2. En el campo de búsqueda, ingresa el nombre de la carta (ej: "zoro", "luffy")
3. Haz clic en "Buscar" para ver los resultados
4. Usa los filtros para refinar los resultados:
   - **Rareza**: Filtra por tipo de rareza (Common, Rare, Super Rare, etc.)
   - **Set**: Filtra por set específico (OP01, OP02, etc.)
   - **Precio mínimo/máximo**: Filtra por rango de precios
5. Navega entre páginas usando los controles de paginación
6. Haz clic en "Seleccionar esta carta" para usar una carta en el formulario de precio

## 🏗️ Estructura del Proyecto

```
op tcg/
├── backend/
│   ├── main.py              # API FastAPI principal
│   ├── requirements.txt     # Dependencias de Python
│   ├── start_server.ps1     # Script para iniciar el servidor
│   └── venv312/            # Entorno virtual de Python
│
└── frontend/
    └── op-tcg-frontend/
        ├── src/
        │   └── app/
        │       ├── app.component.ts      # Componente principal
        │       ├── app.component.html    # Template HTML
        │       ├── app.component.css     # Estilos CSS
        │       └── card-price.service.ts # Servicio HTTP
        ├── package.json                  # Dependencias de Node.js
        └── angular.json                 # Configuración de Angular
```

## 🔧 Configuración

### Backend

El backend está configurado para ejecutarse en `http://127.0.0.1:8001` por defecto. Puedes cambiar el puerto modificando el comando de uvicorn:

```bash
uvicorn main:app --host 127.0.0.1 --port <PUERTO> --reload
```

### Frontend

El frontend está configurado para conectarse al backend en `http://127.0.0.1:8001`. Si cambias el puerto del backend, actualiza la URL en:

`frontend/op-tcg-frontend/src/app/card-price.service.ts`

```typescript
private readonly api_base_url = 'http://127.0.0.1:8001';
```

## 🐛 Solución de Problemas

### Error: "NotImplementedError" con Playwright

Si encuentras errores relacionados con asyncio y Playwright en Windows, asegúrate de usar Python 3.12. El código ya está configurado para usar la API síncrona de Playwright en un ThreadPoolExecutor.

### Error: "Cannot find module 'playwright'"

Asegúrate de haber instalado Playwright correctamente:
```bash
pip install playwright
playwright install chromium
```

### Error: CORS en el navegador

El backend ya tiene configurado CORS para permitir todas las solicitudes desde el frontend. Si encuentras problemas, verifica que el backend esté corriendo en el puerto correcto.

### El frontend no se conecta al backend

1. Verifica que el backend esté corriendo en `http://127.0.0.1:8001`
2. Verifica que la URL en `card-price.service.ts` sea correcta
3. Revisa la consola del navegador para ver errores específicos

## 📝 API Endpoints

### GET `/api/suggestions`
Obtiene sugerencias de búsqueda con paginación.

**Parámetros:**
- `q` (string): Término de búsqueda (mínimo 2 caracteres)
- `page` (int, opcional): Número de página (default: 1)
- `page_size` (int, opcional): Resultados por página (default: 24, máximo: 50)

**Ejemplo:**
```
GET /api/suggestions?q=zoro&page=1&page_size=24
```

### POST `/api/price`
Obtiene el precio de mercado de una carta específica.

**Body:**
```json
{
  "card_name": "Roronoa Zoro",
  "set_name": "OP01",
  "is_foil": false
}
```

## 🛡️ Tecnologías Utilizadas

- **Backend:**
  - FastAPI
  - Playwright (para web scraping)
  - Python 3.12
  - Uvicorn

- **Frontend:**
  - Angular 18
  - TypeScript
  - RxJS
  - Angular Signals

## 📄 Licencia

Este proyecto es de código abierto y está disponible para uso personal y educativo.

## 🤝 Contribuciones

Las contribuciones son bienvenidas. Por favor, abre un issue o pull request para cualquier mejora.

## 📧 Contacto

Para preguntas o soporte, abre un issue en el repositorio.

---

**Nota:** Esta aplicación utiliza web scraping para obtener información de TCGplayer. Asegúrate de cumplir con los términos de servicio de TCGplayer al usar esta aplicación.

