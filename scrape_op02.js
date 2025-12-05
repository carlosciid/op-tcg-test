// Script completo para extraer todas las cartas del set OP02 (Paramount War) de TCGPlayer
// Este script debe ejecutarse con Playwright en Node.js
// npm install playwright
// node scrape_op02.js

const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();
    
    const allCards = [];
    const baseUrl = 'https://www.tcgplayer.com';
    const maxPages = 10; // Empezamos con 10, se ajustará según sea necesario
    
    // Función para extraer cartas de la página actual
    async function extractPageCards() {
        return await page.evaluate(() => {
            const cardData = [];
            const seen = new Set();
            
            document.querySelectorAll('a[href*="/product/"]').forEach(link => {
                const url = link.href;
                if (seen.has(url)) return;
                seen.add(url);
                
                const fullText = link.textContent || '';
                const numberMatch = fullText.match(/#OP02-(\d+)/);
                if (!numberMatch) return;
                
                const cardNumber = numberMatch[1];
                const img = link.querySelector('img');
                const imageUrl = img ? img.src : '';
                
                const heading = link.querySelector('h4');
                let name = '';
                
                if (heading) {
                    const allDivs = Array.from(link.querySelectorAll('div'));
                    let foundRarity = false;
                    
                    for (const div of allDivs) {
                        const text = div.textContent.trim();
                        
                        if (text.match(/^(Rare|Common|Uncommon|Super Rare|Secret Rare|Leader|DON!!),?$/i)) {
                            foundRarity = true;
                            continue;
                        }
                        
                        if (foundRarity && text && 
                            text !== 'Paramount War' &&
                            !text.startsWith('#OP02-') &&
                            !text.includes('Out of Stock') &&
                            !text.includes('Market Price') &&
                            !text.includes('listing from') &&
                            text.length > 1 &&
                            text.length < 100 &&
                            !/^[\d$.,\s-]+$/.test(text) &&
                            !text.match(/^\d+$/)) {
                            name = text;
                            break;
                        }
                    }
                }
                
                if (!name) {
                    const imgAlt = img ? img.alt : '';
                    if (imgAlt && imgAlt !== 'Paramount War') {
                        name = imgAlt;
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
    
    // Función para obtener el color de una carta
    async function getCardColor(cardUrl) {
        try {
            await page.goto(cardUrl, { waitUntil: 'networkidle', timeout: 15000 });
            await page.waitForTimeout(1000);
            
            const color = await page.evaluate(() => {
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
            console.error(`Error obteniendo color para ${cardUrl}:`, error.message);
            return 'Unknown';
        }
    }
    
    console.log('Iniciando extracción de cartas del set OP02 (Paramount War)...');
    
    // Extraer cartas de todas las páginas
    let hasMorePages = true;
    let pageNum = 1;
    
    while (hasMorePages && pageNum <= maxPages) {
        const url = `${baseUrl}/search/one-piece-card-game/paramount-war?productLineName=one-piece-card-game&page=${pageNum}&view=grid&setName=paramount-war&ProductTypeName=Cards`;
        console.log(`Navegando a la página ${pageNum}...`);
        await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
        await page.waitForTimeout(2000);
        
        await page.waitForSelector('a[href*="/product/"]', { timeout: 10000 });
        const pageCards = await extractPageCards();
        
        if (pageCards.length === 0) {
            hasMorePages = false;
        } else {
            allCards.push(...pageCards);
            console.log(`Página ${pageNum}: ${pageCards.length} cartas. Total: ${allCards.length}`);
            
            // Verificar si hay página siguiente
            const nextButton = await page.$('a[aria-label="Next page"]:not([disabled])');
            if (!nextButton) {
                hasMorePages = false;
            } else {
                pageNum++;
            }
        }
    }
    
    console.log(`\nTotal de cartas extraídas: ${allCards.length}`);
    console.log('Obteniendo colores de las cartas (esto tomará varios minutos)...\n');
    
    // Obtener el color de cada carta
    for (let i = 0; i < allCards.length; i++) {
        const card = allCards[i];
        console.log(`[${i + 1}/${allCards.length}] Obteniendo color para: ${card.name}`);
        card.color = await getCardColor(card.url);
        console.log(`  Color: ${card.color}`);
        await page.waitForTimeout(500); // Pausa para no sobrecargar el servidor
    }
    
    // Mapeo de colores al español
    const colorMap = {
        'Red': 'Rojo',
        'Blue': 'Azul',
        'Green': 'Verde',
        'Yellow': 'Amarillo',
        'Purple': 'Morado',
        'Black': 'Negro'
    };
    
    // Formatear los datos
    const formattedCards = allCards.map(card => {
        const color = colorMap[card.color] || card.color;
        const formattedNumber = card.number.padStart(3, '0');
        const escapedName = card.name.replace(/'/g, "\\'");
        
        return {
            set: 'OP02',
            number: formattedNumber,
            color: color,
            name: escapedName,
            image_url: card.imageUrl,
            tcgplayer_url: card.url
        };
    });
    
    // Ordenar por número
    formattedCards.sort((a, b) => parseInt(a.number) - parseInt(b.number));
    
    // Generar el contenido del archivo
    const fileContent = `export const op02Data = [\n${formattedCards.map(card => `    { \n        set: '${card.set}', \n        number: '${card.number}', \n        color: '${card.color}', \n        name: '${card.name}', \n        image_url: '${card.image_url}', \n        tcgplayer_url: '${card.tcgplayer_url}'\n    }`).join(',\n')}\n];\n`;
    
    // Guardar en archivo
    const fs = require('fs');
    fs.writeFileSync('op02.js', fileContent, 'utf8');
    
    console.log('\n¡Extracción completada!');
    console.log(`Archivo op02.js generado con ${formattedCards.length} cartas.`);
    
    await browser.close();
})();

