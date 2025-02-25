const pdfUrl = 'documents/Carta NAZCA-corregida.pdf';
const pdfContainer = document.getElementById('pdf-container');
if (!pdfContainer) {
    throw new Error('No se encontró el contenedor para el PDF');
}

const pagesToLoad = 5;
let currentPageNumber = 1;
let isLoadingPdf = false;
const canvasPool = new Map();

function getCanvas(pageNumber) {
    if (canvasPool.has(pageNumber)) {
        return canvasPool.get(pageNumber);
    }
    const canvas = document.createElement('canvas');
    canvas.setAttribute('data-page-number', pageNumber);
    canvasPool.set(pageNumber, canvas);
    return canvas;
}

async function loadPage(pdfDocument, pageNumber) {
    const page = await pdfDocument.getPage(pageNumber);
    const scale = pdfContainer.clientWidth / page.getViewport({ scale: 1 }).width;
    const viewport = page.getViewport({ scale });
    
    const canvas = getCanvas(pageNumber);
    if (!pdfContainer.contains(canvas)) {
        pdfContainer.appendChild(canvas);
    }
    
    const context = canvas.getContext('2d', { alpha: false }); // Optimization for non-transparent PDFs
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    
    return page.render({
        canvasContext: context,
        viewport,
        intent: 'display' // Optimize for screen display
    }).promise;
}

async function loadNextPages(pdfDocument) {
    if (isLoadingPdf || currentPageNumber > pdfDocument.numPages) return;
    isLoadingPdf = true;

    try {
        const pagesToRender = Math.min(pagesToLoad, pdfDocument.numPages - currentPageNumber + 1);
        const pagePromises = Array.from({ length: pagesToRender }, (_, i) => 
            loadPage(pdfDocument, currentPageNumber + i)
        );
        
        await Promise.all(pagePromises);
        currentPageNumber += pagesToLoad;
        
        if (currentPageNumber <= pdfDocument.numPages) {
            // Use requestIdleCallback for non-urgent next page loads
            window.requestIdleCallback(() => loadNextPages(pdfDocument));
        }
    } catch (error) {
        console.error('Error al cargar las páginas:', error);
        alert('Ocurrió un error al cargar las páginas.');
    } finally {
        isLoadingPdf = false;
    }
}

try {
    pdfjsLib.getDocument(pdfUrl).promise.then(pdfDocument => {
        loadNextPages(pdfDocument);
        
        // Use Intersection Observer instead of scroll event
        const observer = setupIntersectionObserver(pdfDocument);
        
        // Cleanup function
        window.addEventListener('unload', () => {
            observer.disconnect();
            canvasPool.clear();
        });
    });
} catch (error) {
    console.error('Error al cargar el PDF:', error);
    alert('Ocurrió un error al cargar el PDF.');
}
