# Navegación TCGplayer - Detalles para Scraping

## Búsqueda de Carta: Monkey.D.Luffy (OP05-119)

### 1. URL de Búsqueda
```
https://www.tcgplayer.com/search/all/product?q=Monkey.D.Luffy+OP05-119&view=grid
```

### 2. Estructura HTML del Precio de Mercado

En la vista de **grid** (resultados de búsqueda), cada tarjeta de producto tiene esta estructura:

```html
<a href="/product/594325/..." class="product-card">
  <section class="product-card__product">
    <!-- Imagen, título, set, etc. -->
    <section class="product-card__market-price">
      <section>
        <span>Market Price:</span>
        <span class="product-card__market-price--value" tabindex="-1">$3.78</span>
      </section>
    </section>
  </section>
</a>
```

### 3. Selector CSS Exacto para el Precio

**Selector principal (más confiable):**
```css
.product-card__market-price--value
```

**Selector completo con contexto:**
```css
section.product-card__market-price span.product-card__market-price--value
```

### 4. Extracción del Valor

1. **Texto completo del elemento:** `"$3.78"`
2. **Limpieza:** Remover `$` y comas, luego extraer número con regex `(\d+\.?\d*)`
3. **Resultado:** `3.78` (float)

### 5. Notas Importantes

- El precio aparece **directamente en la vista de grid**, no es necesario navegar a la página de detalle
- Hay múltiples variantes de la misma carta (Reprint, Manga, Alternate Art) - todas muestran el precio con el mismo selector
- El selector `.product-card__market-price--value` es específico y confiable
- El formato siempre es `$XX.XX` o `$X,XXX.XX` para precios mayores

### 6. Flujo de Extracción Recomendado

1. Navegar a la URL de búsqueda con `productName` codificado
2. Esperar a que la página cargue completamente (`wait_until="networkidle"`)
3. Buscar el primer elemento con selector `.product-card__market-price--value`
4. Extraer el texto (`inner_text()`)
5. Limpiar y convertir a float

