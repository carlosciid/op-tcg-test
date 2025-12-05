// Script de prueba para extraer información completa de UNA sola carta
// Para verificar que la extracción funciona correctamente antes de procesar las 156 cartas

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

(async () => {
    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();
    
    const baseUrl = 'https://www.tcgplayer.com';
    
    console.log('=== PRUEBA DE EXTRACCIÓN DE UNA CARTA ===\n');
    
    // Navegar a la página de búsqueda
    const searchUrl = `${baseUrl}/search/one-piece-card-game/romance-dawn?productLineName=one-piece-card-game&view=grid&page=1&ProductTypeName=Cards&setName=romance-dawn`;
    console.log(`Navegando a: ${searchUrl}`);
    await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);
    
    // Extraer la primera carta de la página
    console.log('\nExtrayendo la primera carta de la lista...');
    const firstCard = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a[href*="/product/"]'));
        for (const link of links) {
            const fullText = link.textContent || '';
            const numberMatch = fullText.match(/#OP01-(\d+)/);
            if (numberMatch) {
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
                    return {
                        number: cardNumber,
                        name: name,
                        imageUrl: imageUrl,
                        url: link.href
                    };
                }
            }
        }
        return null;
    });
    
    if (!firstCard) {
        console.log('No se encontró ninguna carta OP01 en la página');
        await browser.close();
        return;
    }
    
    console.log(`\nCarta encontrada: ${firstCard.name} (OP01-${firstCard.number})`);
    console.log(`URL: ${firstCard.url}\n`);
    
    // Obtener información completa de la carta
    console.log('Obteniendo información completa de la carta...\n');
    await page.goto(firstCard.url, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);
    
    const cardInfo = await page.evaluate(() => {
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
            imageUrl: null
        };
        
        // Buscar Product Details en listas
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
        
        // Buscar habilidades - buscar en la sección de Product Details
        const productDetailsHeading = Array.from(document.querySelectorAll('h2')).find(h2 => 
            h2.textContent.includes('Product Details')
        );
        if (productDetailsHeading) {
            // Buscar el contenedor de Product Details
            let container = productDetailsHeading.parentElement;
            if (!container) {
                container = productDetailsHeading.nextElementSibling;
            }
            
            if (container) {
                // Buscar todos los elementos de texto antes de la lista
                const allElements = Array.from(container.querySelectorAll('*'));
                let foundList = false;
                
                for (const el of allElements) {
                    if (el.tagName === 'UL' || el.tagName === 'OL') {
                        foundList = true;
                        break;
                    }
                    
                    if (!foundList) {
                        const text = el.textContent?.trim() || '';
                        // Buscar habilidades que empiezan con [ o tienen formato de habilidad
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
        
        // Buscar Market Price y Most Recent Sale en tablas
        const priceTables = Array.from(document.querySelectorAll('table'));
        for (const table of priceTables) {
            const rows = Array.from(table.querySelectorAll('tr'));
            for (const row of rows) {
                const rowText = row.textContent || '';
                const cells = Array.from(row.querySelectorAll('td, th'));
                
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
        const mainImage = document.querySelector('img[alt*="OP01"], img[src*="product"][src*="453508"], img[src*="product"][src*="454550"]');
        if (mainImage) {
            info.imageUrl = mainImage.src;
        } else {
            // Buscar cualquier imagen grande
            const allImages = Array.from(document.querySelectorAll('img'));
            const productImage = allImages.find(img => {
                const src = img.src || '';
                return src.includes('product') && src.includes('_in_');
            });
            if (productImage) {
                info.imageUrl = productImage.src;
            }
        }
        
        return info;
    });
    
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
    
    const color = colorMap[cardInfo.color] || cardInfo.color || 'Desconocido';
    
    // Mostrar toda la información extraída
    console.log('=== INFORMACIÓN EXTRAÍDA ===\n');
    console.log(`Nombre: ${firstCard.name}`);
    console.log(`Número: OP01-${firstCard.number.padStart(3, '0')}`);
    console.log(`Color: ${cardInfo.color} → ${color}`);
    console.log(`Rarity: ${cardInfo.rarity || 'N/A'}`);
    console.log(`Card Type: ${cardInfo.cardType || 'N/A'}`);
    console.log(`Cost: ${cardInfo.cost || 'N/A'}`);
    console.log(`Power: ${cardInfo.power || 'N/A'}`);
    console.log(`Subtypes: ${cardInfo.subtypes || 'N/A'}`);
    console.log(`Attribute: ${cardInfo.attribute || 'N/A'}`);
    console.log(`Artist: ${cardInfo.artist || 'N/A'}`);
    console.log(`\nHabilidades (${cardInfo.abilities.length}):`);
    cardInfo.abilities.forEach((ability, i) => {
        console.log(`  ${i + 1}. ${ability}`);
    });
    console.log(`\nMarket Price: $${cardInfo.marketPrice || 'N/A'}`);
    console.log(`Most Recent Sale: $${cardInfo.mostRecentSale || 'N/A'}`);
    console.log(`\nImage URL: ${cardInfo.imageUrl || firstCard.imageUrl}`);
    console.log(`TCGPlayer URL: ${firstCard.url}`);
    
    // Crear objeto completo
    const completeCard = {
        set: 'OP01',
        number: firstCard.number.padStart(3, '0'),
        color: color,
        name: firstCard.name.replace(/'/g, "\\'"),
        image_url: cardInfo.imageUrl || firstCard.imageUrl,
        tcgplayer_url: firstCard.url,
        rarity: cardInfo.rarity || '',
        cardType: cardInfo.cardType || '',
        cost: cardInfo.cost || '',
        power: cardInfo.power || '',
        subtypes: cardInfo.subtypes || '',
        attribute: cardInfo.attribute || '',
        artist: cardInfo.artist || '',
        abilities: cardInfo.abilities || [],
        marketPrice: cardInfo.marketPrice || '',
        mostRecentSale: cardInfo.mostRecentSale || ''
    };
    
    console.log('\n=== OBJETO COMPLETO ===');
    console.log(JSON.stringify(completeCard, null, 2));
    
    await browser.close();
    
    console.log('\n=== PRUEBA COMPLETADA ===');
    console.log('Si toda la información se ve correcta, podemos proceder con las 156 cartas.');
})();

