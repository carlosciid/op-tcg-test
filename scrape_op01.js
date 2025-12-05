// Script para extraer todas las cartas del set OP01 (Romance Dawn) de TCGPlayer
// Este script debe ejecutarse en el contexto del navegador Playwright

async function scrapeAllCards() {
    const allCards = [];
    let currentPage = 1;
    let hasMorePages = true;
    const baseUrl = 'https://www.tcgplayer.com';
    
    // Función para extraer cartas de la página actual
    async function extractCardsFromCurrentPage() {
        return await page.evaluate(() => {
            const cardData = [];
            const seen = new Set();
            
            // Buscar todos los enlaces de productos
            document.querySelectorAll('a[href*="/product/"]').forEach(link => {
                const url = link.href;
                if (seen.has(url)) return;
                seen.add(url);
                
                const fullText = link.textContent || '';
                
                // Buscar número OP01
                const numberMatch = fullText.match(/#OP01-(\d+)/);
                if (!numberMatch) return;
                
                const cardNumber = numberMatch[1];
                
                // Buscar imagen
                const img = link.querySelector('img');
                const imageUrl = img ? img.src : '';
                
                // Extraer nombre - buscar el texto que está entre el set name y el número
                const divs = Array.from(link.querySelectorAll('div'));
                let name = '';
                
                for (const div of divs) {
                    const text = div.textContent.trim();
                    // Filtrar textos que no son el nombre
                    if (text && 
                        text !== 'Romance Dawn' &&
                        !text.startsWith('#OP01-') &&
                        !text.includes('Out of Stock') &&
                        !text.includes('Market Price') &&
                        !text.includes('listing from') &&
                        !text.match(/^(Rare|Common|Uncommon|Super Rare|Secret Rare|Leader|DON!!),?$/i) &&
                        text.length > 1 &&
                        text.length < 80) {
                        // Verificar que no sea solo precio o número
                        if (!/^[\d$.,\s-]+$/.test(text) && !text.match(/^\d+$/)) {
                            name = text;
                            break;
                        }
                    }
                }
                
                if (name && cardNumber) {
                    cardData.push({
                        number: cardNumber,
                        name: name,
                        imageUrl: imageUrl,
                        url: url
                    });
                }
            });
            
            return cardData;
        });
    }
    
    // Función para obtener el color de una carta visitando su página
    async function getCardColor(cardUrl) {
        try {
            await page.goto(cardUrl, { waitUntil: 'networkidle', timeout: 10000 });
            await page.waitForTimeout(1000);
            
            const color = await page.evaluate(() => {
                // Buscar el elemento que contiene "Color:"
                const listItems = Array.from(document.querySelectorAll('li'));
                for (const li of listItems) {
                    const text = li.textContent || '';
                    if (text.includes('Color:')) {
                        const colorText = text.replace('Color:', '').trim();
                        return colorText;
                    }
                }
                return null;
            });
            
            return color || 'Unknown';
        } catch (error) {
            console.error(`Error obteniendo color para ${cardUrl}:`, error);
            return 'Unknown';
        }
    }
    
    console.log('Iniciando extracción de cartas...');
    
    // Extraer cartas de todas las páginas
    while (hasMorePages) {
        console.log(`Procesando página ${currentPage}...`);
        
        await page.waitForSelector('a[href*="/product/"]', { timeout: 10000 });
        
        const pageCards = await extractCardsFromCurrentPage();
        console.log(`Encontradas ${pageCards.length} cartas en la página ${currentPage}`);
        
        allCards.push(...pageCards);
        
        // Intentar ir a la siguiente página
        const nextButton = await page.$('a[aria-label="Next page"]:not([disabled])');
        if (nextButton) {
            await nextButton.click();
            await page.waitForTimeout(2000);
            currentPage++;
        } else {
            hasMorePages = false;
        }
    }
    
    console.log(`Total de cartas encontradas: ${allCards.length}`);
    console.log('Obteniendo colores de las cartas...');
    
    // Obtener el color de cada carta
    for (let i = 0; i < allCards.length; i++) {
        const card = allCards[i];
        console.log(`Obteniendo color para carta ${i + 1}/${allCards.length}: ${card.name}`);
        card.color = await getCardColor(card.url);
        // Pequeña pausa para no sobrecargar el servidor
        await page.waitForTimeout(500);
    }
    
    return allCards;
}

// Ejecutar el scraping
const cards = await scrapeAllCards();

// Formatear los datos según el formato requerido
const formattedCards = cards.map(card => {
    // Convertir el color al formato español si es necesario
    const colorMap = {
        'Red': 'Rojo',
        'Blue': 'Azul',
        'Green': 'Verde',
        'Yellow': 'Amarillo',
        'Purple': 'Morado',
        'Black': 'Negro'
    };
    
    const color = colorMap[card.color] || card.color;
    
    // Formatear el número (agregar ceros a la izquierda si es necesario)
    const formattedNumber = card.number.padStart(3, '0');
    
    return {
        set: 'OP01',
        number: formattedNumber,
        color: color,
        name: card.name,
        image_url: card.imageUrl,
        tcgplayer_url: card.url
    };
});

// Ordenar por número
formattedCards.sort((a, b) => parseInt(a.number) - parseInt(b.number));

// Generar el contenido del archivo
const fileContent = `export const op01Data = [\n${formattedCards.map(card => `    { \n        set: '${card.set}', \n        number: '${card.number}', \n        color: '${card.color}', \n        name: '${card.name.replace(/'/g, "\\'")}', \n        image_url: '${card.image_url}', \n        tcgplayer_url: '${card.tcgplayer_url}'\n    }`).join(',\n')}\n];\n`;

console.log('Datos extraídos exitosamente!');
fileContent;

