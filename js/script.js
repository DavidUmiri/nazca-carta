const pdfUrl = 'documents/Carta NAZCA-corregida.pdf';
const pdfContainer = document.getElementById('pdf-container');
if (!pdfContainer) {
    throw new Error('No se encontró el contenedor para el PDF');
}

const pagesToLoad = 5; // Número de páginas a cargar por bloque
let pdfDocument = null;
let currentPageNumber = 1;
let isLoadingPdf = false;
const canvasPool = new Map();
let observer = null;
let endMarker = document.createElement('div');

function getCanvas(pageNumber) {
    if (canvasPool.has(pageNumber)) {
        return canvasPool.get(pageNumber);
    }
    const canvas = document.createElement('canvas');
    canvas.setAttribute('data-page-number', pageNumber);
    canvasPool.set(pageNumber, canvas);
    return canvas;
}

async function loadPage(pageNumber) {
    if (!pdfDocument || pageNumber > pdfDocument.numPages) return;

    const page = await pdfDocument.getPage(pageNumber);
    const scaleFactor = window.devicePixelRatio || 1;
    const scale = (pdfContainer.clientWidth / page.getViewport({ scale: 1 }).width) * scaleFactor;
    const viewport = page.getViewport({ scale });

    const canvas = getCanvas(pageNumber);
    if (!pdfContainer.contains(canvas)) {
        pdfContainer.appendChild(canvas);
    }

    const context = canvas.getContext('2d', { alpha: false });

    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.style.width = `${viewport.width / scaleFactor}px`;
    canvas.style.height = `${viewport.height / scaleFactor}px`;

    await page.render({
        canvasContext: context,
        viewport,
        intent: 'display'
    }).promise;

    updateEndMarker();
}

async function loadNextPages() {
    if (isLoadingPdf || currentPageNumber > pdfDocument.numPages) return;
    isLoadingPdf = true;

    try {
        const pagesToRender = Math.min(pagesToLoad, pdfDocument.numPages - currentPageNumber + 1);
        const pagePromises = Array.from({ length: pagesToRender }, (_, i) => 
            loadPage(currentPageNumber + i)
        );

        await Promise.all(pagePromises);
        currentPageNumber += pagesToRender;

        if (currentPageNumber <= pdfDocument.numPages) {
            updateEndMarker();
        }
    } catch (error) {
        console.error('Error al cargar las páginas:', error);
    } finally {
        isLoadingPdf = false;
    }
}

function updateEndMarker() {
    if (endMarker.parentNode) {
        endMarker.remove();
    }
    endMarker = document.createElement('div');
    endMarker.id = 'pdf-end-marker';
    endMarker.style.height = '50px'; // Espaciado para detección
    pdfContainer.appendChild(endMarker);

    if (observer) {
        observer.disconnect();
    }

    observer = new IntersectionObserver(entries => {
        const lastEntry = entries[0];
        if (lastEntry.isIntersecting && !isLoadingPdf) {
            loadNextPages();
        }
    }, { root: null, rootMargin: '100px', threshold: 0.1 });

    observer.observe(endMarker);
}

async function loadPdf() {
    try {
        pdfDocument = await pdfjsLib.getDocument(pdfUrl).promise;
        loadNextPages();

        window.addEventListener('resize', () => {
            clearTimeout(window.resizingTimeout);
            window.resizingTimeout = setTimeout(() => {
                pdfContainer.innerHTML = ''; 
                canvasPool.clear();
                currentPageNumber = 1;
                loadNextPages();
            }, 300);
        });

    } catch (error) {
        console.error('Error al cargar el PDF:', error);
    }
}

document.addEventListener("DOMContentLoaded", loadPdf);
