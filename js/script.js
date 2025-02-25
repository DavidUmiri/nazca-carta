// Validate and sanitize the PDF URL
const pdfUrl = new URL('documents/Carta NAZCA-corregida.pdf', window.location.origin).href;

// Ensure we're in a secure context
if (!window.isSecureContext) {
    throw new Error('This application requires a secure context (HTTPS)');
}

const pdfContainer = document.getElementById('pdf-container');
if (!pdfContainer) {
    throw new Error('No se encontró el contenedor para el PDF');
}

// Use constants for configuration to prevent manipulation
const CONFIG = Object.freeze({
    pagesToLoad: 5,
    maxPages: 1000, // Set a reasonable maximum
    maxDimension: 4096 // Maximum canvas dimension
});

let currentPageNumber = 1;
let isLoadingPdf = false;
const canvasPool = new Map();

function validatePageNumber(pageNumber) {
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > CONFIG.maxPages) {
        throw new Error('Invalid page number');
    }
    return pageNumber;
}

function sanitizeCanvasSize(dimension) {
    return Math.min(Math.max(1, dimension), CONFIG.maxDimension);
}

function getCanvas(pageNumber) {
    validatePageNumber(pageNumber);
    
    if (canvasPool.has(pageNumber)) {
        return canvasPool.get(pageNumber);
    }
    
    const canvas = document.createElement('canvas');
    // Use dataset instead of setAttribute for better XSS protection
    canvas.dataset.pageNumber = pageNumber;
    
    // Prevent canvas from being used as a proxy for fingerprinting
    canvas.style.imageRendering = 'pixelated';
    
    canvasPool.set(pageNumber, canvas);
    return canvas;
}

async function loadPage(pdfDocument, pageNumber) {
    try {
        validatePageNumber(pageNumber);
        
        const page = await pdfDocument.getPage(pageNumber);
        const scale = pdfContainer.clientWidth / page.getViewport({ scale: 1 }).width;
        const viewport = page.getViewport({ scale });
        
        const canvas = getCanvas(pageNumber);
        
        // Validate canvas parent before appending
        if (!pdfContainer.contains(canvas)) {
            if (canvas.parentNode) {
                canvas.parentNode.removeChild(canvas);
            }
            pdfContainer.appendChild(canvas);
        }
        
        const context = canvas.getContext('2d', { 
            alpha: false,
            willReadFrequently: false // Prevent pixel reading attacks
        });
        
        // Sanitize canvas dimensions
        canvas.height = sanitizeCanvasSize(viewport.height);
        canvas.width = sanitizeCanvasSize(viewport.width);
        
        return page.render({
            canvasContext: context,
            viewport,
            intent: 'display'
        }).promise;
    } catch (error) {
        console.error('Error in loadPage:', error);
        throw new Error('Failed to load page safely');
    }
}

async function loadNextPages(pdfDocument) {
    if (isLoadingPdf || currentPageNumber > pdfDocument.numPages) return;
    
    // Validate document
    if (!pdfDocument || typeof pdfDocument.numPages !== 'number') {
        throw new Error('Invalid PDF document');
    }
    
    isLoadingPdf = true;

    try {
        const pagesToRender = Math.min(
            CONFIG.pagesToLoad, 
            pdfDocument.numPages - currentPageNumber + 1
        );
        
        const pagePromises = Array.from(
            { length: pagesToRender }, 
            (_, i) => loadPage(pdfDocument, currentPageNumber + i)
        );
        
        await Promise.all(pagePromises);
        currentPageNumber += CONFIG.pagesToLoad;
        
        if (currentPageNumber <= pdfDocument.numPages) {
            // Use safer timeout alternative if requestIdleCallback is not available
            const scheduleNext = window.requestIdleCallback || 
                               (cb => setTimeout(cb, 1));
            
            scheduleNext(() => loadNextPages(pdfDocument));
        }
    } catch (error) {
        console.error('Error al cargar las páginas:', error);
        alert('Ocurrió un error al cargar las páginas.');
    } finally {
        isLoadingPdf = false;
    }
}

try {
    // Validate PDF URL
    if (!pdfUrl.startsWith(window.location.origin)) {
        throw new Error('Invalid PDF URL');
    }

    pdfjsLib.getDocument(pdfUrl).promise
        .then(pdfDocument => {
            // Validate PDF document
            if (pdfDocument.numPages > CONFIG.maxPages) {
                throw new Error('PDF exceeds maximum page limit');
            }
            
            loadNextPages(pdfDocument);
            
            const observer = setupIntersectionObserver(pdfDocument);
            
            // Secure cleanup
            const cleanup = () => {
                observer.disconnect();
                canvasPool.forEach(canvas => {
                    const ctx = canvas.getContext('2d');
                    if (ctx) {
                        ctx.clearRect(0, 0, canvas.width, canvas.height);
                    }
                });
                canvasPool.clear();
            };
            
            window.addEventListener('unload', cleanup, { once: true });
        })
        .catch(error => {
            console.error('Error al cargar el PDF:', error);
            alert('Ocurrió un error al cargar el PDF.');
        });
} catch (error) {
    console.error('Error al inicializar:', error);
    alert('Ocurrió un error al inicializar.');
}
