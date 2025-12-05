// Script mejorado para extraer todas las cartas con información completa
// Incluye: Product Details, precios, imágenes descargadas, colores en español
// Este script debe ejecutarse con Playwright en Node.js
// npm install playwright
// node scrape_improved.js

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

(async () => {
    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();
    
    const allCards = [];
    const baseUrl = 'https://www.tcgplayer.com';
    
    // Crear directorio para imágenes si no existe
    const imagesDir = path.join(__dirname, 'images', 'op01');
    if (!fs.existsSync(imagesDir)) {
        fs.mkdirSync(imagesDir, { recursive: true });
    }
    
    // Mapa para rastrear versiones de cada carta (número base -> contador de versiones)
    const cardVersions = new Map();
    
    // Función para descargar imagen
    async function downloadImage(imageUrl, filePath) {
        return new Promise((resolve, reject) => {
            const protocol = imageUrl.startsWith('https') ? https : http;
            const file = fs.createWriteStream(filePath);
            
            protocol.get(imageUrl, (response) => {
                if (response.statusCode === 200) {
                    response.pipe(file);
                    file.on('finish', () => {
                        file.close();
                        resolve(filePath);
                    });
                } else {
                    file.close();
                    fs.unlinkSync(filePath);
                    reject(new Error(`Failed to download: ${response.statusCode}`));
                }
            }).on('error', (err) => {
                file.close();
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
                reject(err);
            });
        });
    }
    
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
                const numberMatch = fullText.match(/#OP01-(\d+)/);
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
                            text !== 'Romance Dawn' &&
                            !text.startsWith('#OP01-') &&
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
                    if (imgAlt && imgAlt !== 'Romance Dawn') {
                        name = imgAlt;
                    }
                }
                
                if (name && cardNumber) {
                    // Detectar si es una versión alternativa
                    const isAlternate = /parallel|alternate|manga|box topper|promo|special/i.test(name) || 
                                       /parallel|alternate|manga|box topper|promo|special/i.test(fullText);
                    
                    cardData.push({
                        number: cardNumber,
                        name: name,
                        imageUrl: imageUrl,
                        url: url,
                        isAlternate: isAlternate
                    });
                }
            });
            
            return cardData;
        });
    }
    
    // Función para obtener toda la información de una carta
    async function getCardFullInfo(cardUrl, cardNumber, cardName) {
        try {
            await page.goto(cardUrl, { waitUntil: 'networkidle', timeout: 15000 });
            await page.waitForTimeout(1500);
            
            const cardInfo = await page.evaluate((cardName) => {
                const info = {
                    color: null,
                    rarity: null,
                    cardType: null,
                    cost: null,
                    power: null,
                    subtypes: null,
                    attribute: null,
                    artist: null,
                    abilities: [],
                    marketPrice: null,
                    mostRecentSale: null,
                    imageUrl: null,
                    isAlternate: false,
                    versionType: null
                };
                
                // Detectar tipo de versión alternativa del nombre de la carta
                const nameLower = (cardName || '').toLowerCase();
                if (nameLower.includes('parallel')) {
                    info.isAlternate = true;
                    info.versionType = 'Parallel';
                } else if (nameLower.includes('alternate art') || nameLower.includes('alternate')) {
                    info.isAlternate = true;
                    info.versionType = 'Alternate Art';
                } else if (nameLower.includes('manga')) {
                    info.isAlternate = true;
                    info.versionType = 'Manga';
                } else if (nameLower.includes('box topper')) {
                    info.isAlternate = true;
                    info.versionType = 'Box Topper';
                } else if (nameLower.includes('promo')) {
                    info.isAlternate = true;
                    info.versionType = 'Promo';
                }
                
                // Buscar Product Details
                const listItems = Array.from(document.querySelectorAll('li'));
                for (const li of listItems) {
                    const text = li.textContent || '';
                    const strong = li.querySelector('strong');
                    
                    if (strong) {
                        const label = strong.textContent.trim();
                        const value = text.replace(label, '').trim();
                        
                        if (label.includes('Color:')) {
                            info.color = value;
                        } else if (label.includes('Rarity:')) {
                            info.rarity = value;
                        } else if (label.includes('Card Type:')) {
                            info.cardType = value;
                        } else if (label.includes('Cost:')) {
                            info.cost = value;
                        } else if (label.includes('Power:')) {
                            info.power = value;
                        } else if (label.includes('Subtype(s):')) {
                            info.subtypes = value;
                        } else if (label.includes('Attribute:')) {
                            info.attribute = value;
                        } else if (label.includes('Artist:')) {
                            // El artista puede ser un enlace
                            const link = li.querySelector('a');
                            if (link) {
                                info.artist = link.textContent.trim() || value;
                            } else {
                                info.artist = value;
                            }
                        }
                    }
                }
                
                // Buscar habilidades (texto antes de la lista de detalles)
                const productDetailsHeading = Array.from(document.querySelectorAll('h2')).find(h2 => 
                    h2.textContent.includes('Product Details')
                );
                if (productDetailsHeading) {
                    let container = productDetailsHeading.parentElement;
                    if (!container) {
                        container = productDetailsHeading.nextElementSibling;
                    }
                    
                    if (container) {
                        const allElements = Array.from(container.querySelectorAll('*'));
                        let foundList = false;
                        
                        for (const el of allElements) {
                            if (el.tagName === 'UL' || el.tagName === 'OL') {
                                foundList = true;
                                break;
                            }
                            
                            if (!foundList) {
                                const text = el.textContent?.trim() || '';
                                if (text && text.length > 10 && 
                                    (text.startsWith('[') || text.match(/^\[.*?\]/))) {
                                    if (!text.includes('Rarity:') && 
                                        !text.includes('Number:') && 
                                        !text.includes('Color:') &&
                                        !text.includes('Card Type:') &&
                                        !text.includes('Cost:') &&
                                        !text.includes('Power:')) {
                                        // Separar habilidades por saltos de línea dobles
                                        const abilities = text.split(/\n\s*\n/).filter(a => a.trim().length > 0);
                                        abilities.forEach(ability => {
                                            const cleanAbility = ability.trim();
                                            if (cleanAbility.length > 0 && !info.abilities.includes(cleanAbility)) {
                                                info.abilities.push(cleanAbility);
                                            }
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
                
                // Buscar Market Price - buscar en tablas y elementos con texto específico
                const priceTables = Array.from(document.querySelectorAll('table'));
                for (const table of priceTables) {
                    const rows = Array.from(table.querySelectorAll('tr'));
                    for (const row of rows) {
                        const cells = Array.from(row.querySelectorAll('td, th'));
                        const rowText = row.textContent || '';
                        
                        if (rowText.includes('Market Price')) {
                            for (const cell of cells) {
                                const cellText = cell.textContent || '';
                                const priceMatch = cellText.match(/\$([\d.]+)/);
                                if (priceMatch) {
                                    info.marketPrice = priceMatch[1];
                                    break;
                                }
                            }
                        }
                        
                        if (rowText.includes('Most Recent Sale')) {
                            for (const cell of cells) {
                                const cellText = cell.textContent || '';
                                const saleMatch = cellText.match(/\$([\d.]+)/);
                                if (saleMatch) {
                                    info.mostRecentSale = saleMatch[1];
                                    break;
                                }
                            }
                        }
                    }
                }
                
                // Buscar imagen principal
                const mainImage = document.querySelector('img[alt*="OP01"], img[src*="product"]');
                if (mainImage) {
                    info.imageUrl = mainImage.src;
                }
                
                return info;
            }, cardName);
            
            // Determinar número de versión
            const baseNumber = cardNumber.padStart(3, '0');
            let versionNumber = 1;
            let finalNumber = baseNumber;
            
            if (cardInfo.isAlternate) {
                // Si es versión alternativa, incrementar el contador
                if (!cardVersions.has(baseNumber)) {
                    cardVersions.set(baseNumber, 1);
                    versionNumber = 2; // Primera versión alternativa es -2
                } else {
                    versionNumber = cardVersions.get(baseNumber) + 1;
                    cardVersions.set(baseNumber, versionNumber);
                }
                finalNumber = `${baseNumber}-${versionNumber}`;
            } else {
                // Versión base (primera vez que vemos esta carta)
                if (!cardVersions.has(baseNumber)) {
                    cardVersions.set(baseNumber, 0); // 0 significa que es la versión base
                }
            }
            
            // Descargar imagen con el nombre correcto
            if (cardInfo.imageUrl && !cardInfo.imageUrl.startsWith('data:')) {
                const imageFileName = `${finalNumber}.png`;
                const imagePath = path.join(imagesDir, imageFileName);
                const imageRelativePath = `images/op01/${imageFileName}`;
                
                try {
                    await downloadImage(cardInfo.imageUrl, imagePath);
                    cardInfo.imagePath = imageRelativePath;
                } catch (error) {
                    console.error(`  Error descargando imagen: ${error.message}`);
                    cardInfo.imagePath = cardInfo.imageUrl; // Usar URL original si falla
                }
            } else {
                cardInfo.imagePath = cardInfo.imageUrl || '';
            }
            
            // Guardar el número final en cardInfo
            cardInfo.finalNumber = finalNumber;
            
            return cardInfo;
        } catch (error) {
            console.error(`Error obteniendo información para ${cardUrl}:`, error.message);
            return {
                color: 'Unknown',
                rarity: null,
                cardType: null,
                cost: null,
                power: null,
                subtypes: null,
                attribute: null,
                artist: null,
                abilities: [],
                marketPrice: null,
                mostRecentSale: null,
                imagePath: ''
            };
        }
    }
    
    console.log('Iniciando extracción mejorada de cartas del set OP01 (Romance Dawn)...');
    console.log('Buscando todas las 156 cartas...\n');
    
    // Extraer cartas de todas las páginas usando la URL correcta
    let hasMorePages = true;
    let pageNum = 1;
    const maxPages = 10;
    
    while (hasMorePages && pageNum <= maxPages) {
        const url = `${baseUrl}/search/one-piece-card-game/romance-dawn?productLineName=one-piece-card-game&view=grid&page=${pageNum}&ProductTypeName=Cards&setName=romance-dawn`;
        console.log(`\n=== Navegando a la página ${pageNum} ===`);
        await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
        await page.waitForTimeout(2000);
        
        await page.waitForSelector('a[href*="/product/"]', { timeout: 10000 });
        const pageCards = await extractPageCards();
        
        if (pageCards.length === 0) {
            console.log(`No se encontraron más cartas en la página ${pageNum}. Finalizando...`);
            hasMorePages = false;
        } else {
            allCards.push(...pageCards);
            console.log(`Página ${pageNum}: ${pageCards.length} cartas. Total acumulado: ${allCards.length}`);
            
            // Verificar si hay página siguiente - intentar múltiples selectores
            let nextButton = await page.$('a[aria-label="Next page"]:not([disabled])');
            if (!nextButton) {
                // Intentar otro selector
                nextButton = await page.$('a[aria-label*="Next"]:not([disabled])');
            }
            if (!nextButton) {
                // Intentar buscar por texto
                nextButton = await page.$('a:has-text("Next"):not([disabled])');
            }
            
            // También verificar si hay números de página más altos
            const pageNumbers = await page.evaluate(() => {
                const links = Array.from(document.querySelectorAll('a'));
                const numbers = [];
                links.forEach(link => {
                    const text = link.textContent.trim();
                    if (/^\d+$/.test(text)) {
                        numbers.push(parseInt(text));
                    }
                });
                return numbers.length > 0 ? Math.max(...numbers) : 0;
            });
            
            if (!nextButton && pageNum >= pageNumbers) {
                console.log(`No hay más páginas. Total de cartas encontradas: ${allCards.length}`);
                hasMorePages = false;
            } else if (nextButton) {
                console.log(`Hay más páginas. Continuando a la página ${pageNum + 1}...`);
                pageNum++;
            } else if (pageNum < pageNumbers) {
                console.log(`Aún hay páginas disponibles (hasta ${pageNumbers}). Continuando a la página ${pageNum + 1}...`);
                pageNum++;
            } else {
                console.log(`No se encontró botón de siguiente página y ya estamos en la última. Total: ${allCards.length}`);
                hasMorePages = false;
            }
        }
    }
    
    console.log(`\n=== Extracción de páginas completada ===`);
    console.log(`Total de cartas extraídas de todas las páginas: ${allCards.length}`);
    
    console.log(`\nTotal de cartas extraídas: ${allCards.length}`);
    console.log('Obteniendo información completa de cada carta (esto tomará varios minutos)...\n');
    
    // Mapeo de colores al español
    const colorMap = {
        'Red': 'Rojo',
        'Blue': 'Azul',
        'Green': 'Verde',
        'Yellow': 'Amarillo',
        'Purple': 'Morado',
        'Black': 'Negro',
        'Green Red': 'Verde Rojo',
        'Blue Purple': 'Azul Morado'
    };
    
    // Función para guardar el archivo
    function saveFile(cards) {
        // Ordenar por número
        const sortedCards = [...cards].sort((a, b) => {
            const numA = a.number.includes('-') ? parseInt(a.number.split('-')[0]) : parseInt(a.number);
            const numB = b.number.includes('-') ? parseInt(b.number.split('-')[0]) : parseInt(b.number);
            if (numA !== numB) {
                return numA - numB;
            }
            // Si es el mismo número base, ordenar por versión
            return a.number.localeCompare(b.number);
        });
        
        // Generar el contenido del archivo con formato mejorado
        const fileContent = `export const op01Data = [\n${sortedCards.map(card => {
            const abilitiesStr = card.abilities.length > 0 
                ? `[${card.abilities.map(a => `'${a.replace(/'/g, "\\'")}'`).join(', ')}]`
                : '[]';
            
            const versionTypeStr = card.versionType ? `,\n        versionType: '${card.versionType}'` : '';
            
            return `    { 
        set: '${card.set}', 
        number: '${card.number}', 
        color: '${card.color}', 
        name: '${card.name}', 
        image_url: '${card.image_url}', 
        tcgplayer_url: '${card.tcgplayer_url}',
        rarity: '${card.rarity}',
        cardType: '${card.cardType}',
        cost: '${card.cost}',
        power: '${card.power}',
        subtypes: '${card.subtypes.replace(/'/g, "\\'")}',
        attribute: '${card.attribute}',
        artist: '${card.artist.replace(/'/g, "\\'")}',
        abilities: ${abilitiesStr},
        marketPrice: '${card.marketPrice}',
        mostRecentSale: '${card.mostRecentSale}'${versionTypeStr}
    }`;
        }).join(',\n')}\n];\n`;
        
        // Guardar en archivo
        fs.writeFileSync('op01.js', fileContent, 'utf8');
    }
    
    const processedCards = [];
    const saveInterval = 5; // Guardar cada 5 cartas
    
    // Obtener información completa de cada carta
    for (let i = 0; i < allCards.length; i++) {
        const card = allCards[i];
        const baseNumber = card.number.padStart(3, '0');
        console.log(`[${i + 1}/${allCards.length}] Procesando: ${card.name} (OP01-${baseNumber})`);
        
        const fullInfo = await getCardFullInfo(card.url, card.number, card.name);
        
        // Combinar información
        const color = colorMap[fullInfo.color] || fullInfo.color || 'Desconocido';
        
        // Usar el número final (con versión si aplica)
        const finalNumber = fullInfo.finalNumber || baseNumber;
        
        const processedCard = {
            set: 'OP01',
            number: finalNumber,
            color: color,
            name: card.name.replace(/'/g, "\\'"),
            image_url: fullInfo.imagePath || card.imageUrl,
            tcgplayer_url: card.url,
            rarity: fullInfo.rarity || '',
            cardType: fullInfo.cardType || '',
            cost: fullInfo.cost || '',
            power: fullInfo.power || '',
            subtypes: fullInfo.subtypes || '',
            attribute: fullInfo.attribute || '',
            artist: fullInfo.artist || '',
            abilities: fullInfo.abilities || [],
            marketPrice: fullInfo.marketPrice || '',
            mostRecentSale: fullInfo.mostRecentSale || '',
            versionType: fullInfo.versionType || ''
        };
        
        processedCards.push(processedCard);
        
        const versionInfo = fullInfo.isAlternate ? ` [${fullInfo.versionType || 'Alternate'}]` : '';
        console.log(`  Color: ${color}, Rarity: ${fullInfo.rarity || 'N/A'}, Price: $${fullInfo.marketPrice || 'N/A'}${versionInfo}, Number: ${finalNumber}`);
        
        // Guardar cada X cartas
        if (processedCards.length % saveInterval === 0 || i === allCards.length - 1) {
            saveFile(processedCards);
            console.log(`  💾 Archivo guardado (${processedCards.length}/${allCards.length} cartas procesadas)`);
        }
        
        await page.waitForTimeout(500); // Pausa para no sobrecargar el servidor
    }
    
    console.log('\n¡Extracción completada!');
    console.log(`Archivo op01.js generado con ${processedCards.length} cartas.`);
    console.log(`Imágenes guardadas en: ${imagesDir}`);
    
    await browser.close();
})();

